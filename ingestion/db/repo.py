"""Data-access layer: upserts, raw-post bookkeeping, run tracking, schema check."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import Engine, and_, delete, func, inspect, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from ..models import ExtractedListing, RawPost, RunStats
from . import tables

log = logging.getLogger(__name__)


def slugify(name: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.strip().lower())).strip("-")


def _normalize_group_url(url: Optional[str]) -> Optional[str]:
    return url.rstrip("/") if url else url


def _parse_retry_at(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


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
            rows = [dict(r) for r in conn.execute(stmt).mappings()]

        now = datetime.now(timezone.utc)
        ready_rows: list[dict[str, Any]] = []
        for row in rows:
            meta = row.get("meta") or {}
            next_retry_at = _parse_retry_at(meta.get("next_retry_at"))
            if next_retry_at is None or next_retry_at <= now:
                ready_rows.append(row)
        return ready_rows

    def mark_processed(self, source: str, source_id: str, *, status: str = "processed") -> None:
        with self.engine.begin() as conn:
            row = conn.execute(
                select(tables.raw_posts.c.meta).where(
                    tables.raw_posts.c.source == source,
                    tables.raw_posts.c.source_id == source_id,
                )
            ).mappings().first()
            meta = dict(row["meta"] or {}) if row else {}
            meta["processing_status"] = status
            meta.pop("next_retry_at", None)
            if status != "failed":
                meta.pop("last_error", None)
                meta.pop("last_error_at", None)
            conn.execute(
                update(tables.raw_posts)
                .where(
                    tables.raw_posts.c.source == source,
                    tables.raw_posts.c.source_id == source_id,
                )
                .values(processed_at=datetime.now(timezone.utc), meta=meta or None)
            )

    def load_retryable_raw_post(self, source: str, source_id: str) -> Optional[RawPost]:
        stmt = select(tables.raw_posts).where(
            tables.raw_posts.c.source == source,
            tables.raw_posts.c.source_id == source_id,
            tables.raw_posts.c.processed_at.is_(None),
        )
        with self.engine.connect() as conn:
            row = conn.execute(stmt).mappings().first()
        if not row:
            return None

        meta = row["meta"] or {}
        next_retry_at = _parse_retry_at(meta.get("next_retry_at"))
        now = datetime.now(timezone.utc)
        if next_retry_at is not None and next_retry_at > now:
            return None

        return RawPost(
            source=row["source"],
            source_id=row["source_id"],
            text=row["text"],
            posted_at=row["posted_at"],
            source_group=row["source_group"],
            source_url=row["source_url"],
            author_name=row["author_name"],
            author_url=row["author_url"],
            meta=meta,
        )

    def record_processing_failure(
        self,
        source: str,
        source_id: str,
        error: str,
        *,
        retryable: bool,
        max_attempts: int,
        backoff_s: int,
    ) -> bool:
        now = datetime.now(timezone.utc)
        with self.engine.begin() as conn:
            row = conn.execute(
                select(tables.raw_posts.c.meta).where(
                    tables.raw_posts.c.source == source,
                    tables.raw_posts.c.source_id == source_id,
                )
            ).mappings().first()
            meta = dict(row["meta"] or {}) if row else {}

            attempts = int(meta.get("analysis_attempts") or 0) + 1
            meta["analysis_attempts"] = attempts
            meta["last_error"] = error
            meta["last_error_at"] = now.isoformat()

            should_retry = retryable and attempts < max_attempts
            values: dict[str, Any] = {"meta": meta}

            if should_retry:
                retry_at = now + timedelta(seconds=backoff_s * (2 ** (attempts - 1)))
                meta["processing_status"] = "retry_scheduled"
                meta["next_retry_at"] = retry_at.isoformat()
            else:
                meta["processing_status"] = "failed"
                meta.pop("next_retry_at", None)
                values["processed_at"] = now

            conn.execute(
                update(tables.raw_posts)
                .where(
                    tables.raw_posts.c.source == source,
                    tables.raw_posts.c.source_id == source_id,
                )
                .values(**values)
            )
        return should_retry

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
            return [dict(r) for r in conn.execute(stmt).mappings()]

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

    def delete_group(self, url: str) -> bool:
        stmt = (
            delete(tables.groups)
            .where(tables.groups.c.url == _normalize_group_url(url))
            .returning(tables.groups.c.id)
        )
        with self.engine.begin() as conn:
            deleted = conn.execute(stmt).first() is not None
        if deleted:
            self._group_city_cache = None
        return deleted

    # -- listings ------------------------------------------------------
    def upsert_listing(
        self,
        post: RawPost,
        extracted: ExtractedListing,
        lat: Optional[float],
        lon: Optional[float],
        is_rental: bool = True,
        is_offer: bool = True,
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
            "is_offer": is_offer,
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

    def offer_candidates(self, limit: Optional[int] = None) -> list[tuple[int, str]]:
        """(id, original_text) for listings currently flagged as offers — the
        set the intent backfill re-checks."""
        stmt = select(tables.listings.c.id, tables.listings.c.original_text).where(
            tables.listings.c.is_offer.is_(True)
        ).order_by(tables.listings.c.id)
        if limit:
            stmt = stmt.limit(limit)
        with self.engine.connect() as conn:
            return [(r.id, r.original_text) for r in conn.execute(stmt)]

    def set_listing_offer(self, listing_id: int, is_offer: bool) -> None:
        stmt = (
            update(tables.listings)
            .where(tables.listings.c.id == listing_id)
            .values(is_offer=is_offer)
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

    # -- alerts (outbox) -------------------------------------------------
    # Rows are always recorded; delivery_status tracks the outbox lifecycle:
    # pending -> sending (claimed, 5-min lease) -> sent | failed, or
    # suppressed (recorded but deliberately not delivered).

    ALERT_SENDING_LEASE = timedelta(minutes=5)

    def insert_alert(
        self,
        *,
        category: str,
        message: str,
        severity: str,
        source: str = "ingestion",
        details: Optional[dict] = None,
        run_id: Optional[int] = None,
        delivery_status: str = "pending",
    ) -> int:
        stmt = (
            insert(tables.alerts)
            .values(
                category=category,
                severity=severity,
                source=source,
                message=message,
                details=details,
                run_id=run_id,
                created_at=datetime.now(timezone.utc),
                delivery_status=delivery_status,
                delivery_attempts=0,
            )
            .returning(tables.alerts.c.id)
        )
        with self.engine.begin() as conn:
            return conn.execute(stmt).scalar_one()

    def last_alert_at(self, category: str) -> Optional[datetime]:
        """Most recent non-suppressed alert of a category (cooldown probe).
        Suppressed rows must not refresh the cooldown, or a persistent failure
        would never re-alert once throttled."""
        stmt = select(func.max(tables.alerts.c.created_at)).where(
            tables.alerts.c.category == category,
            tables.alerts.c.delivery_status != "suppressed",
        )
        with self.engine.connect() as conn:
            return conn.execute(stmt).scalar_one_or_none()

    def claim_pending_alerts(
        self, *, batch: int, max_attempts: int
    ) -> list[dict[str, Any]]:
        """Atomically claim undelivered alerts for sending. Flips rows to
        'sending' so concurrent flushers can't double-send; crashed claims are
        reclaimed after the lease expires (worst case: one duplicate message)."""
        now = datetime.now(timezone.utc)
        a = tables.alerts.c
        claimable = (
            select(tables.alerts.c.id)
            .where(
                or_(
                    a.delivery_status == "pending",
                    and_(
                        a.delivery_status == "sending",
                        a.last_attempt_at < now - self.ALERT_SENDING_LEASE,
                    ),
                ),
                a.delivery_attempts < max_attempts,
            )
            .order_by(a.created_at)
            .limit(batch)
            .with_for_update(skip_locked=True)
        )
        stmt = (
            update(tables.alerts)
            .where(a.id.in_(claimable))
            .values(
                delivery_status="sending",
                delivery_attempts=a.delivery_attempts + 1,
                last_attempt_at=now,
            )
            .returning(
                a.id, a.category, a.severity, a.message, a.details,
                a.created_at, a.delivery_attempts,
            )
        )
        with self.engine.begin() as conn:
            return [dict(r) for r in conn.execute(stmt).mappings()]

    def mark_alert_sent(self, alert_id: int) -> None:
        stmt = (
            update(tables.alerts)
            .where(tables.alerts.c.id == alert_id)
            .values(
                delivery_status="sent",
                delivered_at=datetime.now(timezone.utc),
                delivery_error=None,
            )
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def mark_alert_delivery_failed(
        self, alert_id: int, error: str, *, final: bool
    ) -> None:
        stmt = (
            update(tables.alerts)
            .where(tables.alerts.c.id == alert_id)
            .values(
                delivery_status="failed" if final else "pending",
                delivery_error=error[:500],
            )
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def mark_alert_suppressed(self, alert_id: int, reason: str) -> None:
        stmt = (
            update(tables.alerts)
            .where(tables.alerts.c.id == alert_id)
            .values(delivery_status="suppressed", delivery_error=reason[:500])
        )
        with self.engine.begin() as conn:
            conn.execute(stmt)

    def recent_alerts(self, limit: int = 20) -> list[dict[str, Any]]:
        a = tables.alerts.c
        stmt = (
            select(
                a.id, a.category, a.severity, a.message,
                a.created_at, a.delivery_status, a.delivered_at, a.delivery_error,
            )
            .order_by(a.created_at.desc())
            .limit(limit)
        )
        with self.engine.connect() as conn:
            return [dict(r) for r in conn.execute(stmt).mappings()]

    # -- watchdog --------------------------------------------------------
    def run_health(self) -> dict[str, Optional[datetime]]:
        """Freshness signals for the stale-data watchdog."""
        r = tables.scrape_runs.c
        with self.engine.connect() as conn:
            last_success = conn.execute(
                select(func.max(r.started_at)).where(r.status == "success")
            ).scalar_one_or_none()
            last_yield = conn.execute(
                select(func.max(r.started_at)).where(r.posts_new > 0)
            ).scalar_one_or_none()
        return {"last_success_at": last_success, "last_yield_at": last_yield}
