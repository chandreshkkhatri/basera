# Post-URL extraction: state & the GraphQL option

Status as of **2026-07-19**. Browser-mode scraping (`ingestion/sources/facebook.py`)
must capture each post's permalink so listings link back to the source. This
doc records where extraction stands and the proposed next step.

## Current approach (shipped)

An escalation ladder in `_post_url_aggressive`:

1. **Poll the fast selector pass** (`url_poll_attempts` × `url_poll_interval_ms`,
   default 6 × 300 ms) — the `<a href=…/permalink/…>` anchor is in the DOM but
   Facebook **lazy-hydrates it ~1 s after scroll-into-view**. The old code
   checked once, too early, and missed it — that was the main bug.
2. Hover timestamp-ish `role=link` nodes, rescan anchors.
3. Regex the post's raw HTML for permalink shapes.
4. Click-through the timestamp, read `page.url`, `go_back()` (capped per run).

`RunStats.url_missing` reports the per-run miss count.

### Measured (diagnostic, `flatsandflatmatesbaner`, 10 posts)
- Poll fast-path alone: **7/10** posts resolved (was ~near-zero in prod before
  the poll fix — anchors were present but read too early).
- The other 3/10 are genuinely anchor-less in the DOM (shared/atypical posts).
- Absolute post time is available as the timestamp node's `aria-label`
  ("Sunday 19 July 2026 at 12:49").

Diagnostic tool: `python -m ingestion diagnose-urls --group <url> --posts N`
(writes artifacts to `ingestion/state/diagnostics/`; stop the runner first to
avoid a browser-profile lock conflict).

## Proposed next step — GraphQL feed interception

The diagnostic confirmed Facebook's feed arrives via `…/graphql` POST responses
whose JSON carries, **per story**, everything we need — and for effectively
100% of posts (20/20 stories in a run where the DOM missed 3):

| Field (in the GraphQL story) | Value seen | Replaces |
|---|---|---|
| `wwwURL` | `https://www.facebook.com/groups/<slug>/permalink/<id>/` | the whole `_post_url` ladder |
| `creation_time` | unix epoch (e.g. `1784453320`) | relative-time parsing + future-dated-post clamps |
| `message.text` | complete post text | DOM text extraction + "See more" expansion |
| `actors[].name` / `id` | author name + profile id | best-effort author, fixes the `contact_url` misnomer |

### Sketch
- `page.on("response")`: for URLs containing `graphql`, read the body; the feed
  payload is the large one containing `"message":{"text"` (≈500–700 KB).
- Parse **defensively** — match `wwwURL` / `creation_time` / `message.text` /
  actor by pattern, not rigid nested paths (the shape is unversioned).
- Map each story → `RawPost` (source_id from the permalink id via the existing
  `generate_post_id`), dedup as today, and **keep the DOM scraper as a fallback
  rung** for anything interception misses.

### Why we're not doing it yet
The poll fix recovered ~70% for ~15 lines and zero fragility. GraphQL buys the
last ~30% plus timestamp/text/author quality, but it's a larger rearchitecture
against an **unversioned, deeply-nested schema** that Facebook reshuffles — real
ongoing maintenance, and it needs several live-iteration cycles on the VM (each
lightly exercises the FB session, which has correlated with transient login
blips). Decision: **bank the poll fix, run it, and revisit ~2026-07-21/22** once
we have real prod `url_missing` numbers over a few days.

### How to revisit
```bash
# real prod miss rate over recent batches (batches with new posts)
ssh oci-us-host "journalctl --user -u basera-runner --since '-2 days' --no-pager \
  | grep -oE 'url_missing=[0-9]+ upserted=[0-9]+'"
```
If the miss rate is acceptably low, GraphQL stays a nice-to-have. If it's still
high (many anchor-less posts), build the interception path above.
