"""Data-access layer: upserts, raw-post bookkeeping, run tracking, schema check."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Engine, func, inspect, select, update
from sqlalchemy.dialects.postgresql import insert

from ..models import ExtractedListing, RawPost, RunStats
from . import tables

log = logging.getLogger(__name__)


class SchemaError(RuntimeError):
    pass


class Repo:
    def __init__(self, engine: Engine):
        self.engine = engine

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

    # -- listings ------------------------------------------------------
    def upsert_listing(
        self,
        post: RawPost,
        extracted: ExtractedListing,
        lat: Optional[float],
        lon: Optional[float],
        is_rental: bool = True,
    ) -> None:
        """Insert or update a listing. On conflict, refresh extracted/geocoded
        fields + scraped_at, but NEVER touch `status` (app/user-owned)."""
        rent = int(extracted.rent) if extracted.rent else None
        values = {
            "source": post.source,
            "source_id": post.source_id,
            "source_url": post.source_url,
            "source_group": post.source_group,
            "posted_at": post.posted_at or datetime.now(timezone.utc),
            "scraped_at": datetime.now(timezone.utc),
            "location": extracted.location,
            "city": extracted.city,
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
