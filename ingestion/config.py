"""Central configuration for the ingestion engine.

Every environment variable and every previously-hardcoded magic number lives
here as a typed field, so behaviour is tunable without touching source.
"""

from __future__ import annotations

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
    headless: bool = False

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
    analyze_workers: int = 5              # facebook_bot.py:1128

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
