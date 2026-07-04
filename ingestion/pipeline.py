"""The shared ingestion pipeline: classify -> extract -> geocode -> upsert."""

from __future__ import annotations

import concurrent.futures
import logging
import threading
from typing import Iterator, Optional

from .db.repo import Repo
from .geocode import Geocoder
from .llm import LLMClient, QuotaExceededError, RetryableLLMError
from .models import RawPost, RunStats
from .sources.base import Source

log = logging.getLogger(__name__)


class Pipeline:
    def __init__(self, llm: LLMClient, geocoder: Geocoder, repo: Repo):
        self.llm = llm
        self.geocoder = geocoder
        self.repo = repo

    def process(self, post: RawPost, stats: RunStats) -> bool:
        """Classify, extract, geocode and upsert one raw post. Returns True if a
        listing was upserted. Marks the raw post processed either way. Raises
        QuotaExceededError up to the caller so it can stop the run."""
        is_rental = self.llm.classify_rental(post.text)
        if not is_rental:
            stats.not_rental += 1
            self.repo.mark_processed(post.source, post.source_id, status="not_rental")
            return False

        try:
            extracted = self.llm.extract_listing(post.text)
        except RetryableLLMError as e:
            stats.extraction_failed += 1
            will_retry = self.repo.record_processing_failure(
                post.source,
                post.source_id,
                str(e),
                retryable=True,
                max_attempts=self.llm.settings.processing_max_attempts,
                backoff_s=self.llm.settings.processing_retry_backoff_s,
            )
            if will_retry:
                log.warning("Retry scheduled for %s: %s", post.source_id, e)
            else:
                log.error("Giving up on %s after repeated LLM failures: %s", post.source_id, e)
            return False

        if not extracted or not extracted.location:
            stats.extraction_failed += 1
            will_retry = self.repo.record_processing_failure(
                post.source,
                post.source_id,
                "LLM extraction returned no location",
                retryable=True,
                max_attempts=self.llm.settings.processing_max_attempts,
                backoff_s=self.llm.settings.processing_retry_backoff_s,
            )
            if will_retry:
                log.warning("Retry scheduled for incomplete extraction: %s", post.source_id)
            return False

        lat = lon = None
        coords = self.geocoder.geocode(extracted.location, extracted.city)
        if coords:
            lat, lon = coords
        else:
            stats.geocode_failed += 1

        self.repo.upsert_listing(post, extracted, lat, lon, is_rental=True)
        self.repo.mark_processed(post.source, post.source_id, status="processed")
        stats.listings_upserted += 1
        log.info(
            "Upserted %s listing: %s, %s (rent=%s)",
            post.source, extracted.location, extracted.city, extracted.rent,
        )
        return True

    def process_many(self, posts: list[RawPost], workers: int) -> RunStats:
        """Parallel analysis of already-captured raw posts (the `analyze` path).
        Ported from facebook_bot.py's ThreadPoolExecutor, with a shared quota
        flag and thread-safe stat updates."""
        stats = RunStats(posts_seen=len(posts))
        lock = threading.Lock()
        quota_hit = threading.Event()

        def work(post: RawPost) -> None:
            if quota_hit.is_set():
                return
            try:
                local_stats = RunStats()
                self.process(post, local_stats)
                with lock:
                    stats.posts_new += 1
                    stats.not_rental += local_stats.not_rental
                    stats.extraction_failed += local_stats.extraction_failed
                    stats.geocode_failed += local_stats.geocode_failed
                    stats.listings_upserted += local_stats.listings_upserted
            except QuotaExceededError as qe:
                if not quota_hit.is_set():
                    log.error("Quota exceeded during analyze: %s", qe)
                quota_hit.set()
            except Exception as e:  # noqa: BLE001
                log.warning("Error analyzing %s: %s", post.source_id, e)

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
            list(ex.map(work, posts))
        return stats


def run_source(
    source: Source,
    pipeline: Pipeline,
    repo: Repo,
    *,
    target: Optional[str],
    limit: Optional[int] = None,
    scrape_only: bool = False,
) -> RunStats:
    """Drive a source end-to-end and record a scrape_runs row.

    For each post: insert into raw_posts (dedup here). If new and not
    scrape_only, run the pipeline. The scrape_runs row is finalized in a
    `finally` so a crash still records status.
    """
    stats = RunStats()
    run_target = target or getattr(source, "name", "unknown")
    run_id = repo.start_run(source.name, run_target)
    status = "success"
    error: Optional[str] = None

    try:
        posts: Iterator[RawPost] = source.iter_posts(target=target, limit=limit)
        for post in posts:
            stats.posts_seen += 1
            is_new = repo.insert_raw_post(post)
            if not is_new:
                if scrape_only:
                    continue
                pending = repo.load_retryable_raw_post(post.source, post.source_id)
                if pending is None:
                    continue
                post = pending
            else:
                stats.posts_new += 1
            if scrape_only:
                continue
            try:
                pipeline.process(post, stats)
            except QuotaExceededError as qe:
                status = "quota_exceeded"
                error = str(qe)
                log.error("Stopping run — quota exceeded: %s", qe)
                break
    except Exception as e:  # noqa: BLE001
        status = "error"
        error = str(e)
        log.exception("Run failed: %s", e)
    finally:
        repo.finish_run(run_id, stats, status, error)
        log.info("Run complete [%s]: %s", status, stats.summary())

    return stats
