"""Run scrape/analyze cycles — bounded window or continuously (--forever).

Examples:
    python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
    python -m ingestion.scripts.run_window --forever --interval-minutes 30 --posts 50

The runner is a thin subprocess driver: all DB/alert logic lives in the CLI
commands, and the runner only reacts to their exit codes (see ingestion/cli.py):

    0 ok | 1 error | 3 quota exceeded | 4 login required | 5 DB unreachable

It survives a down Postgres (waits and re-probes with `ingestion check`),
cools down after LLM quota exhaustion, and runs the stale-data watchdog every
cycle. The one alert it sends itself is `db_unavailable` — child processes
can't record that one in the DB, so the runner uses a direct-send Alerter
(repo=None: Telegram only, in-memory cooldown).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timedelta

# Exit codes mirrored from ingestion.cli (imported lazily where needed to keep
# startup dependency-free for --help).
EXIT_QUOTA = 3
EXIT_LOGIN = 4
EXIT_DB_DOWN = 5

LOG_RETENTION_DAYS = 7


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ingestion.scripts.run_window",
        description="Run scrape/analyze cycles for a bounded duration or forever",
    )
    parser.add_argument("--hours", type=float, default=12.0, help="total runtime window")
    parser.add_argument(
        "--forever",
        action="store_true",
        help="run until stopped (ignores --hours); pair with systemd for restarts",
    )
    parser.add_argument(
        "--interval-minutes",
        type=float,
        default=30.0,
        help="minutes between cycle starts",
    )
    parser.add_argument("--posts", type=int, default=50, help="posts to scrape per group")
    parser.add_argument("--workers", type=int, default=5, help="analyze worker count")
    parser.add_argument("--group", type=str, help="restrict scraping to one group URL")
    parser.add_argument("--api", action="store_true", help="use Graph API mode")
    parser.add_argument(
        "--scrape-only",
        action="store_true",
        help="skip analyze after each scrape cycle",
    )
    parser.add_argument(
        "--quota-cooldown-minutes",
        type=float,
        default=60.0,
        help="extra sleep after an LLM-quota-exceeded cycle",
    )
    parser.add_argument(
        "--db-wait-seconds",
        type=float,
        default=300.0,
        help="re-probe interval while the database is unreachable",
    )
    parser.add_argument(
        "--login-wait-minutes",
        type=float,
        default=60.0,
        help="sleep before retrying after a Facebook login failure",
    )
    return parser


def _run_step(args: list[str]) -> int:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] $ {' '.join(args)}", flush=True)
    completed = subprocess.run(args, check=False)
    return completed.returncode


def _make_alerter():
    """Direct-send Alerter (no repo): must work while Postgres is down."""
    try:
        from ingestion.alerts import Alerter
        from ingestion.config import load_settings

        return Alerter(load_settings(), repo=None)
    except Exception as e:  # noqa: BLE001 — alerting must not kill the runner
        print(f"Runner alerter unavailable: {e}", flush=True)
        return None


def _prune_old_logs() -> None:
    """A forever runner spawns several CLI processes per cycle, each writing a
    log file to state/logs/ — prune anything older than the retention window."""
    try:
        from ingestion.config import load_settings

        logs = load_settings().state_path / "logs"
        if not logs.is_dir():
            return
        cutoff = time.time() - LOG_RETENTION_DAYS * 86400
        pruned = 0
        for f in logs.glob("*.log"):
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
                pruned += 1
        if pruned:
            print(f"Pruned {pruned} log file(s) older than {LOG_RETENTION_DAYS} days", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"Log prune skipped: {e}", flush=True)


def _db_outage_loop(alerter, wait_s: float) -> None:
    """Announce the outage once, then probe until the DB is back."""
    if alerter is not None:
        alerter.emit(
            "db_unavailable",
            "Postgres unreachable; continuous runner is waiting for it to return.",
        )
    while True:
        print(
            f"Database unreachable; retrying in {int(wait_s)}s "
            f"(next probe {datetime.now() + timedelta(seconds=wait_s):%H:%M:%S})",
            flush=True,
        )
        time.sleep(wait_s)
        if _run_step([sys.executable, "-m", "ingestion", "check"]) == 0:
            if alerter is not None:
                alerter.emit(
                    "db_unavailable",
                    "Postgres is back; continuous runner resuming.",
                    severity="info",
                )
            return


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    started = datetime.now()
    deadline = started + timedelta(hours=args.hours)
    interval_s = max(60, int(args.interval_minutes * 60))
    cycle = 0

    alerter = _make_alerter()
    _prune_old_logs()

    if args.forever:
        print(
            f"Starting continuous ingestion runner at {started.isoformat(timespec='seconds')} "
            f"(interval {args.interval_minutes:g}m; stop with Ctrl-C / systemd)",
            flush=True,
        )
    else:
        print(
            f"Starting bounded ingestion window at {started.isoformat(timespec='seconds')} "
            f"until {deadline.isoformat(timespec='seconds')}",
            flush=True,
        )

    run_cmd = [sys.executable, "-m", "ingestion", "run", "--posts", str(args.posts)]
    if args.group:
        run_cmd.extend(["--group", args.group])
    if args.api:
        run_cmd.append("--api")
    if args.scrape_only:
        run_cmd.append("--scrape-only")
    analyze_cmd = [sys.executable, "-m", "ingestion", "analyze", "--workers", str(args.workers)]
    watchdog_cmd = [sys.executable, "-m", "ingestion", "watchdog"]

    while args.forever or datetime.now() < deadline:
        cycle += 1
        cycle_started = time.time()
        print(f"\n=== Cycle {cycle} ===", flush=True)

        run_rc = _run_step(run_cmd)
        if run_rc == EXIT_DB_DOWN:
            _db_outage_loop(alerter, args.db_wait_seconds)
            continue  # retry the cycle immediately now that the DB is back
        if run_rc == EXIT_LOGIN:
            # The child already recorded the run + sent the login_expiry alert;
            # a human has to re-login in the browser profile, so back off.
            print(
                f"Login required; sleeping {args.login_wait_minutes:g}m before retrying.",
                flush=True,
            )
            time.sleep(args.login_wait_minutes * 60)
            continue

        quota = run_rc == EXIT_QUOTA
        analyze_rc = None
        if not args.scrape_only and not quota:
            analyze_rc = _run_step(analyze_cmd)
            if analyze_rc == EXIT_DB_DOWN:
                _db_outage_loop(alerter, args.db_wait_seconds)
                continue
            quota = analyze_rc == EXIT_QUOTA

        watchdog_rc = _run_step(watchdog_cmd)

        print(
            f"cycle {cycle}: run={run_rc}"
            f" analyze={'skipped' if analyze_rc is None else analyze_rc}"
            f" watchdog={watchdog_rc}",
            flush=True,
        )

        if quota:
            print(
                f"LLM quota exceeded; cooling down {args.quota_cooldown_minutes:g}m.",
                flush=True,
            )
            time.sleep(args.quota_cooldown_minutes * 60)

        elapsed_s = int(time.time() - cycle_started)
        sleep_s = interval_s - elapsed_s
        if sleep_s <= 0:
            print("Cycle took longer than the requested interval; starting next cycle immediately.", flush=True)
            continue

        next_start = datetime.now() + timedelta(seconds=sleep_s)
        if not args.forever and next_start >= deadline:
            break

        print(
            f"Sleeping {sleep_s}s until next cycle at {next_start.isoformat(timespec='seconds')}",
            flush=True,
        )
        time.sleep(sleep_s)

    print(f"Finished ingestion window at {datetime.now().isoformat(timespec='seconds')}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
