"""Telegram source. Auth/entity-resolution ported verbatim from
telegram_bot.py:403-444; adds sender capture for the contact link."""

from __future__ import annotations

import logging
from typing import Iterator, Optional

from telethon.errors import SessionPasswordNeededError
from telethon.sync import TelegramClient

from ..config import Settings
from ..models import RawPost

log = logging.getLogger(__name__)


def build_message_url(message, chat_entity) -> Optional[str]:
    """t.me link to a specific message (ported from get_telegram_link)."""
    username = getattr(chat_entity, "username", None)
    if username:
        return f"https://t.me/{username}/{message.id}"
    chat_id = getattr(chat_entity, "id", None)
    if chat_id is not None:
        id_str = str(chat_id)
        if id_str.startswith("-100"):
            clean_id = id_str[4:]
        elif id_str.startswith("-"):
            clean_id = id_str[1:]
        else:
            clean_id = id_str
        return f"https://t.me/c/{clean_id}/{message.id}"
    return None


class TelegramSource:
    name = "telegram"

    def __init__(self, settings: Settings):
        self.settings = settings
        self.session_path = str(settings.state_path / "tg_session")

    def _sender_contact(self, message) -> tuple[Optional[str], Optional[str], Optional[int]]:
        """Return (author_name, contact_url, sender_id) from message.sender."""
        sender = getattr(message, "sender", None)
        if sender is None:
            return None, None, getattr(message, "sender_id", None)
        name = (
            getattr(sender, "title", None)
            or " ".join(
                filter(None, [getattr(sender, "first_name", None),
                              getattr(sender, "last_name", None)])
            )
            or None
        )
        username = getattr(sender, "username", None)
        contact_url = f"https://t.me/{username}" if username else None
        return name, contact_url, getattr(message, "sender_id", None)

    def iter_posts(
        self, target: Optional[str] = None, limit: Optional[int] = None
    ) -> Iterator[RawPost]:
        s = self.settings
        target_chat = target or s.target_chat
        peer_id = s.target_peer_id

        with TelegramClient(self.session_path, s.telegram_api_id, s.telegram_api_hash) as client:
            try:
                client.sign_in(s.telegram_phone)
            except SessionPasswordNeededError:
                pw = input("Two-step password: ")
                client.sign_in(password=pw)
            log.info("Connected to Telegram")

            # Resolve entity (ported from telegram_bot.py:422-444).
            if peer_id:
                try:
                    entity = client.get_entity(int(peer_id))
                except (ValueError, TypeError):
                    log.warning("Invalid TARGET_PEER_ID '%s'; using TARGET_CHAT", peer_id)
                    entity = client.get_entity(target_chat)
                except Exception as e:  # noqa: BLE001
                    log.warning("Peer id %s failed (%s); using TARGET_CHAT", peer_id, e)
                    entity = client.get_entity(target_chat)
            else:
                entity = client.get_entity(target_chat)

            chat_id = getattr(entity, "id", "unknown")
            entity_name = (
                getattr(entity, "title", None)
                or getattr(entity, "username", None)
                or f"Peer {chat_id}"
            )
            log.info("Scraping messages from '%s'", entity_name)

            messages = (
                client.iter_messages(entity, limit=limit)
                if limit
                else client.iter_messages(entity)
            )
            for message in messages:
                if not getattr(message, "text", None):
                    continue
                author_name, contact_url, sender_id = self._sender_contact(message)
                permalink = build_message_url(message, entity)
                yield RawPost(
                    source=self.name,
                    # message.id is only unique per chat -> namespace it.
                    source_id=f"{chat_id}:{message.id}",
                    text=message.text,
                    posted_at=message.date,
                    source_group=str(entity_name),
                    source_url=permalink,
                    author_name=author_name,
                    author_url=contact_url or permalink,
                    meta={"sender_id": sender_id},
                )
