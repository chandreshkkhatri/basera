"""Diagnose why browser-mode post-URL extraction has a low hit rate.

Probes each rung of the extraction ladder on live posts and captures the
signals we're currently blind to — so we learn WHICH step fails instead of
only seeing the end `url_missing` count. Writes artifacts (per-post HTML +
screenshots, a GraphQL sample, page HTML, summary.json) under
ingestion/state/diagnostics/.

Hypotheses it tests in one run:
  A. Timestamp finder matches nothing -> hover/click rungs never fire.
  B. Hover doesn't hydrate anchors within our wait.
  C. Permalinks are absent from post/page HTML entirely.
  D. Permalinks/post_ids ARE in the GraphQL feed responses (interception path).

    python -m ingestion diagnose-urls --group <url> [--posts 8]
"""

from __future__ import annotations

import json
import logging

from ..config import Settings
from ..sources.facebook import (
    POST_SELECTOR,
    _PERMALINK_RE,
    _STORY_RE,
    _is_post_href,
    _looks_like_timestamp_text,
    _permalinks_in_html,
    FacebookSource,
)
from ..sources.fb_graphql import StoryIndex

log = logging.getLogger(__name__)


def diagnose(settings: Settings, group: str, posts: int) -> int:
    settings.require("facebook")
    src = FacebookSource(settings)
    outdir = settings.state_path / "diagnostics"
    outdir.mkdir(parents=True, exist_ok=True)

    graphql = {"responses": 0, "with_permalink": 0, "with_post_id": 0, "with_message": 0}
    biggest = {"size": 0}
    gql_log: list[dict] = []
    # The production interception path: parse stories out of the same responses.
    index = StoryIndex()

    src._setup_playwright()
    page = src.page

    # (D) Inspect every GraphQL response; the feed payload is the big one with
    # message text — save the largest so we can see how post links appear.
    def on_response(resp) -> None:
        try:
            if "graphql" not in resp.url:
                return
            body = resp.text()
        except Exception:  # noqa: BLE001 — body unavailable for some responses
            return
        graphql["responses"] += 1
        has_permalink = bool(_PERMALINK_RE.search(body)) or "permalink_url" in body
        has_post_id = '"post_id"' in body or "story_fbid" in body
        has_message = '"message":{"' in body or '"message":{' in body
        if has_permalink:
            graphql["with_permalink"] += 1
        if has_post_id:
            graphql["with_post_id"] += 1
        if has_message:
            graphql["with_message"] += 1
        gql_log.append({
            "bytes": len(body),
            "permalink": has_permalink,
            "post_id": has_post_id,
            "message": has_message,
        })
        # Keep the largest body carrying message text — almost certainly the feed.
        if has_message and len(body) > biggest["size"]:
            biggest["size"] = len(body)
            (outdir / "graphql_feed.json").write_text(body[:600_000], encoding="utf-8")
        # Feed the production parser so we can report its real resolution.
        try:
            index.add_response(body)
        except Exception as e:  # noqa: BLE001
            log.debug("index add failed: %s", e)

    page.on("response", on_response)

    try:
        if not src._login():
            log.error("Login failed — refresh the Facebook session first.")
            return 4
        if not src._navigate(group):
            log.error("Could not open group: %s", group)
            return 1
        src._switch_to_new_listings()

        # Wait for the feed to actually hydrate (the real loop is patient too),
        # then scroll to pull a few batches + their GraphQL responses.
        try:
            page.wait_for_selector(POST_SELECTOR, timeout=25_000)
        except Exception:  # noqa: BLE001
            log.warning("POST_SELECTOR never appeared within 25s (feed variant?)")
        for _ in range(5):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            page.wait_for_timeout(2500)

        # (C) Page-level embedded permalinks (zero-interaction path).
        content = page.content()
        page_permalinks = len(set(_PERMALINK_RE.findall(content)))
        page_stories = len(set(_STORY_RE.findall(content)))
        (outdir / "page.html").write_text(content[:2_000_000], encoding="utf-8")

        locator = page.locator(POST_SELECTOR)
        n = min(locator.count(), posts)
        log.info("Probing %d posts in %s", n, group)
        rows: list[dict] = []

        for i in range(n):
            post = locator.nth(i)
            try:
                post.scroll_into_view_if_needed(timeout=2000)
                page.wait_for_timeout(300)
            except Exception:  # noqa: BLE001
                pass

            links = post.locator("[role='link']")
            lc = links.count()
            anchors = post.locator("a[href]")

            def post_hrefs() -> int:
                found = 0
                for k in range(min(anchors.count(), 30)):
                    try:
                        href = anchors.nth(k).get_attribute("href") or ""
                    except Exception:  # noqa: BLE001
                        continue
                    if _is_post_href(href):
                        found += 1
                return found

            # (A) timestamp-text candidates
            ts_matches, ts_samples = 0, []
            for j in range(min(lc, 25)):
                try:
                    node = links.nth(j)
                    txt = node.get_attribute("aria-label") or node.inner_text(timeout=400)
                except Exception:  # noqa: BLE001
                    continue
                if txt and _looks_like_timestamp_text(txt):
                    ts_matches += 1
                    if len(ts_samples) < 3:
                        ts_samples.append(" ".join(txt.split())[:30])

            hrefs_before = post_hrefs()

            # (B) hover the timestamp-ish nodes, then re-check anchors
            hovered = 0
            for j in range(min(lc, 25)):
                if hovered >= 3:
                    break
                try:
                    node = links.nth(j)
                    txt = node.get_attribute("aria-label") or node.inner_text(timeout=400)
                    if txt and _looks_like_timestamp_text(txt):
                        node.hover(timeout=1500)
                        hovered += 1
                        page.wait_for_timeout(400)
                except Exception:  # noqa: BLE001
                    continue
            hrefs_after = post_hrefs()

            # Measure the shipped fix: poll the REAL fast path like
            # _post_url_aggressive now does (no navigation).
            polled = ""
            for _ in range(settings.url_poll_attempts):
                polled = src._post_url(post)
                if polled:
                    break
                page.wait_for_timeout(settings.url_poll_interval_ms)

            # (D') The production GraphQL path: does an intercepted story resolve
            # this post (by id from the fast path, else by normalised text)?
            gstory = None
            try:
                dom = src._extract_post(post, resolve_url=False) or {}
                dom_text = " ".join(dom.get("text", "").split())
                gstory = index.match(dom_text, polled) if dom_text else None
            except Exception:  # noqa: BLE001
                pass

            try:
                html = post.inner_html()
            except Exception:  # noqa: BLE001
                html = ""
            rec = {
                "i": i,
                "role_link_nodes": lc,
                "timestamp_matches": ts_matches,
                "timestamp_samples": ts_samples,
                "post_hrefs_before": hrefs_before,
                "post_hrefs_after_hover": hrefs_after,
                "hovered": hovered,
                "polled_fast_path": bool(polled),
                "graphql_resolved": bool(gstory),
                "graphql_url": gstory.url if gstory else "",
                "html_permalinks": len(_permalinks_in_html(html)),
            }
            rows.append(rec)
            (outdir / f"post_{i}.html").write_text(html[:500_000], encoding="utf-8")
            try:
                post.screenshot(path=str(outdir / f"post_{i}.png"))
            except Exception:  # noqa: BLE001
                pass
            log.info(
                "post %d: role_links=%d ts=%d anchors(before/after)=%d/%d html_permalinks=%d %s",
                i, lc, ts_matches, hrefs_before, hrefs_after,
                rec["html_permalinks"], ts_samples,
            )

        def total(key: str) -> int:
            return sum(r[key] for r in rows)

        summary = {
            "posts_probed": len(rows),
            "page_level_permalinks": page_permalinks,
            "page_level_stories": page_stories,
            "graphql": graphql,
            "totals": {
                k: total(k)
                for k in (
                    "timestamp_matches",
                    "post_hrefs_before",
                    "post_hrefs_after_hover",
                    "html_permalinks",
                )
            },
            "posts": rows,
        }
        (outdir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

        polled_hits = sum(1 for r in rows if r["polled_fast_path"])
        graphql_hits = sum(1 for r in rows if r["graphql_resolved"])
        log.info("=== SUMMARY (%d posts) ===", len(rows))
        log.info("FIX polled-fast-path hits: %d / %d posts", polled_hits, len(rows))
        log.info(
            "GRAPHQL stories parsed: %d | resolved posts: %d / %d",
            len(index), graphql_hits, len(rows),
        )
        log.info("A timestamp matches (total): %d", total("timestamp_matches"))
        log.info(
            "B post anchors before/after hover (total): %d / %d",
            total("post_hrefs_before"), total("post_hrefs_after_hover"),
        )
        log.info("C html permalinks in posts: %d | page-level: permalinks=%d story.php=%d",
                 total("html_permalinks"), page_permalinks, page_stories)
        log.info(
            "D graphql responses=%d with_permalink=%d with_post_id=%d with_message=%d",
            graphql["responses"], graphql["with_permalink"],
            graphql["with_post_id"], graphql["with_message"],
        )
        top = sorted(gql_log, key=lambda r: r["bytes"], reverse=True)[:5]
        for r in top:
            log.info("  gql %7d bytes  permalink=%s post_id=%s message=%s",
                     r["bytes"], r["permalink"], r["post_id"], r["message"])
        summary["graphql_responses"] = gql_log
        (outdir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
        log.info("Artifacts: %s", outdir)
        return 0
    finally:
        src._teardown()
