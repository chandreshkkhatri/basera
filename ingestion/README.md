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
playwright install chromium        # for Facebook browser scraping
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
python -m ingestion groups list

# scrape every enabled group (of every enabled city), or just one
python -m ingestion run                       # all enabled groups
python -m ingestion run --group <url> --posts 50 [--scrape-only] [--api]
python -m ingestion analyze [--workers N]     # LLM-analyze scrape-only captures
python -m ingestion backfill [--results-dir scraper/results]
python -m ingestion check
```

Interactive Facebook login happens on first run; the session persists under
`ingestion/state/` so subsequent cron runs are unattended.

## Environment (.env)

```ini
DATABASE_URL=postgresql+psycopg://basera:basera@localhost:5433/basera

MODEL_PROVIDER=openai            # or gemini
OPENAI_API_KEY=sk-...            # or GEMINI_API_KEY
GOOGLE_MAPS_API_KEY=...

# Facebook (groups are registered in the DB, not here)
FB_ACCESS_TOKEN=...              # optional, enables --api mode
FB_GROUP_ID=...                  # optional, for --api mode
```

## Database contract

The web app (Drizzle) **owns the schema and migrations**. This engine only
`INSERT ... ON CONFLICT`s and never migrates. `db/tables.py` mirrors the Drizzle
schema; `schema_check` fails fast if the live DB drifts. See
[web/README.md](../web/README.md) for the migration rules.
