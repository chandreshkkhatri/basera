"""Parse Facebook feed GraphQL responses into per-story records.

Facebook's feed arrives as `…/graphql` POST responses whose JSON carries, per
story, the permalink (`wwwURL`), `creation_time` (unix), full `message.text`,
and `actors[]` (author) — see docs/post_url_extraction.md. This is a far more
reliable source of the post URL (and exact time/text/author) than the DOM
escalation ladder, which misses anchor-less posts.

The schema is **unversioned and deeply nested**, so parsing here is deliberately
defensive: we search by key *name* anywhere under a story node rather than
walking fixed paths, and every failure degrades to "no story" so the DOM path
can take over. `StoryIndex` correlates a captured story to a scraped DOM post by
post id (preferred) or by a normalised-text prefix.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

from .fb_urls import normalize_post_url, post_id_from_url

log = logging.getLogger(__name__)


@dataclass
class GraphStory:
    post_id: str
    url: str
    creation_time: Optional[datetime]
    text: str
    author_name: Optional[str]
    author_id: Optional[str]


def _iter_json_documents(body: str) -> Iterator[Any]:
    """Yield each top-level JSON document in a body. Facebook sometimes streams
    several concatenated objects (one per line), so a single `json.loads` isn't
    enough."""
    body = (body or "").strip()
    if not body:
        return
    try:
        yield json.loads(body)
        return
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    idx, n = 0, len(body)
    while idx < n:
        while idx < n and body[idx] in " \r\n\t":
            idx += 1
        if idx >= n:
            break
        try:
            obj, end = decoder.raw_decode(body, idx)
        except json.JSONDecodeError:
            nl = body.find("\n", idx)
            if nl == -1:
                break
            idx = nl + 1
            continue
        yield obj
        idx = end


def _walk_dicts(node: Any) -> Iterator[dict]:
    """Every dict anywhere in the structure, parents before children."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from _walk_dicts(value)
    elif isinstance(node, list):
        for value in node:
            yield from _walk_dicts(value)


def _find_first(node: Any, key: str) -> Any:
    """First value found for `key` anywhere under `node` (depth-first)."""
    if isinstance(node, dict):
        if key in node:
            return node[key]
        for value in node.values():
            found = _find_first(value, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for value in node:
            found = _find_first(value, key)
            if found is not None:
                return found
    return None


def _story_from_node(node: dict) -> Optional[GraphStory]:
    """Build a GraphStory from a node that directly carries a `wwwURL`, pulling
    time/text/author from anywhere in its subtree. Returns None if the URL
    isn't a post permalink."""
    raw_url = node.get("wwwURL")
    if not isinstance(raw_url, str) or not raw_url:
        return None
    if "/permalink/" not in raw_url and "/posts/" not in raw_url:
        return None
    url = normalize_post_url(raw_url)
    pid = post_id_from_url(url)
    if not pid:
        return None

    creation_time = None
    ct = _find_first(node, "creation_time")
    if isinstance(ct, (int, float)) and ct > 1_000_000_000:
        creation_time = datetime.fromtimestamp(int(ct), tz=timezone.utc)

    text = ""
    message = _find_first(node, "message")
    if isinstance(message, dict) and isinstance(message.get("text"), str):
        text = message["text"]

    author_name = author_id = None
    actors = _find_first(node, "actors")
    if isinstance(actors, list) and actors and isinstance(actors[0], dict):
        name = actors[0].get("name")
        aid = actors[0].get("id")
        author_name = name if isinstance(name, str) else None
        author_id = str(aid) if aid is not None else None

    return GraphStory(
        post_id=pid,
        url=url,
        creation_time=creation_time,
        text=text,
        author_name=author_name,
        author_id=author_id,
    )


def parse_feed_response(body: str) -> list[GraphStory]:
    """All post stories found in a GraphQL response body, deduped by post id.
    Never raises — a malformed/unknown shape yields an empty list."""
    stories: dict[str, GraphStory] = {}
    try:
        for document in _iter_json_documents(body):
            for node in _walk_dicts(document):
                if "wwwURL" not in node:
                    continue
                try:
                    story = _story_from_node(node)
                except Exception as exc:  # noqa: BLE001 — defensive per-node
                    log.debug("story parse failed: %s", exc)
                    continue
                if story and story.post_id not in stories:
                    stories[story.post_id] = story
    except Exception as exc:  # noqa: BLE001 — never break the scrape
        log.debug("graphql body parse failed: %s", exc)
    return list(stories.values())


def _normalize_text(text: str) -> str:
    return "".join((text or "").split()).lower()


class StoryIndex:
    """Accumulates stories captured across GraphQL responses during a scrape and
    correlates them to DOM posts."""

    # Below this many normalised chars, a text-only match is too weak to trust.
    MIN_SIGNATURE = 25
    SIGNATURE_LEN = 60

    def __init__(self, max_stories: int = 2000):
        self._max_stories = max_stories
        self._by_id: dict[str, GraphStory] = {}
        self._by_sig: dict[str, GraphStory] = {}

    def __len__(self) -> int:
        return len(self._by_id)

    def add_response(self, body: str) -> int:
        """Parse a response body and index any new stories. Returns how many
        were added."""
        if len(self._by_id) >= self._max_stories:
            return 0
        added = 0
        for story in parse_feed_response(body):
            if story.post_id in self._by_id:
                continue
            self._by_id[story.post_id] = story
            sig = self._signature(story.text)
            if sig:
                self._by_sig.setdefault(sig, story)
            added += 1
            if len(self._by_id) >= self._max_stories:
                break
        return added

    def _signature(self, text: str) -> str:
        norm = _normalize_text(text)
        return norm[: self.SIGNATURE_LEN] if len(norm) >= self.MIN_SIGNATURE else ""

    def match(self, text: str, post_url: Optional[str] = None) -> Optional[GraphStory]:
        """Find the captured story for a DOM post. Prefers an exact post-id
        match (from a fast-path DOM URL); falls back to a normalised-text
        prefix match (the DOM text is a prefix of GraphQL's full text)."""
        if post_url:
            pid = post_id_from_url(post_url)
            if pid and pid in self._by_id:
                return self._by_id[pid]

        norm = _normalize_text(text)
        if len(norm) < self.MIN_SIGNATURE:
            return None
        exact = self._by_sig.get(norm[: self.SIGNATURE_LEN])
        if exact:
            return exact
        # DOM text and GraphQL text can differ slightly (whitespace, trailing
        # "See more"); accept when one normalised text is a prefix of the other.
        for story in self._by_id.values():
            full = _normalize_text(story.text)
            if not full:
                continue
            if full.startswith(norm[: self.SIGNATURE_LEN]) or norm.startswith(
                full[: self.SIGNATURE_LEN]
            ):
                return story
        return None
