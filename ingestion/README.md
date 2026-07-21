# Basera Ingestion Engine

Scrapes house-rental posts from **Facebook groups**, extracts structured fields
with an LLM, geocodes them, and upserts into the shared Postgres database the
[web app](../web) reads. Runs as a CLI, manually or via cron.

## Cities & groups

Sourcing is Facebook-only, and every group belongs to a **city**. The registry
lives in the DB (`cities`, `groups` tables), managed from the web app's `/admin`
panel or the `groups` CLI command. `run` scrapes every **enabled** group whose
city is also enabled, and each scraped listing inherits its group's city
(derived from `source_group` at upsert time — the LLM city is only a fallback
name).

## Pipeline

```
FacebookSource.iter_posts() → RawPost
   → insert into raw_posts (dedup on source+source_id, before any LLM call)
   → classify_rental → extract_listing (LLM) → geocode
   → derive city from group → upsert into listings
```

Raw capture and LLM analysis are separable: `run --scrape-only` just fills
`raw_posts`; `analyze` processes unprocessed rows later (parallel workers).
Retryable AI-processing failures stay pending in `raw_posts` and are retried by
later `analyze` runs or when a later scrape sees the same post again. Once the
retry budget is exhausted, the raw post is marked failed and stops retrying.

## Layout

| Module | Responsibility |
|--------|----------------|
| `config.py` | pydantic-settings: all env vars + tunables (no magic numbers) |
| `models.py` | `RawPost`, `ExtractedListing` (LLM tool schema), `RunStats` |
| `llm.py` | one `LLMClient` for OpenAI/Gemini: `complete`, `classify_rental`, `extract_listing` |
| `geocode.py` | Google Maps geocoding (lat/lon only — no distance) |
| `pipeline.py` | `run_source()` + `Pipeline.process()/process_many()` |
| `db/` | SQLAlchemy Core tables (mirror the Drizzle schema incl. cities/groups), upserts, group→city resolution, `schema_check` |
| `sources/facebook.py` | Facebook group scraper (browser + Graph API) + per-group lock |
| `scripts/backfill_results.py` | one-off import of legacy `scraper/results/*.json` |

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r ingestion/requirements.txt
# Browser scraping uses Google Chrome by default (BROWSER_CHANNEL=chrome).
# Either have Chrome installed, or:
playwright install chrome          # or: set BROWSER_CHANNEL= and `playwright install chromium`
cp .env.example .env               # fill in credentials (see below)
```

`DATABASE_URL` must point at the same Postgres the web app migrated. Run the
migrations from the web app first (`cd web && npm run db:migrate`), then:

```bash
python -m ingestion check          # validates settings, DB connectivity, schema
```

## Commands

```bash
# register a city+group (or do it in the web /admin panel)
python -m ingestion groups add https://www.facebook.com/groups/xxxx --city Pune
python -m ingestion groups remove https://www.facebook.com/groups/xxxx
python -m ingestion groups list

# scrape every enabled group (of every enabled city), or just one
python -m ingestion run                       # all enabled groups
python -m ingestion run --group <url> --posts 50 [--scrape-only] [--api]
python -m ingestion analyze [--workers N]     # LLM-analyze scrape-only captures
python -m ingestion backfill [--results-dir scraper/results]
python -m ingestion check

# alerting
python -m ingestion alerts test               # send a test Telegram alert
python -m ingestion alerts flush              # deliver queued (undelivered) alerts
python -m ingestion alerts list [--limit 20]  # recent alerts + delivery status
python -m ingestion watchdog                  # stale-data check + outbox flush

