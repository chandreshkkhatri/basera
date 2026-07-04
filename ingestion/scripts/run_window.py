"""Run bounded scrape/analyze cycles for a fixed wall-clock window.

Example:
    python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import datetime, timedelta


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m ingestion.scripts.run_window",
        description="Run scrape/analyze cycles for a bounded duration",
    )
    parser.add_argument("--hours", type=float, default=12.0, help="total runtime window")
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
    return parser


def _run_step(args: list[str]) -> int:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] $ {' '.join(args)}", flush=True)
    completed = subprocess.run(args, check=False)
    return completed.returncode


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    started = datetime.now()
    deadline = started + timedelta(hours=args.hours)
    interval_s = max(60, int(args.interval_minutes * 60))
    cycle = 0

    print(
        f"Starting bounded ingestion window at {started.isoformat(timespec='seconds')} "
        f"until {deadline.isoformat(timespec='seconds')}",
        flush=True,
    )

    while datetime.now() < deadline:
        cycle += 1
        cycle_started = time.time()
        print(f"\n=== Cycle {cycle} ===", flush=True)

        run_cmd = [sys.executable, "-m", "ingestion", "run", "--posts", str(args.posts)]
        if args.group:
            run_cmd.extend(["--group", args.group])
        if args.api:
            run_cmd.append("--api")
        if args.scrape_only:
            run_cmd.append("--scrape-only")

        run_rc = _run_step(run_cmd)
        if run_rc != 0:
            print(f"Scrape step exited with code {run_rc}", flush=True)

        if not args.scrape_only:
            analyze_rc = _run_step(
                [sys.executable, "-m", "ingestion", "analyze", "--workers", str(args.workers)]
            )
            if analyze_rc != 0:
                print(f"Analyze step exited with code {analyze_rc}", flush=True)

        elapsed_s = int(time.time() - cycle_started)
        sleep_s = interval_s - elapsed_s
        if sleep_s <= 0:
            print("Cycle took longer than the requested interval; starting next cycle immediately.", flush=True)
            continue

        next_start = datetime.now() + timedelta(seconds=sleep_s)
        if next_start >= deadline:
            break

        print(
            f"Sleeping {sleep_s}s until next cycle at {next_start.isoformat(timespec='seconds')}",
            flush=True,
        )
        time.sleep(sleep_s)

    print(f"Finished bounded ingestion window at {datetime.now().isoformat(timespec='seconds')}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())