"""WhatsApp Web source. Selectors + launch args ported verbatim from
whatsapp_bot.py; adds sender/contact parsing and stable message ids."""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime
from typing import Iterator, Optional

from playwright.sync_api import sync_playwright

from ..config import Settings
from ..models import RawPost

log = logging.getLogger(__name__)

# "[HH:MM, DD/MM/YYYY] Sender Name: " — capture both timestamp and sender.
_PRE_PLAIN = re.compile(r"\[(?P<ts>.*?)\]\s*(?P<sender>.*?):\s*$")


class WhatsAppSource:
    name = "whatsapp"

    def __init__(self, settings: Settings):
        self.settings = settings

    def _contact(self, sender: str) -> tuple[Optional[str], Optional[str]]:
        """Return (author_name, contact_url). Phone-shaped senders get a
        wa.me link; named senders keep the name only."""
        digits = re.sub(r"\D", "", sender)
        if len(digits) >= 10:
            return sender.strip() or None, f"https://wa.me/{digits}"
        return sender.strip() or None, None

    def iter_posts(
        self, target: Optional[str] = None, limit: Optional[int] = None
    ) -> Iterator[RawPost]:
        s = self.settings
        chat_name = target or s.whatsapp_target_chat
        if not chat_name:
            raise SystemExit("WHATSAPP_TARGET_CHAT not set (or pass --chat).")

        user_data_path = s.chrome_user_data_dir or str(
            s.state_path / "profiles" / "whatsapp"
        )

        with sync_playwright() as p:
            try:
                context = p.chromium.launch_persistent_context(
                    user_data_dir=user_data_path,
                    headless=s.headless,
                    channel="chrome",
                    args=["--disable-blink-features=AutomationControlled"],
                    ignore_default_args=["--no-sandbox"],
                )
                page = context.pages[0] if context.pages else context.new_page()
            except Exception as e:  # noqa: BLE001
                log.warning("Profile launch failed (%s); plain Chrome", e)
                browser = p.chromium.launch(
                    headless=s.headless, channel="chrome",
                    ignore_default_args=["--no-sandbox"],
                )
                context = browser.new_context()
                page = context.new_page()

            page.goto("https://web.whatsapp.com")
            input("Scan the QR code, then press Enter when chats are visible...")

            search = "div[contenteditable='true'][data-tab='3']"
            page.wait_for_selector(search, timeout=30000)
            page.click(search)
            page.fill(search, chat_name)
            page.wait_for_timeout(1000)
            page.press(search, "Enter")
            page.wait_for_timeout(2000)
            log.info("Opened chat: %s", chat_name)

            # Scroll up to load history.
            try:
                scrollable = "div.copyable-area"
                page.wait_for_selector(scrollable, timeout=s.selector_timeout_ms)
                for _ in range(s.whatsapp_scroll_rounds):
                    page.evaluate(
                        f"document.querySelector('{scrollable}').scrollTop = 0"
                    )
                    page.wait_for_timeout(1000)
            except Exception as e:  # noqa: BLE001
                log.debug("Scroll failed: %s", e)

            page.wait_for_selector("div.copyable-text", timeout=s.selector_timeout_ms)
            elements = page.query_selector_all("div.copyable-text")
            log.info("Found %d message elements", len(elements))

            count = 0
            for element in elements:
                if limit and count >= limit:
                    break
                try:
                    data_pre = element.get_attribute("data-pre-plain-text")
                    if not data_pre:
                        continue
                    m = _PRE_PLAIN.search(data_pre)
                    if not m:
                        continue
                    dt = datetime.strptime(m.group("ts"), "%H:%M, %d/%m/%Y")
                    sender = m.group("sender")

                    text_el = element.query_selector("span.selectable-text")
                    if not text_el:
                        continue
                    text = text_el.inner_text()
                    if not text.strip():
                        continue

                    # Stable id: prefer WhatsApp's own message id, else hash.
                    source_id = self._message_id(element, dt, sender, text)
                    author_name, contact_url = self._contact(sender)

                    count += 1
                    yield RawPost(
                        source=self.name,
                        source_id=source_id,
                        text=text,
                        posted_at=dt,
                        source_group=chat_name,
                        source_url=None,  # WhatsApp has no public permalink
                        author_name=author_name,
                        author_url=contact_url,
                        meta={"sender": sender},
                    )
                except Exception as e:  # noqa: BLE001
                    log.debug("Skipping message: %s", e)
                    continue

            context.close()

    def _message_id(self, element, dt: datetime, sender: str, text: str) -> str:
        try:
            row = element.query_selector("xpath=ancestor::div[@data-id][1]")
            if row:
                data_id = row.get_attribute("data-id")
                if data_id:
                    return f"wa_{data_id}"
        except Exception as e:  # noqa: BLE001
            log.debug("data-id lookup failed: %s", e)
        digest = hashlib.sha1(
            f"{dt.isoformat()}|{sender}|{text}".encode("utf-8")
        ).hexdigest()[:16]
        return f"wa_hash_{digest}"