# continuous runner (see below)
python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
python -m ingestion.scripts.run_window --forever --interval-minutes 30 --posts 50
```

Interactive Facebook login happens on first run; the session persists under
`ingestion/state/` so subsequent cron runs are unattended.

CLI exit codes (the runner reacts to these): `0` ok · `1` error · `3` LLM
quota exceeded · `4` Facebook login required · `5` database unreachable
(`2` is argparse's usage-error code).

## Alerting

Failures raise **alerts**: rows in the `alerts` table that are then delivered
to a Telegram chat via a bot (outbox pattern — recording and delivery are
independent, so the channel can change later). Configure `TELEGRAM_BOT_TOKEN`
and `TELEGRAM_ALERT_CHAT_ID` (see `.env.example`), then verify with
`python -m ingestion alerts test`.

Categories: `run_failure`, `login_expiry` (expired Facebook session — runs
record status `login_failed` instead of a phantom success), `quota_exceeded`,
`stale_data` (watchdog: no successful run in `ALERT_STALE_RUN_HOURS` or no new
posts in `ALERT_STALE_POSTS_HOURS`), `processing_failed` (post exhausted its
AI retry budget), `db_unavailable` (runner only). Toggle delivery with
`ALERT_CATEGORIES`; identical categories are throttled by
`ALERT_COOLDOWN_MINUTES` (per-category overrides supported). Suppressed or
failed deliveries are still recorded — `alerts list` shows them, and
`alerts flush` (also run automatically after each command) retries anything
still pending.

## Continuous runner

`run_window.py --forever` cycles scrape → analyze → watchdog on an interval,
reacting to exit codes: waits out a down Postgres (probing with `check`),
cools down after quota exhaustion, and backs off when Facebook needs a
re-login. Pair it with the systemd user unit in
[deploy/systemd/basera-runner.service](../deploy/systemd/basera-runner.service)
for auto-restart:

```bash
mkdir -p ~/.config/systemd/user
ln -s ~/code/basera/deploy/systemd/basera-runner.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now basera-runner
journalctl --user -u basera-runner -f
```

Headful Chrome needs your graphical session; for unattended machines set
`HEADLESS=true` (after logging in headfully once) and
`loginctl enable-linger $USER`. Over ssh, `systemctl --user` / `journalctl
--user` need `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first.

> The committed unit hardcodes `~/code/basera`. On the prod VM the repo is at
> `~/deployments/prod/basera`, so the unit is hand-written with the real paths —
> see [docs/deploy.md](../docs/deploy.md) for the production setup, operations
> (logs, 24h stats), and the FB login-expiry fix.

## Environment (.env)

```ini
# Local docker Postgres on 5433. For hosted Postgres, add ?sslmode=require.
DATABASE_URL=postgresql+psycopg://basera:basera@localhost:5433/basera

MODEL_PROVIDER=openai            # or gemini
OPENAI_API_KEY=sk-...            # or GEMINI_API_KEY
GOOGLE_MAPS_API_KEY=...

# Facebook (groups are registered in the DB, not here)
FB_ACCESS_TOKEN=...              # optional, enables --api mode
FB_GROUP_ID=...                  # optional, for --api mode

# Browser (optional)
# BROWSER_CHANNEL=chrome         # set empty to use Playwright's bundled Chromium
#                                # (required on linux-arm64 — no Chrome build exists)
# HEADLESS=false                 # true for unattended/server runs
# BROWSER_NO_SANDBOX=false       # true on server/container VMs (adds --no-sandbox)

# Retry budget for AI-processing failures (optional)
# PROCESSING_MAX_ATTEMPTS=3
# PROCESSING_RETRY_BACKOFF_S=300
```

## Deployment

Production runs this engine natively (venv + systemd user unit) on an OCI VM
against Neon Postgres — see [docs/deploy.md](../docs/deploy.md) for the full
runbook: VM bring-up, `.env`, the systemd unit, operations (log/stats commands),
and the FB login-expiry fix. A `Dockerfile` is also provided for a containerised
deploy. Either way the browser scraper needs a one-time interactive Facebook
login on a machine with a display, then its `ingestion/state/profiles/` copied
to the server.

## Database contract

The web app (Drizzle) **owns the schema and migrations**. This engine only
`INSERT ... ON CONFLICT`s and never migrates. `db/tables.py` mirrors the Drizzle
schema; `schema_check` fails fast if the live DB drifts. See
[web/README.md](../web/README.md) for the migration rules.
