"""Geocoder: precision capture + Postgres cache interplay (mocked Google)."""

from unittest.mock import MagicMock, patch

from ingestion.config import Settings
from ingestion.geocode import Geocoder, _cache_key


def make_geocoder(api_result=None, cached=None, with_repo=True):
    with patch("ingestion.geocode.googlemaps") as gm:
        client = MagicMock()
        gm.Client.return_value = client
        client.geocode.return_value = api_result if api_result is not None else []
        repo = MagicMock() if with_repo else None
        if repo is not None:
            repo.geocode_cache_get.return_value = cached
        g = Geocoder(Settings(google_maps_api_key="test"), repo)
    return g, client, repo


ROOFTOP_RESULT = [
    {
        "geometry": {
            "location": {"lat": 18.55, "lng": 73.78},
            "location_type": "ROOFTOP",
        }
    }
]


def test_geocode_returns_precision_and_caches_it():
    g, client, repo = make_geocoder(api_result=ROOFTOP_RESULT)
    assert g.geocode("Baner", "Pune") == (18.55, 73.78, "ROOFTOP")
    repo.geocode_cache_put.assert_called_once_with(
        "baner, pune", 18.55, 73.78, "ROOFTOP"
    )


def test_cache_hit_skips_api():
    g, client, repo = make_geocoder(cached=(18.55, 73.78, "APPROXIMATE"))
    assert g.geocode("Baner", "Pune") == (18.55, 73.78, "APPROXIMATE")
    client.geocode.assert_not_called()


def test_negative_cache_hit_returns_none_without_api():
    g, client, repo = make_geocoder(cached=(None, None, None))
    assert g.geocode("Nowhere Xyz", "Pune") is None
    client.geocode.assert_not_called()


def test_no_result_writes_negative_cache():
    g, client, repo = make_geocoder(api_result=[])
    assert g.geocode("Nowhere Xyz", "Pune") is None
    repo.geocode_cache_put.assert_called_once_with(
        "nowhere xyz, pune", None, None, None
    )


def test_missing_location_type_yields_none_precision():
    g, client, repo = make_geocoder(
        api_result=[{"geometry": {"location": {"lat": 1.0, "lng": 2.0}}}]
    )
    assert g.geocode("Baner", "Pune") == (1.0, 2.0, None)


def test_works_without_repo():
    g, client, repo = make_geocoder(api_result=ROOFTOP_RESULT, with_repo=False)
    assert g.geocode("Baner", "Pune") == (18.55, 73.78, "ROOFTOP")


def test_cache_key_appends_city_only_when_absent():
    assert _cache_key("Baner", "Pune") == "baner, pune"
    assert _cache_key("Baner, Pune", "Pune") == "baner, pune"
    # normalization squashes whitespace + lowercases
    assert _cache_key("  Baner   Road ", None) == "baner road"
