"""One-off importer: legacy scraper/results/*.json -> Postgres.

Idempotent (same upserts as live ingestion). Restores the FULL original text by
joining each result record against the group's facebook_raw_posts.json on
message_id (the results file truncates to 200 chars). Distance/duration columns
are dropped — the web app computes distance per query.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ..config import Settings
from ..db.engine import get_engine
from ..db.repo import Repo
from ..models import ExtractedListing, RawPost

log = logging.getLogger(__name__)


def _read_json(path: Path) -> list:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception as e:  # noqa: BLE001
        log.warning("Could not read %s: %s", path, e)
        return []


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        return None


def _telegram_source_id(record: dict) -> str:
    link = record.get("telegram_link") or ""
    m = None
    import re

    m = re.search(r"/c/(\d+)/(\d+)", link)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    m2 = re.search(r"t\.me/[^/]+/(\d+)", link)
    if m2 and record.get("message_id") is not None:
        return f"tg:{record['message_id']}"
    text = record.get("original_message", "") or ""
    import hashlib

    return "tg_hash_" + hashlib.md5(text.encode("utf-8")).hexdigest()[:16]


def _extracted_from(record: dict) -> ExtractedListing:
    return ExtractedListing.model_validate(
        {
            "location": record.get("location"),
            "city": record.get("city"),
            "rent": record.get("rent"),
            "bhk": record.get("bhk"),
            "gender_preference": record.get("gender_preference", "any"),
            "furnishing_status": record.get("furnishing_status", "unfurnished"),
            "additional_details": record.get("additional_details"),
        }
    )


def _import_records(
    repo: Repo,
    records: list,
    source: str,
    *,
    full_text_by_id: dict[str, str] | None = None,
) -> int:
    imported = 0
    for record in records:
        if not record.get("location"):
            continue
        if source == "facebook":
            source_id = str(record.get("message_id"))
            source_url = record.get("post_url") or None
            source_group = record.get("group_name")
        elif source == "telegram":
            source_id = _telegram_source_id(record)
            source_url = record.get("telegram_link") or None
            source_group = record.get("group_name")
        else:  # whatsapp
            import hashlib

            text = record.get("original_message", "") or ""
            source_id = "wa_hash_" + hashlib.md5(text.encode("utf-8")).hexdigest()[:16]
            source_url = None
            source_group = record.get("group_name")

        full_text = (
            (full_text_by_id or {}).get(str(record.get("message_id")))
            or record.get("original_message")
            or record.get("location")
            or ""
        )
        post = RawPost(
            source=source,
            source_id=source_id,
            text=full_text,
            posted_at=_parse_date(record.get("date")),
            source_group=source_group,
            source_url=source_url,
            author_name=None,
            author_url=source_url,
            meta={"backfilled": True},
        )
        extracted = _extracted_from(record)
        lat = record.get("latitude")
        lon = record.get("longitude")
        repo.upsert_listing(post, extracted, lat, lon, is_rental=True)
        # Record a processed raw post so counts/analyze stay consistent.
        if repo.insert_raw_post(post):
            repo.mark_processed(source, source_id)
        imported += 1
    return imported


def backfill(results_dir: str, settings: Settings) -> int:
    root = Path(results_dir)
    if not root.exists():
        log.error("Results directory not found: %s", root)
        return 1

    engine = get_engine(settings)
    repo = Repo(engine)
    repo.schema_check()

    total = 0

    # Facebook: per-group directories.
    for group_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        results_file = group_dir / "facebook_results.json"
        if not results_file.exists():
            continue
        raw_posts = _read_json(group_dir / "facebook_raw_posts.json")
        full_text_by_id = {
            str(p.get("message_id")): p.get("text", "")
            for p in raw_posts
            if p.get("message_id")
        }
        records = _read_json(results_file)
        n = _import_records(repo, records, "facebook", full_text_by_id=full_text_by_id)
        log.info("Facebook '%s': imported %d listings", group_dir.name, n)
        total += n

        # Insert unmatched raw posts so `analyze` can pick them up later.
        for p in raw_posts:
            mid = str(p.get("message_id") or "")
            if not mid:
                continue
            repo.insert_raw_post(
                RawPost(
                    source="facebook",
                    source_id=mid,
                    text=p.get("text", ""),
                    posted_at=_parse_date(str(p.get("timestamp", ""))),
                    source_group=p.get("group_name"),
                    source_url=p.get("post_url") or None,
                    meta={"backfilled": True, "html_file": p.get("html_file")},
                )
            )

    # Telegram / WhatsApp: root-level result files.
    tg = root / "house_hunting_results.json"
    if tg.exists():
        n = _import_records(repo, _read_json(tg), "telegram")
        log.info("Telegram: imported %d listings", n)
        total += n

    wa = root / "whatsapp_house_hunting_results.json"
    if wa.exists():
        n = _import_records(repo, _read_json(wa), "whatsapp")
        log.info("WhatsApp: imported %d listings", n)
        total += n

    log.info("Backfill complete. Total listings imported: %d", total)
    log.info("Listings now in DB: %d", repo.count_listings())
    return 0
