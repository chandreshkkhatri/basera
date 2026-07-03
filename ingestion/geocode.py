"""Geocoding via Google Maps. Distance-from-office is intentionally NOT here —
the web app computes distance per user query from a point of interest."""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import googlemaps

from .config import Settings

log = logging.getLogger(__name__)


class Geocoder:
    def __init__(self, settings: Settings):
        self._client = googlemaps.Client(key=settings.google_maps_api_key)

    def geocode(
        self, location: str, city: Optional[str] = None
    ) -> Optional[Tuple[float, float]]:
        """Return (lat, lon) for a location string, or None. Falls back from
        'location' to 'location, city' (ported from telegram_bot.py:294-309)."""
        try:
            full = location
            if city and city.lower() not in location.lower():
                full = f"{location}, {city}"
            result = self._client.geocode(full)
            if result:
                loc = result[0]["geometry"]["location"]
                return (loc["lat"], loc["lng"])
            return None
        except Exception as e:  # noqa: BLE001
            log.warning("Geocoding failed for '%s': %s", location, e)
            return None
