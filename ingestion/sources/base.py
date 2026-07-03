"""The Source protocol every scraper implements."""

from __future__ import annotations

from typing import Iterator, Optional, Protocol, runtime_checkable

from ..models import RawPost


@runtime_checkable
class Source(Protocol):
    name: str

    def iter_posts(
        self, target: Optional[str] = None, limit: Optional[int] = None
    ) -> Iterator[RawPost]:
        """Yield RawPost objects scraped from the source."""
        ...
