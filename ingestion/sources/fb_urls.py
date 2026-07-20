"""Facebook post-URL canonicalisation, shared by the DOM scraper
(`facebook.py`) and the GraphQL interception parser (`fb_graphql.py`).

Both paths MUST derive the same `source_id` for the same post, or a post seen
via GraphQL (a `/permalink/<id>/` URL) and the same post seen via the DOM (a
`/posts/<id>` URL) would dedup as two rows. Keeping the canonicaliser in one
place is what guarantees that.
"""

from __future__ import annotations

import re

# `/groups/<slug>/permalink/<id>` and `/groups/<slug>/posts/<id>` are the same
# post — Facebook's GraphQL `wwwURL` uses the permalink shape, the DOM anchors
# use the posts shape. Host optional so relative hrefs canonicalise too.
_GROUP_POST_RE = re.compile(
    r"(?:https://www\.facebook\.com)?/groups/([^/?#]+)/(?:posts|permalink)/(\d+)"
)
_STORY_RE = re.compile(r"story\.php\?story_fbid=(\d+)&(?:amp;)?id=(\d+)")


def normalize_post_url(url: str) -> str:
    """Canonicalise any post-permalink shape to
    `https://www.facebook.com/groups/<slug>/posts/<id>/`. Unrecognised URLs are
    returned unchanged."""
    if not url:
        return url
    m = _GROUP_POST_RE.search(url)
    if m:
        return f"https://www.facebook.com/groups/{m.group(1)}/posts/{m.group(2)}/"
    m2 = _STORY_RE.search(url)
    if m2:
        post_id, group_id = m2.group(1), m2.group(2)
        return f"https://www.facebook.com/groups/{group_id}/posts/{post_id}/"
    return url


def post_id_from_url(url: str) -> str | None:
    """The numeric post id from a permalink/posts/story URL, or None."""
    if not url:
        return None
    for pat in (r"/posts/(\d+)", r"/permalink/(\d+)", r"story_fbid=(\d+)"):
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None
