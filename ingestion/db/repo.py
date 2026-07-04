"""Data-access layer: upserts, raw-post bookkeeping, run tracking, schema check."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Engine, func, inspect, select, update
from sqlalchemy.dialects.postgresql import insert

from ..models import ExtractedListing, RawPost, RunStats
from . import tables

log = logging.getLogger(__name__)


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.strip().lower())).strip("-")


def _normalize_group_url(url: Optional[str]) -> Optional[str]:
    return url.rstrip("/") if url else url


class SchemaError(RuntimeError):
    pass


class Repo:
    def __init__(self, engine: Engine):
        self.engine = engine
        # group_url -> (city_id, city_name); loaded lazily, refreshable.
        self._group_city_cache: dict[str, tuple[int, str]] | None = None

    # -- schema --------------------------------------------------------
    def schema_check(self) -> None:
        """Fail fast if the live DB is missing tables/columns Python writes.
        The web app (Drizzle) owns migrations; this catches drift early."""
        inspector = inspect(self.engine)
        existing_tables = set(inspector.get_table_names())
        for table, expected_cols in tables.EXPECTED_COLUMNS.items():
            if table not in existing_tables:
                raise SchemaError(
                    f"Table '{table}' missing. Run the web app's Drizzle "
                    f"migrations: cd web && npm run db:migrate"
                )
            actual = {c["name"] for c in inspector.get_columns(table)}
            missing = expected_cols - actual
            if missing:
                raise SchemaError(
                    f"Table '{table}' missing columns {sorted(missing)}. "
                    f"Run the web app's Drizzle migrations."
                )

    # -- raw posts -----------------------------------------------------
    def insert_raw_post(self, post: RawPost) -> bool:
        """Insert a raw post; return True if newly inserted (not a duplicate).
        Dedup on (source, source_id) happens here, before any LLM call."""
        stmt = (
            insert(tables.raw_posts)
            .values(
                source=post.source,
                source_id=post.source_id,
                source_group=post.source_group,
                source_url=post.source_url,
                text=post.text,
                posted_at=post.posted_at,
                scraped_at=datetime.now(timezone.utc),
                author_name=post.author_name,
                author_url=post.author_url,
                meta=post.meta or None,
            )
            .on_conflict_do_nothing(index_elements=["source", "source_id"])
            .returning(tables.raw_posts.c.id)
        )
        with self.engine.begin() as conn:
            row = conn.execute(stmt).first()
        return row is not None

    def unprocessed_raw_posts(self, source: Optional[str] = None) -> list[dict[str, Any]]:
        stmt = select(tables.raw_posts).where(
            tables.raw_posts.c.processed_at.is_(None)
        )
        if source:
            stmt = stmt.where(tables.raw_posts.c.source == source)
        with self.engine.connect() as conn:
            return [dict(r._mapping) for r in conn.execute(stmt)]

    def mark_processed(self, source: str, source_id: str) -> None:
        stmt = (
            update(tables.raw_posts)
            .where(
                tables.raw_posts.c.source == source,
                tables.raw_posts.c.source_id == source_id,
            )
            .values(processed_at=datetime.now(timezone.utc))
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    # -- city / group registry ----------------------------------------
    def _group_city_map(self) -> dict[str, tuple[int, str]]:
        if self._group_city_cache is None:
            stmt = select(
                tables.groups.c.url,
                tables.groups.c.city_id,
                tables.cities.c.name,
            ).select_from(
                tables.groups.join(
                    tables.cities, tables.groups.c.city_id == tables.cities.c.id
                )
            )
            with self.engine.connect() as conn:
                self._group_city_cache = {
                    _normalize_group_url(r.url): (r.city_id, r.name)
                    for r in conn.execute(stmt)
                }
        return self._group_city_cache

    def city_for_group(self, source_group: Optional[str]) -> tuple[Optional[int], Optional[str]]:
        """Resolve (city_id, city_name) for a listing's group URL. Unregistered
        groups return (None, None) so the LLM city is used as a fallback name."""
        key = _normalize_group_url(source_group)
        if not key:
            return None, None
        return self._group_city_map().get(key, (None, None))

    def list_enabled_groups(self) -> list[dict[str, Any]]:
        """Enabled groups whose city is also enabled — what `run` scrapes."""
        stmt = (
            select(
                tables.groups.c.id,
                tables.groups.c.url,
                tables.groups.c.name,
                tables.groups.c.fb_group_id,
                tables.groups.c.city_id,
                tables.cities.c.name.label("city_name"),
            )
            .select_from(
                tables.groups.join(
                    tables.cities, tables.groups.c.city_id == tables.cities.c.id
                )
            )
            .where(tables.groups.c.enabled.is_(True), tables.cities.c.enabled.is_(True))
        )
        with self.engine.connect() as conn:
            return [dict(r._mapping) for r in conn.execute(stmt)]

    def get_or_create_city(self, name: str, enabled: bool = True) -> int:
        slug = slugify(name)
        with self.engine.begin() as conn:
            existing = conn.execute(
                select(tables.cities.c.id).where(tables.cities.c.slug == slug)
            ).scalar_one_or_none()
            if existing is not None:
                return existing
            return conn.execute(
                insert(tables.cities)
                .values(name=name, slug=slug, enabled=enabled, display_order=0)
                .returning(tables.cities.c.id)
            ).scalar_one()

    def add_group(self, url: str, city_name: str, fb_group_id: Optional[str] = None) -> None:
        city_id = self.get_or_create_city(city_name)
        stmt = (
            insert(tables.groups)
            .values(
                city_id=city_id,
                url=_normalize_group_url(url),
                fb_group_id=fb_group_id,
                enabled=True,
            )
            .on_conflict_do_update(
                index_elements=["url"],
                set_={"city_id": city_id, "fb_group_id": fb_group_id, "enabled": True},
            )
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)
        self._group_city_cache = None  # invalidate

    # -- listings ------------------------------------------------------
    def upsert_listing(
        self,
        post: RawPost,
        extracted: ExtractedListing,
        lat: Optional[float],
        lon: Optional[float],
        is_rental: bool = True,
    ) -> None:
        """Insert or update a listing. City is derived from the group (source of
        truth); the LLM city is only a fallback name. On conflict, refresh
        extracted/geocoded fields + scraped_at, but NEVER touch `status`."""
        rent = int(extracted.rent) if extracted.rent else None
        city_id, city_name = self.city_for_group(post.source_group)
        values = {
            "source": post.source,
            "source_id": post.source_id,
            "source_url": post.source_url,
            "source_group": post.source_group,
            "posted_at": post.posted_at or datetime.now(timezone.utc),
            "scraped_at": datetime.now(timezone.utc),
            "location": extracted.location,
            "city": city_name or extracted.city,
            "city_id": city_id,
            "rent": rent,
            "bhk": extracted.bhk,
            "gender_preference": extracted.gender_preference,
            "furnishing_status": extracted.furnishing_status,
            "additional_details": extracted.additional_details,
            "latitude": lat,
            "longitude": lon,
            "original_text": post.text,
            "contact_name": post.author_name,
            "contact_url": post.author_url or post.source_url,
            "is_rental": is_rental,
        }
        stmt = insert(tables.listings).values(**values)
        update_cols = {
            k: getattr(stmt.excluded, k)
            for k in values
            if k not in ("source", "source_id")
        }
        stmt = stmt.on_conflict_do_update(
            index_elements=["source", "source_id"], set_=update_cols
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    # -- scrape runs ---------------------------------------------------
    def start_run(self, source: str, target: str) -> int:
        stmt = (
            insert(tables.scrape_runs)
            .values(
                source=source,
                target=target,
                started_at=datetime.now(timezone.utc),
                posts_seen=0,
                posts_new=0,
                listings_upserted=0,
                status="running",
            )
            .returning(tables.scrape_runs.c.id)
        )
        with self.engine.begin() as conn:
            return conn.execute(stmt).scalar_one()

    def finish_run(
        self, run_id: int, stats: RunStats, status: str, error: Optional[str] = None
    ) -> None:
        stmt = (
            update(tables.scrape_runs)
            .where(tables.scrape_runs.c.id == run_id)
            .values(
                finished_at=datetime.now(timezone.utc),
                posts_seen=stats.posts_seen,
                posts_new=stats.posts_new,
                listings_upserted=stats.listings_upserted,
                status=status,
                error=error,
            )
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def count_listings(self) -> int:
        with self.engine.connect() as conn:
            return conn.execute(
                select(func.count()).select_from(tables.listings)
            ).scalar_one()
