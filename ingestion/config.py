"""Central configuration for the ingestion engine.

Every environment variable and every previously-hardcoded magic number lives
here as a typed field, so behaviour is tunable without touching source.
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Credentials each source needs before it can run. Checked by `require()`.
# Sourcing is Facebook-only; groups are registered in the DB (via /admin or
# `ingestion groups add`), so no per-group credential is required here.
_SOURCE_REQUIREMENTS: dict[str, list[str]] = {
    "facebook": [],
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Database -------------------------------------------------------
    database_url: str = "postgresql+psycopg://basera:basera@localhost:5433/basera"

    # --- LLM provider ---------------------------------------------------
    model_provider: Literal["openai", "gemini"] = "openai"
    model_name: str | None = None
    openai_api_key: str | None = None
    gemini_api_key: str | None = None

    # --- Geocoding ------------------------------------------------------
    google_maps_api_key: str | None = None

    # --- Telegram -------------------------------------------------------
    telegram_api_id: int | None = None
    telegram_api_hash: str | None = None
    telegram_phone: str | None = None
    target_chat: str = "me"
    target_peer_id: str | None = None

    # --- WhatsApp -------------------------------------------------------
    whatsapp_target_chat: str | None = None

    # --- Facebook -------------------------------------------------------
    facebook_target_group: str | None = None
    fb_access_token: str | None = None
    fb_group_id: str | None = None
    fb_graph_version: str = "v25.0"

    # --- Browser (WhatsApp + Facebook) ----------------------------------
    chrome_user_data_dir: str | None = None
    browser_channel: str | None = "chrome"
    headless: bool = False
    # Servers/containers usually can't run the Chromium sandbox (launch crashes
    # with "Target page/context/browser has been closed"). Set true on the VM;
    # adds --no-sandbox + --disable-dev-shm-usage. Keep false on desktops.
    browser_no_sandbox: bool = False

    # --- State / filesystem ---------------------------------------------
    state_dir: Path = Path("ingestion/state")
    save_html: bool = True

    # --- Tunables (formerly magic numbers) ------------------------------
    facebook_max_posts: int = 50          # facebook_bot.py main()
    max_scroll_time_s: int = 300          # facebook_bot.py:670
    scroll_pause_ms: int = 2000           # facebook_bot.py:279
    fb_batch_size: int = 10               # facebook_bot.py:735
    whatsapp_scroll_rounds: int = 20      # whatsapp_bot.py:82
    login_timeout_ms: int = 300_000       # facebook_bot.py:230
    selector_timeout_ms: int = 15_000
    llm_retries: int = 3
    llm_backoff_base_s: float = 5.0
    processing_max_attempts: int = 3
    processing_retry_backoff_s: int = 300
    analyze_workers: int = 5              # facebook_bot.py:1128

    # --- Alerting (Telegram Bot API; distinct from the Telethon scraping
    # credentials above — those belong to a future Telegram *source*) --------
    telegram_bot_token: str | None = None
    telegram_alert_chat_id: str | None = None  # str: supports -100... and @channel
    # "all" | "none" | comma-separated categories, e.g. "run_failure,stale_data"
    alert_categories: str = "all"
    alert_cooldown_minutes: int = 30
    # per-category overrides: "category=minutes,category=minutes"
    alert_cooldown_overrides: str = "stale_data=240,db_unavailable=60"
    alert_max_delivery_attempts: int = 10
    alert_flush_batch: int = 20
    telegram_send_timeout_s: float = 10.0
    alert_stale_run_hours: float = 2.0    # watchdog: no successful run in window
    alert_stale_posts_hours: float = 12.0  # watchdog: no run with new posts in window
    # Tiered aging, run daily by the `archive` command: posts older than
    # ARCHIVE_AFTER_DAYS drop out of the feed (active -> archived); posts older
    # than MOVE_AFTER_DAYS are physically moved to listings_archive (cold
    # storage). 0 disables that tier.
    listing_archive_after_days: int = 7
    listing_move_after_days: int = 14
    # Near-duplicate collapse: a new post whose text is >= this trigram
    # similarity to a same-group listing from the last N days refreshes that
    # listing instead of inserting a duplicate. 0 disables.
    dedup_similarity: float = 0.9
    dedup_window_days: int = 14

    def enabled_alert_categories(self) -> set[str] | None:
        """None means every category; an empty set disables delivery entirely."""
        raw = (self.alert_categories or "").strip().lower()
        if raw in ("", "none"):
            return set()
        if raw == "all":
            return None
        return {c.strip() for c in raw.split(",") if c.strip()}

    def alert_cooldown_for(self, category: str) -> timedelta:
        """Per-category delivery cooldown; `test` alerts are never throttled."""
        if category == "test":
            return timedelta(0)
        for pair in (self.alert_cooldown_overrides or "").split(","):
            name, _, minutes = pair.partition("=")
            if name.strip() == category:
                try:
                    return timedelta(minutes=float(minutes))
                except ValueError:
                    break
        return timedelta(minutes=self.alert_cooldown_minutes)

    def require(self, source: str) -> None:
        """Raise if credentials for `source` (and the LLM/geocoder) are missing."""
        missing: list[str] = []
        for field in _SOURCE_REQUIREMENTS.get(source, []):
            if not getattr(self, field, None):
                missing.append(field.upper())

        if self.model_provider == "gemini" and not self.gemini_api_key:
            missing.append("GEMINI_API_KEY")
        elif self.model_provider == "openai" and not self.openai_api_key:
            missing.append("OPENAI_API_KEY")

        if not self.google_maps_api_key:
            missing.append("GOOGLE_MAPS_API_KEY")

        if missing:
            raise SystemExit(
                f"Missing required settings for source '{source}': "
                + ", ".join(missing)
                + "\nSet them in your .env file."
            )

    @property
    def state_path(self) -> Path:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        return self.state_dir


def load_settings() -> Settings:
    return Settings()
