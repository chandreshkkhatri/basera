"""Command-line interface for the ingestion engine.

    python -m ingestion run [--group URL] [--posts N] [--scrape-only] [--api]
    python -m ingestion analyze [--workers N]
    python -m ingestion backfill [--results-dir scraper/results]
    python -m ingestion groups list | add <url> --city <name> | remove <url>
    python -m ingestion alerts test | flush | list [--limit N]
    python -m ingestion archive
    python -m ingestion watchdog
    python -m ingestion check

Exit codes (2 is reserved by argparse for usage errors); the continuous
runner (scripts/run_window.py) reacts to these:

    0  success
    1  >=1 group errored / schema drift / other failure
    3  LLM quota exceeded (run or analyze)
    4  login required (re-login to Facebook in the browser profile)
    5  database unreachable
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

    diag = sub.add_parser(
        "diagnose-urls",
        help="probe why browser post-URL extraction misses (writes artifacts)",
    )
    diag.add_argument("--group", type=str, required=True, help="group URL to probe")
    diag.add_argument("--posts", type=int, default=8, help="posts to probe")

    backfill = sub.add_parser("backfill", help="import scraper/results/*.json")
    backfill.add_argument("--results-dir", default="scraper/results")

    reclassify = sub.add_parser(
        "reclassify",
        help="re-check intent of existing listings; hide seeker/buyer posts",
    )
    reclassify.add_argument("--limit", type=int, help="only re-check N listings")
    reclassify.add_argument("--dry-run", action="store_true",
                            help="report counts without writing")
    reclassify.add_argument("--workers", type=int)

    groups = sub.add_parser("groups", help="manage the Facebook group registry")
    groups.add_argument("action", choices=["list", "add", "remove"])
    groups.add_argument("url", nargs="?")
    groups.add_argument("--city", type=str, help="city to assign the group to (add)")
    groups.add_argument("--fb-group-id", type=str, help="Graph API group id (add)")

    alerts = sub.add_parser("alerts", help="test/flush/list the Telegram alert outbox")
    alerts.add_argument("action", choices=["test", "flush", "list"])
    alerts.add_argument("--limit", type=int, default=20, help="rows to show (list)")

    sub.add_parser(
        "watchdog",
        help="stale-data checks + deliver queued alerts (run periodically)",
    )

    sub.add_parser(
        "archive",
        help="age posts out of the feed (archived) + move old ones to cold "
        "storage (run daily)",
    )

    sub.add_parser("check", help="validate settings, DB connectivity and schema")
    return parser


# Exit codes (see module docstring). 2 is argparse's.
EXIT_OK = 0
EXIT_ERROR = 1
EXIT_QUOTA = 3
EXIT_LOGIN = 4
EXIT_DB_DOWN = 5

_STATUS_EXIT = {
    "success": EXIT_OK,
    "error": EXIT_ERROR,
    "quota_exceeded": EXIT_QUOTA,
    "login_failed": EXIT_LOGIN,
}


def _checked_repo(settings):
    """Engine + Repo + schema check, mapped to exit codes.

    Returns (repo, exit_code); repo is None when exit_code != 0. Runs before
    any Playwright launch so a down DB fails fast (exit 5)."""
    from sqlalchemy.exc import OperationalError

    from .db.engine import get_engine
    from .db.repo import Repo, SchemaError

    repo = Repo(get_engine(settings))
    try:
        repo.schema_check()
    except OperationalError as e:
        log.error("Database unreachable: %s", e)
        return None, EXIT_DB_DOWN
    except SchemaError as e:
        log.error("%s", e)
        return None, EXIT_ERROR
    return repo, EXIT_OK


def _cmd_run(args, settings) -> int:
    from .alerts import Alerter
    from .geocode import Geocoder
    from .llm import LLMClient
    from .pipeline import Pipeline, run_source
    from .sources.facebook import FacebookSource, GroupLock

    settings.require("facebook")
    repo, rc = _checked_repo(settings)
    if repo is None:
        return rc

    alerter = Alerter(settings, repo)
    pipeline = Pipeline(LLMClient(settings), Geocoder(settings, repo), repo, alerter)
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
            return EXIT_OK
        log.info("Scraping %d enabled group(s)", len(targets))

    worst_rc = EXIT_OK
    for target in targets:
        source = FacebookSource(settings, use_api=args.api)
        lock = GroupLock(settings, target)
        if not lock.acquire():
            continue
        try:
            result = run_source(source, pipeline, repo, target=target,
                                limit=limit, scrape_only=args.scrape_only,
                                alerter=alerter)
        finally:
            lock.release()
        worst_rc = max(worst_rc, _STATUS_EXIT.get(result.status, EXIT_ERROR))
        if result.status == "login_failed":
            # Same browser profile for every group: each remaining group would
            # just burn the login timeout again. Stop and ask for re-login.
            log.error("Skipping remaining groups until Facebook login is restored.")
            break

    alerter.flush_pending()
    return worst_rc


def _cmd_diagnose_urls(args, settings) -> int:
    from .scripts.diagnose_urls import diagnose

    return diagnose(settings, args.group, args.posts)


def _cmd_analyze(args, settings) -> int:
    from .alerts import Alerter
    from .geocode import Geocoder
    from .llm import LLMClient
    from .models import RawPost
    from .pipeline import Pipeline

    settings.require("facebook")
    repo, rc = _checked_repo(settings)
    if repo is None:
        return rc

    alerter = Alerter(settings, repo)
    rows = repo.unprocessed_raw_posts("facebook")
    if not rows:
        log.info("No unprocessed raw posts.")
        alerter.flush_pending()
        return EXIT_OK
    posts = [
        RawPost(
            source=r["source"], source_id=r["source_id"], text=r["text"],
            posted_at=r["posted_at"], source_group=r["source_group"],
            source_url=r["source_url"], author_name=r["author_name"],
            author_url=r["author_url"], meta=r["meta"] or {},
        )
        for r in rows
    ]
    pipeline = Pipeline(LLMClient(settings), Geocoder(settings, repo), repo, alerter)
    workers = args.workers or settings.analyze_workers
    log.info("Analyzing %d raw posts with %d workers", len(posts), workers)
    stats = pipeline.process_many(posts, workers)
    log.info("Analyze complete: %s", stats.summary())
    if stats.quota_exceeded:
        alerter.emit(
            "quota_exceeded",
            f"Analyze stopped early — LLM quota exceeded ({stats.summary()})",
        )
        alerter.flush_pending()
        return EXIT_QUOTA
    alerter.flush_pending()
    return EXIT_OK


def _cmd_backfill(args, settings) -> int:
    from .scripts.backfill_results import backfill

    return backfill(args.results_dir, settings)


def _cmd_reclassify(args, settings) -> int:
    from .scripts.reclassify_intent import reclassify

    return reclassify(
        settings,
        limit=args.limit,
        dry_run=args.dry_run,
        workers=args.workers or settings.analyze_workers,
    )


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
    elif args.action == "remove":
        if not args.url:
            print("Usage: ingestion groups remove <url>")
            return 1
        if not repo.delete_group(args.url):
            print(f"Group not found: {args.url}")
            return 1
        print(f"Removed group: {args.url}")
    return 0


def _cmd_alerts(args, settings) -> int:
    from .alerts import Alerter

    repo, rc = _checked_repo(settings)
    if repo is None:
        return rc
    alerter = Alerter(settings, repo)

    if args.action == "test":
        if not alerter.configured:
            print("Telegram not configured: set TELEGRAM_BOT_TOKEN and "
                  "TELEGRAM_ALERT_CHAT_ID in .env")
            return 1
        if alerter.send_test():
            print("Test alert delivered — check your Telegram chat.")
            return 0
        print("Test alert NOT delivered (recorded in the outbox; "
              "see `ingestion alerts list` for the error).")
        return 1
    if args.action == "flush":
        delivered = alerter.flush_pending()
        print(f"Delivered {delivered} queued alert(s).")
        return 0
    # list
    rows = repo.recent_alerts(args.limit)
    if not rows:
        print("No alerts recorded.")
    for r in rows:
        when = r["created_at"].strftime("%Y-%m-%d %H:%M") if r["created_at"] else "?"
        line = (f"#{r['id']} {when} [{r['category']}/{r['severity']}] "
                f"{r['delivery_status']}: {r['message']}")
        if r["delivery_error"]:
            line += f" ({r['delivery_error']})"
        print(line)
    return 0


def _cmd_archive(settings) -> int:
    """Daily tiered aging: active -> archived at N days (out of feed), then
    move to cold storage at M days. DB-only; safe to run anytime."""
    repo, rc = _checked_repo(settings)
    if repo is None:
        return rc

    if settings.listing_archive_after_days > 0:
        archived = repo.mark_archived(settings.listing_archive_after_days)
        log.info(
            "Archived %d listing(s) older than %dd (removed from feed).",
            archived, settings.listing_archive_after_days,
        )
    if settings.listing_move_after_days > 0:
        moved = repo.move_to_archive(settings.listing_move_after_days)
        log.info(
            "Moved %d listing(s) older than %dd to cold storage.",
            moved, settings.listing_move_after_days,
        )
    return EXIT_OK


def _cmd_watchdog(settings) -> int:
    """Stale-data checks + outbox flush. Cheap; run every cycle / via cron."""
    from datetime import datetime, timezone

    from .alerts import Alerter

    repo, rc = _checked_repo(settings)
    if repo is None:
        return rc
    alerter = Alerter(settings, repo)

    health = repo.run_health()
    now = datetime.now(timezone.utc)

    def _age_hours(ts) -> float | None:
        if ts is None:
            return None
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (now - ts).total_seconds() / 3600

    success_age = _age_hours(health["last_success_at"])
    yield_age = _age_hours(health["last_yield_at"])

    if success_age is None or success_age > settings.alert_stale_run_hours:
        label = f"{success_age:.1f}h ago" if success_age is not None else "never"
        alerter.emit(
            "stale_data",
            f"No successful scrape run in the last "
            f"{settings.alert_stale_run_hours:g}h (last: {label}).",
        )
    elif yield_age is None or yield_age > settings.alert_stale_posts_hours:
        label = f"{yield_age:.1f}h ago" if yield_age is not None else "never"
        alerter.emit(
            "stale_data",
            f"Runs succeed but no new posts in the last "
            f"{settings.alert_stale_posts_hours:g}h (last: {label}).",
        )
    else:
        log.info(
            "Watchdog OK: last success %.1fh ago, last new posts %.1fh ago",
            success_age, yield_age,
        )

    alerter.flush_pending()
    return EXIT_OK


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
    if args.command == "diagnose-urls":
        return _cmd_diagnose_urls(args, settings)
    if args.command == "backfill":
        return _cmd_backfill(args, settings)
    if args.command == "reclassify":
        return _cmd_reclassify(args, settings)
    if args.command == "groups":
        return _cmd_groups(args, settings)
    if args.command == "alerts":
        return _cmd_alerts(args, settings)
    if args.command == "archive":
        return _cmd_archive(settings)
    if args.command == "watchdog":
        return _cmd_watchdog(settings)
    if args.command == "check":
        return _cmd_check(settings)
    return 1


if __name__ == "__main__":
    sys.exit(main())
