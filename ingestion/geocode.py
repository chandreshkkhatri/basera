"""Geocoding via Google Maps, with a Postgres-backed cache. Distance-from-
office is intentionally NOT here — the web app computes distance per user
query from a point of interest."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional, Tuple

import googlemaps

from .config import Settings

if TYPE_CHECKING:
    from .db.repo import Repo

log = logging.getLogger(__name__)


def _cache_key(location: str, city: Optional[str]) -> str:
    full = location
    if city and city.lower() not in location.lower():
        full = f"{location}, {city}"
    return " ".join(full.lower().split())


class Geocoder:
    def __init__(self, settings: Settings, repo: "Repo | None" = None):
        self._client = googlemaps.Client(key=settings.google_maps_api_key)
        # Optional cache: the distinct locality space per city is tiny, so
        # caching cuts the Google Maps bill to near zero after warm-up.
        self._repo = repo

    def geocode(
        self, location: str, city: Optional[str] = None
    ) -> Optional[Tuple[float, float]]:
        """Return (lat, lon) for a location string, or None. Falls back from
        'location' to 'location, city' (ported from telegram_bot.py:294-309).
        Definite no-results are cached too (negative cache); API errors are
        never cached."""
        key = _cache_key(location, city)
        if self._repo is not None:
            try:
                cached = self._repo.geocode_cache_get(key)
            except Exception as e:  # noqa: BLE001 — cache must never break geocoding
                log.debug("geocode cache read failed: %s", e)
                cached = None
            if cached is not None:
                lat, lng = cached
                return (lat, lng) if lat is not None and lng is not None else None

        try:
            full = location
            if city and city.lower() not in location.lower():
                full = f"{location}, {city}"
            result = self._client.geocode(full)
        except Exception as e:  # noqa: BLE001
            log.warning("Geocoding failed for '%s': %s", location, e)
            return None

        coords: Optional[Tuple[float, float]] = None
        if result:
            loc = result[0]["geometry"]["location"]
            coords = (loc["lat"], loc["lng"])

        if self._repo is not None:
            try:
                self._repo.geocode_cache_put(
                    key, coords[0] if coords else None, coords[1] if coords else None
                )
            except Exception as e:  # noqa: BLE001
                log.debug("geocode cache write failed: %s", e)
        return coords
