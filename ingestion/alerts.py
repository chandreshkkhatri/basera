"""Telegram alerting with a DB outbox.

Alerts are always RECORDED in the `alerts` table first (audit trail), then
DELIVERED via the Telegram Bot API. Category toggles and per-category cooldowns
suppress *delivery*, not *recording* — suppressed rows keep the reason in
`delivery_error` and are never picked up by `flush_pending`.

Design invariant: nothing in this module may raise into the pipeline. Every
step degrades: if the DB is down the alert is still sent directly to Telegram
(with an in-memory cooldown so a long-lived runner doesn't spam), and if
Telegram is down the row stays pending for a later `flush_pending`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import requests

from .config import Settings
from .db.repo import Repo

log = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"
TELEGRAM_MAX_LEN = 4000  # hard API limit is 4096; leave headroom

# Default severity per category; emit(severity=...) overrides.
CATEGORY_SEVERITY = {
    "run_failure": "error",
    "login_expiry": "critical",
    "quota_exceeded": "warning",
    "stale_data": "warning",
    "processing_failed": "warning",
    "db_unavailable": "critical",
    "stats_digest": "info",
    "test": "info",
}


class Alerter:
    """Records alerts to the DB outbox and delivers them to Telegram.

    `repo=None` runs in direct-send mode (no outbox, in-memory cooldown only)
    — used by the long-lived runner, which must alert even while Postgres is
    down and therefore can't rely on the DB for anything.
    """

    # How long a fetched set of admin toggles stays fresh.
    DB_TOGGLE_TTL_S = 60.0

    def __init__(self, settings: Settings, repo: Optional[Repo] = None):
        self.settings = settings
        self.repo = repo
        # Fallback cooldown when the DB can't be probed (or repo is None).
        self._mem_last_sent: dict[str, datetime] = {}
        # Cached admin toggles (alert_categories table) + fetch time.
        self._db_disabled_cache: tuple[datetime, set[str]] | None = None

    @property
    def configured(self) -> bool:
        return bool(
            self.settings.telegram_bot_token
            and self.settings.telegram_alert_chat_id
        )

    # -- public API -------------------------------------------------------
    def emit(
        self,
        category: str,
        message: str,
        *,
        severity: Optional[str] = None,
        run_id: Optional[int] = None,
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        """Record an alert and attempt immediate delivery. Never raises."""
        try:
            self._emit(category, message, severity, run_id, details)
        except Exception as e:  # noqa: BLE001 — alerting must never break the pipeline
            log.error("Alert emit failed unexpectedly (%s): %s", category, e)

    def flush_pending(self) -> int:
        """Deliver queued outbox rows (earlier failures/outages). Returns the
        number delivered. Never raises."""
        if self.repo is None or not self.configured:
            return 0
        delivered = 0
        try:
            rows = self.repo.claim_pending_alerts(
                batch=self.settings.alert_flush_batch,
                max_attempts=self.settings.alert_max_delivery_attempts,
            )
        except Exception as e:  # noqa: BLE001
            log.debug("Alert flush skipped (DB unavailable?): %s", e)
            return 0
        for row in rows:
            try:
                if self._category_disabled(row["category"]):
                    # Category disabled after the row was queued.
                    self.repo.mark_alert_suppressed(row["id"], "category_disabled")
                    continue
                text = self._format(
                    row["category"], row["severity"], row["message"],
                    row["details"], created_at=row["created_at"],
                )
                ok, err = self._telegram_send(text)
                if ok:
                    self.repo.mark_alert_sent(row["id"])
                    self._mem_last_sent[row["category"]] = datetime.now(timezone.utc)
                    delivered += 1
                else:
                    final = (
                        row["delivery_attempts"]
                        >= self.settings.alert_max_delivery_attempts
                    )
                    self.repo.mark_alert_delivery_failed(
                        row["id"], err or "unknown", final=final
                    )
            except Exception as e:  # noqa: BLE001
                log.warning("Alert flush error on row %s: %s", row.get("id"), e)
        if delivered:
            log.info("Delivered %d queued alert(s)", delivered)
        return delivered

    def send_test(self) -> bool:
        """Send (and record) a test alert; returns True if delivered."""
        self.emit("test", "Test alert from basera ingestion — alerting works.")
        last = self._mem_last_sent.get("test")
        return last is not None and (
            (datetime.now(timezone.utc) - last).total_seconds() < 60
        )

    # -- internals --------------------------------------------------------
    def _category_disabled(self, category: str) -> bool:
        """Env toggle (coarse, ALERT_CATEGORIES) OR admin toggle (DB table).
        DB failures mean 'nothing disabled' — alerting may not depend on it."""
        enabled = self.settings.enabled_alert_categories()
        if enabled is not None and category not in enabled:
            return True
        return category in self._db_disabled()

    def _db_disabled(self) -> set[str]:
        if self.repo is None:
            return set()
        now = datetime.now(timezone.utc)
        if self._db_disabled_cache is not None:
            fetched_at, cached = self._db_disabled_cache
            if (now - fetched_at).total_seconds() < self.DB_TOGGLE_TTL_S:
                return cached
        try:
            disabled = self.repo.disabled_alert_categories()
        except Exception as e:  # noqa: BLE001
            log.debug("Alert toggle probe failed (DB unavailable?): %s", e)
            return set()
        self._db_disabled_cache = (now, disabled)
        return disabled

    def _emit(
        self,
        category: str,
        message: str,
        severity: Optional[str],
        run_id: Optional[int],
        details: Optional[dict[str, Any]],
    ) -> None:
        severity = severity or CATEGORY_SEVERITY.get(category, "error")

        suppressed_reason: Optional[str] = None
        if self._category_disabled(category):
            suppressed_reason = "category_disabled"
        elif not self.configured:
            suppressed_reason = "not_configured"
        elif self._throttled(category):
            suppressed_reason = "cooldown"

        # 1. Record (best-effort — DB may be the thing that's broken).
        alert_id: Optional[int] = None
        if self.repo is not None:
            try:
                row_details = dict(details or {})
                if suppressed_reason:
                    row_details["suppressed_reason"] = suppressed_reason
                alert_id = self.repo.insert_alert(
                    category=category,
                    message=message,
                    severity=severity,
                    details=row_details or None,
                    run_id=run_id,
                    delivery_status="suppressed" if suppressed_reason else "pending",
                )
            except Exception as e:  # noqa: BLE001
                log.warning("Could not record alert in DB (%s): %s", category, e)

        if suppressed_reason:
            log.info("Alert suppressed (%s): [%s] %s", suppressed_reason, category, message)
            return

        # 2. Deliver.
        text = self._format(category, severity, message, details)
        ok, err = self._telegram_send(text)
        if ok:
            self._mem_last_sent[category] = datetime.now(timezone.utc)
            if alert_id is not None:
                try:
                    self.repo.mark_alert_sent(alert_id)
                except Exception as e:  # noqa: BLE001
                    log.debug("Could not mark alert %s sent: %s", alert_id, e)
        else:
            log.warning("Telegram delivery failed for [%s]: %s", category, err)
            if alert_id is not None:
                try:
                    # Leave the row pending so flush_pending retries later.
                    self.repo.mark_alert_delivery_failed(alert_id, err or "unknown", final=False)
                except Exception as e:  # noqa: BLE001
                    log.debug("Could not record delivery failure: %s", e)

    def _throttled(self, category: str) -> bool:
        cooldown = self.settings.alert_cooldown_for(category)
        if cooldown.total_seconds() <= 0:
            return False
        now = datetime.now(timezone.utc)
        last: Optional[datetime] = None
        if self.repo is not None:
            try:
                last = self.repo.last_alert_at(category)
            except Exception as e:  # noqa: BLE001
                log.debug("Cooldown DB probe failed, using in-memory: %s", e)
                last = self._mem_last_sent.get(category)
        else:
            last = self._mem_last_sent.get(category)
        if last is None:
            return False
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        return (now - last) < cooldown

    def _telegram_send(self, text: str) -> tuple[bool, Optional[str]]:
        if not self.configured:
            return False, "telegram not configured"
        try:
            resp = requests.post(
                TELEGRAM_API.format(token=self.settings.telegram_bot_token),
                json={
                    "chat_id": self.settings.telegram_alert_chat_id,
                    "text": text[:TELEGRAM_MAX_LEN],
                    "disable_web_page_preview": True,
                },
                timeout=self.settings.telegram_send_timeout_s,
            )
            if resp.status_code == 200 and resp.json().get("ok"):
                return True, None
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as e:  # noqa: BLE001
            return False, str(e)

    @staticmethod
    def _format(
        category: str,
        severity: str,
        message: str,
        details: Optional[dict[str, Any]],
        created_at: Optional[datetime] = None,
    ) -> str:
        # Plain text on purpose: scraped content in messages would break
        # Telegram's Markdown parser.
        lines = [f"[basera] {category.upper()} ({severity})", message]
        for key, value in (details or {}).items():
            if key == "suppressed_reason" or value in (None, ""):
                continue
            lines.append(f"{key}: {value}")
        if created_at is not None:
            lines.append(f"(delayed, raised at {created_at:%Y-%m-%d %H:%M} UTC)")
        else:
            lines.append(f"{datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC")
        return "\n".join(lines)
