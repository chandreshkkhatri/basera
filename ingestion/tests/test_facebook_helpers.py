"""Pure helpers in the Facebook source: time parsing, URL normalization,
post-id generation, permalink reconstruction."""

from datetime import datetime, timedelta, timezone

import pytest

from ingestion.sources.facebook import (
    _is_post_href,
    _looks_like_timestamp_text,
    _permalinks_in_html,
    generate_post_id,
    normalize_post_url,
    parse_facebook_time,
    reconstruct_post_url,
)

EPS = timedelta(seconds=10)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TestParseFacebookTime:
    """Every result must be timezone-aware UTC and never in the future —
    naive local datetimes were stored as UTC, skewing posts ~5.5h ahead."""

    @pytest.mark.parametrize(
        ("text", "delta"),
        [
            ("23 min", timedelta(minutes=23)),
            ("5 hours ago", timedelta(hours=5)),
            ("2 hrs", timedelta(hours=2)),
            ("yesterday", timedelta(days=1)),
            ("3 days ago", timedelta(days=3)),
        ],
    )
    def test_relative_times(self, text, delta):
        parsed = parse_facebook_time(text)
        assert parsed.tzinfo is not None
        assert abs((utcnow() - delta) - parsed) < EPS

    def test_absolute_date_gets_current_year_not_1900(self):
        parsed = parse_facebook_time("january 5 at 3:45 pm")
        assert parsed.year in (utcnow().year, utcnow().year - 1)
        assert parsed.tzinfo is not None

    def test_absolute_date_never_in_future(self):
        # A December date parsed in January must step back a year.
        parsed = parse_facebook_time("december 31 at 11:59 pm")
        assert parsed <= utcnow() + EPS

    def test_garbage_falls_back_to_aware_now(self):
        parsed = parse_facebook_time("weird string")
        assert parsed.tzinfo is not None
        assert abs(utcnow() - parsed) < EPS


class TestNormalizePostUrl:
    def test_canonical_group_post_url_passes_through(self):
        url = "https://www.facebook.com/groups/punehomes/posts/123456"
        assert normalize_post_url(url) == url + "/"

    def test_strips_query_noise(self):
        url = "https://www.facebook.com/groups/punehomes/posts/123456?comment_id=9&ref=share"
        assert (
            normalize_post_url(url)
            == "https://www.facebook.com/groups/punehomes/posts/123456/"
        )

    def test_story_php_rewritten(self):
        url = "https://m.facebook.com/story.php?story_fbid=111&id=222"
        assert (
            normalize_post_url(url)
            == "https://www.facebook.com/groups/222/posts/111/"
        )

    def test_empty_stays_empty(self):
        assert normalize_post_url("") == ""


class TestGeneratePostId:
    def test_real_post_id_from_url(self):
        assert (
            generate_post_id("https://www.facebook.com/groups/g/posts/987/", "text")
            == "fb_post_987"
        )

    def test_story_fbid_from_url(self):
        assert (
            generate_post_id("https://x.com/story.php?story_fbid=42&id=1", "text")
            == "fb_post_42"
        )

    def test_hash_fallback_is_stable_and_whitespace_insensitive(self):
        a = generate_post_id("", "2 BHK  for rent\nin Baner")
        b = generate_post_id("", "2 BHK for rent in Baner")
        assert a == b
        assert a.startswith("fb_hash_")


class TestReconstructPostUrl:
    def test_from_group_url_and_real_post_id(self):
        assert reconstruct_post_url(
            "https://www.facebook.com/groups/punehomes/", "fb_post_123"
        ) == "https://www.facebook.com/groups/punehomes/posts/123/"

    def test_from_bare_group_slug(self):
        assert reconstruct_post_url("punehomes", "fb_post_9") == (
            "https://www.facebook.com/groups/punehomes/posts/9/"
        )

    def test_hash_ids_cannot_reconstruct(self):
        assert reconstruct_post_url(
            "https://www.facebook.com/groups/punehomes/", "fb_hash_abc"
        ) is None

    def test_missing_group_returns_none(self):
        assert reconstruct_post_url(None, "fb_post_123") is None


@pytest.mark.parametrize(
    ("href", "expected"),
    [
        ("https://www.facebook.com/groups/g/posts/1/", True),
        ("https://www.facebook.com/groups/g/permalink/1/", True),
        ("https://m.facebook.com/story.php?story_fbid=1&id=2", True),
        ("https://www.facebook.com/some.profile", False),
        ("", False),
    ],
)
def test_is_post_href(href, expected):
    assert _is_post_href(href) is expected


class TestPermalinksInHtml:
    def test_absolute_group_post_link(self):
        html = '<a href="https://www.facebook.com/groups/punehomes/posts/123456?comment_id=9">2h</a>'
        assert _permalinks_in_html(html) == [
            "https://www.facebook.com/groups/punehomes/posts/123456/"
        ]

    def test_relative_permalink_form(self):
        html = '<a href="/groups/12345/permalink/67890/">link</a>'
        assert _permalinks_in_html(html) == [
            "https://www.facebook.com/groups/12345/permalink/67890"
        ]

    def test_story_fbid_with_entity_escaped_amp(self):
        html = "href=\"story.php?story_fbid=111&amp;id=222\""
        assert _permalinks_in_html(html) == [
            "https://www.facebook.com/groups/222/posts/111/"
        ]

    def test_dedup_and_order(self):
        html = (
            '<a href="/groups/g/posts/1"></a>'
            '<a href="/groups/g/posts/2"></a>'
            '<a href="/groups/g/posts/1"></a>'
        )
        urls = _permalinks_in_html(html)
        assert [u.rstrip("/").rsplit("/", 1)[-1] for u in urls] == ["1", "2"]

    def test_none_found(self):
        assert _permalinks_in_html("<div>no links at all</div>") == []
        assert _permalinks_in_html("") == []


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2h", True),
        ("15 m", True),
        ("3 hrs", True),
        ("5 days ago", True),
        ("Yesterday at 9:41 PM", True),
        ("July 8 at 3:45 PM", True),
        ("Just now", True),
        ("Ravi Kumar", False),
        ("Like", False),
        ("", False),
        ("a very long piece of text that is clearly not a timestamp", False),
    ],
)
def test_looks_like_timestamp_text(text, expected):
    assert _looks_like_timestamp_text(text) is expected
