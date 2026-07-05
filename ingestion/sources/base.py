"""The Source protocol every scraper implements."""

from __future__ import annotations

from typing import Iterator, Optional, Protocol, runtime_checkable

from ..models import RawPost


class SourceLoginError(RuntimeError):
    """A source's session is expired/absent and needs human re-login.

    Distinct from a generic scrape error: the run is recorded with status
    'login_failed', raises a 'login_expiry' alert, and the CLI stops scraping
    further groups (they share the same browser profile)."""


@runtime_checkable
class Source(Protocol):
    name: str

    def iter_posts(
        self, target: Optional[str] = None, limit: Optional[int] = None
    ) -> Iterator[RawPost]:
        """Yield RawPost objects scraped from the source."""
        ...
