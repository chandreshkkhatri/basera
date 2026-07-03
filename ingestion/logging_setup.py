"""Logging configuration — replaces the scrapers' ~189 print() calls."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path


def configure_logging(verbose: bool = False, state_dir: Path | None = None,
                      run_tag: str | None = None) -> None:
    """Console handler (INFO, or DEBUG with -v) plus an optional per-run file.

    Selector-fallback failures that were silent `except: pass` blocks now log at
    DEBUG, so they are visible with -v without changing control flow.
    """
    level = logging.DEBUG if verbose else logging.INFO
    handlers: list[logging.Handler] = []

    console = logging.StreamHandler()
    console.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    handlers.append(console)

    if state_dir is not None:
        logs = state_dir / "logs"
        logs.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        name = f"{run_tag or 'run'}-{stamp}.log"
        file_handler = logging.FileHandler(logs / name, encoding="utf-8")
        file_handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
        file_handler.setLevel(logging.DEBUG)
        handlers.append(file_handler)

    logging.basicConfig(level=level, handlers=handlers, force=True)
    # Quiet noisy third-party libraries.
    for noisy in ("httpx", "telethon", "urllib3", "openai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
