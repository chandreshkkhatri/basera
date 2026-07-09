"""One-off backfill: re-check the intent of existing listings.

The feed originally admitted any "rental" post, including seeker/buyer posts
("looking for a 2BHK"). This re-runs the intent classifier over listings
currently flagged is_offer=true and flips seekers/non-rentals to is_offer=false
so they drop out of the feed. Idempotent: safe to re-run, and only ever flips
true -> false (never resurfaces a post).

    python -m ingestion reclassify [--limit N] [--dry-run] [--workers N]
"""

from __future__ import annotations

import concurrent.futures
import logging
import threading

from ..config import Settings
from ..db.engine import get_engine
from ..db.repo import Repo
from ..llm import LLMClient, QuotaExceededError

log = logging.getLogger(__name__)


def reclassify(settings: Settings, *, limit: int | None, dry_run: bool, workers: int) -> int:
    settings.require("facebook")  # ensures the LLM key is present
    repo = Repo(get_engine(settings))
    repo.schema_check()
    llm = LLMClient(settings)

    rows = repo.offer_candidates(limit=limit)
    log.info("Re-checking intent for %d listing(s)%s", len(rows),
             " (dry run)" if dry_run else "")

    lock = threading.Lock()
    quota_hit = threading.Event()
    counts = {"offer": 0, "seek": 0, "not_rental": 0, "errors": 0}

    def work(row: tuple[int, str]) -> None:
        if quota_hit.is_set():
            return
        listing_id, text = row
        try:
            category = llm.classify_post(text or "")
        except QuotaExceededError:
            quota_hit.set()
            return
        except Exception as e:  # noqa: BLE001
            log.warning("classify failed for listing %s: %s", listing_id, e)
            with lock:
                counts["errors"] += 1
            return
        with lock:
            counts[category] += 1
        if category != "offer" and not dry_run:
            repo.set_listing_offer(listing_id, False)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, rows))

    flipped = counts["seek"] + counts["not_rental"]
    log.info(
        "Reclassify complete: kept=%d flipped=%d (seek=%d not_rental=%d) errors=%d%s",
        counts["offer"], flipped, counts["seek"], counts["not_rental"],
        counts["errors"], " [dry run — nothing written]" if dry_run else "",
    )
    if quota_hit.is_set():
        log.error("Stopped early — LLM quota exceeded. Re-run to continue.")
        return 3
    return 0
