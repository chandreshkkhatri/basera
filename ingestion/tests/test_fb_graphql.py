"""GraphQL feed interception: defensive parsing + DOM correlation.

The synthetic payloads mirror Facebook's comet feed shape (a story node that
directly carries `wwwURL`, with `creation_time`/`message`/`actors` in its
subtree). The `graphql_feed.json` fixture test runs against a real captured
payload when one is present (written by `diagnose-urls`)."""

import json
from datetime import timezone
from pathlib import Path

import pytest

from ingestion.sources.facebook import generate_post_id, normalize_post_url
from ingestion.sources.fb_graphql import (
    StoryIndex,
    parse_feed_response,
)

POST_TEXT = "2 BHK for rent in Baner, fully furnished. Contact 9876543210 today."


def _story_node(post_id: str, url_form: str, text: str = POST_TEXT) -> dict:
    return {
        "wwwURL": f"https://www.facebook.com/groups/punehomes/{url_form}/{post_id}/",
        "creation_time": 1784453320,
        "comet_sections": {
            "content": {
                "story": {
                    "message": {"text": text},
                    "actors": [{"name": "Asha R", "id": "100001"}],
                }
            }
        },
    }


def _feed(*nodes: dict) -> str:
    edges = [{"node": n} for n in nodes]
    return json.dumps(
        {"data": {"node": {"timeline_list_feed_units": {"edges": edges}}}}
    )


class TestParseFeedResponse:
    def test_extracts_all_fields(self):
        stories = parse_feed_response(_feed(_story_node("555", "permalink")))
        assert len(stories) == 1
        s = stories[0]
        assert s.post_id == "555"
        assert s.url == "https://www.facebook.com/groups/punehomes/posts/555/"
        assert s.creation_time is not None
        assert s.creation_time.tzinfo == timezone.utc
        assert s.creation_time.year == 2026
        assert "2 BHK for rent in Baner" in s.text
        assert s.author_name == "Asha R"
        assert s.author_id == "100001"

    def test_permalink_and_posts_forms_yield_same_id(self):
        # The same post seen as /permalink/ and /posts/ must dedup to one id.
        stories = parse_feed_response(
            _feed(_story_node("777", "permalink"), _story_node("777", "posts"))
        )
        assert len(stories) == 1
        assert stories[0].post_id == "777"

    def test_multiple_concatenated_json_documents(self):
        body = _feed(_story_node("1", "permalink")) + "\n" + _feed(
            _story_node("2", "posts")
        )
        ids = sorted(s.post_id for s in parse_feed_response(body))
        assert ids == ["1", "2"]

    def test_garbage_never_raises(self):
        assert parse_feed_response("") == []
        assert parse_feed_response("not json at all") == []
        assert parse_feed_response('{"data": {"node": null}}') == []

    def test_node_without_permalink_url_is_skipped(self):
        # A wwwURL that isn't a post permalink (e.g. a profile) is not a story.
        body = json.dumps(
            {"wwwURL": "https://www.facebook.com/asha.profile", "message": {"text": "x"}}
        )
        assert parse_feed_response(body) == []


class TestStoryIndex:
    def _index(self) -> StoryIndex:
        idx = StoryIndex()
        idx.add_response(_feed(_story_node("555", "permalink")))
        return idx

    def test_match_by_post_id_from_url(self):
        idx = self._index()
        url = "https://www.facebook.com/groups/x/posts/555/"
        assert idx.match("unrelated text here that is long enough", url).post_id == "555"

    def test_match_by_text_prefix(self):
        idx = self._index()
        # DOM text truncated at "See more" is a prefix of the full GraphQL text.
        assert idx.match(POST_TEXT[:40]).post_id == "555"

    def test_short_text_does_not_match(self):
        idx = self._index()
        assert idx.match("2 BHK") is None

    def test_unrelated_text_does_not_match(self):
        idx = self._index()
        assert idx.match("Completely different post about a car for sale here") is None

    def test_len_and_dedup(self):
        idx = StoryIndex()
        idx.add_response(_feed(_story_node("9", "permalink")))
        assert idx.add_response(_feed(_story_node("9", "posts"))) == 0
        assert len(idx) == 1


class TestUrlCanonicalisation:
    def test_permalink_normalises_to_posts(self):
        assert (
            normalize_post_url("https://www.facebook.com/groups/g/permalink/123/")
            == "https://www.facebook.com/groups/g/posts/123/"
        )

    def test_generate_post_id_from_permalink(self):
        assert (
            generate_post_id("https://www.facebook.com/groups/g/permalink/123/", "t")
            == "fb_post_123"
        )


_FIXTURE = (
    Path(__file__).resolve().parents[1] / "state" / "diagnostics" / "graphql_feed.json"
)


@pytest.mark.skipif(not _FIXTURE.exists(), reason="no captured graphql_feed.json")
def test_parses_real_fixture():
    stories = parse_feed_response(_FIXTURE.read_text(encoding="utf-8"))
    assert stories, "expected at least one story from the captured feed"
    for s in stories:
        assert s.post_id and s.url.endswith("/posts/%s/" % s.post_id)
