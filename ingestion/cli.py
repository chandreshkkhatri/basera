"""Command-line interface for the ingestion engine.

    python -m ingestion run [--group URL] [--posts N] [--scrape-only] [--api]
    python -m ingestion analyze [--workers N]
    python -m ingestion backfill [--results-dir scraper/results]
    python -m ingestion groups list | add <url> --city <name>
    python -m ingestion check
"""

from __future__ import annotations

import argparse
import logging
import sys

from .config import load_settings
from .logging_setup import configure_logging

log = logging.getLogger("ingestion")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ingestion", description="Basera ingestion engine")
    parser.add_argument("-v", "--verbose", action="store_true", help="debug logging")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="scrape Facebook groups into the database")
    run.add_argument("source", nargs="?", choices=["facebook"], default="facebook")
    run.add_argument("--limit", type=int, help="max posts per group")
    run.add_argument("--posts", type=int, help="alias for --limit")
    run.add_argument("--scrape-only", action="store_true",
                     help="capture raw posts without LLM analysis")
    run.add_argument("--group", type=str,
                     help="scrape only this group URL (default: all enabled groups)")
    run.add_argument("--api", action="store_true", help="Graph API mode")

    analyze = sub.add_parser("analyze", help="LLM-analyze unprocessed raw posts")
    analyze.add_argument("--workers", type=int)

    backfill = sub.add_parser("backfill", help="import scraper/results/*.json")
    backfill.add_argument("--results-dir", default="scraper/results")

    groups = sub.add_parser("groups", help="manage the Facebook group registry")
    groups.add_argument("action", choices=["list", "add"])
    groups.add_argument("url", nargs="?")
    groups.add_argument("--city", type=str, help="city to assign the group to (add)")
    groups.add_argument("--fb-group-id", type=str, help="Graph API group id (add)")

    sub.add_parser("check", help="validate settings, DB connectivity and schema")
    return parser


def _cmd_run(args, settings) -> int:
    from .db.engine import get_engine
    from .db.repo import Repo
    from .geocode import Geocoder
    from .llm import LLMClient
    from .pipeline import Pipeline, run_source
    from .sources.facebook import FacebookSource, GroupLock

    settings.require("facebook")
    engine = get_engine(settings)
    repo = Repo(engine)
    repo.schema_check()

    pipeline = Pipeline(LLMClient(settings), Geocoder(settings), repo)
    limit = args.limit or args.posts

    # Which groups to scrape: an explicit --group, else all enabled groups whose
    # city is enabled (registered via /admin or `ingestion groups add`).
    if args.group:
        targets = [args.group]
    else:
        targets = [g["url"] for g in repo.list_enabled_groups()]
        if not targets:
            log.warning(
                "No enabled groups registered. Add one with "
                "`ingestion groups add <url> --city <name>` or via /admin."
            )
            return 0
        log.info("Scraping %d enabled group(s)", len(targets))

    for target in targets:
        source = FacebookSource(settings, use_api=args.api)
        lock = GroupLock(settings, target)
        if not lock.acquire():
            continue
        try:
            run_source(source, pipeline, repo, target=target,
                       limit=limit, scrape_only=args.scrape_only)
        finally:
            lock.release()
    return 0


def _cmd_analyze(args, settings) -> int:
    from .db.engine import get_engine
    from .db.repo import Repo
    from .geocode import Geocoder
    from .llm import LLMClient
    from .models import RawPost
    from .pipeline import Pipeline

    settings.require("facebook")
    engine = get_engine(settings)
    repo = Repo(engine)
    repo.schema_check()

    rows = repo.unprocessed_raw_posts("facebook")
    if not rows:
        log.info("No unprocessed raw posts.")
        return 0
    posts = [
        RawPost(
            source=r["source"], source_id=r["source_id"], text=r["text"],
            posted_at=r["posted_at"], source_group=r["source_group"],
            source_url=r["source_url"], author_name=r["author_name"],
            author_url=r["author_url"], meta=r["meta"] or {},
        )
        for r in rows
    ]
    pipeline = Pipeline(LLMClient(settings), Geocoder(settings), repo)
    workers = args.workers or settings.analyze_workers
    log.info("Analyzing %d raw posts with %d workers", len(posts), workers)
    stats = pipeline.process_many(posts, workers)
    log.info("Analyze complete: %s", stats.summary())
    return 0


def _cmd_backfill(args, settings) -> int:
    from .scripts.backfill_results import backfill

    return backfill(args.results_dir, settings)


def _cmd_groups(args, settings) -> int:
    from .db.engine import get_engine
    from .db.repo import Repo

    repo = Repo(get_engine(settings))
    repo.schema_check()

    if args.action == "list":
        rows = repo.list_enabled_groups()
        if not rows:
            print("No enabled groups registered.")
        for g in rows:
            print(f"[{g['city_name']}] {g['url']}")
    elif args.action == "add":
        if not args.url or not args.city:
            print("Usage: ingestion groups add <url> --city <name> [--fb-group-id <id>]")
            return 1
        repo.add_group(args.url, args.city, args.fb_group_id)
        print(f"Added group to '{args.city}': {args.url}")
    return 0


def _cmd_check(settings) -> int:
    from sqlalchemy import text

    from .db.engine import get_engine
    from .db.repo import Repo

    engine = get_engine(settings)
    try:
        with engine.connect() as conn:
            conn.execute(text("select 1"))
        log.info("Database connection OK (%s)", settings.database_url.split("@")[-1])
    except Exception as e:  # noqa: BLE001
        log.error("Database connection FAILED: %s", e)
        return 1

    repo = Repo(engine)
    try:
        repo.schema_check()
        log.info("Schema check OK — all expected tables/columns present.")
    except Exception as e:  # noqa: BLE001
        log.error("Schema check FAILED: %s", e)
        return 1

    log.info("Listings currently in DB: %d", repo.count_listings())
    log.info("LLM provider: %s", settings.model_provider)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    settings = load_settings()
    run_tag = getattr(args, "source", None) or args.command
    configure_logging(args.verbose, settings.state_path, run_tag)

    if args.command == "run":
        return _cmd_run(args, settings)
    if args.command == "analyze":
        return _cmd_analyze(args, settings)
    if args.command == "backfill":
        return _cmd_backfill(args, settings)
    if args.command == "groups":
        return _cmd_groups(args, settings)
    if args.command == "check":
        return _cmd_check(settings)
    return 1


if __name__ == "__main__":
    sys.exit(main())
