# Basera Ingestion Engine

Scrapes house-rental posts from Telegram, WhatsApp and Facebook groups, extracts
structured fields with an LLM, geocodes them, and upserts into the shared
Postgres database the [web app](../web) reads. Runs as a CLI, manually or via
cron.

## Pipeline

```
Source.iter_posts() → RawPost
   → insert into raw_posts (dedup on source+source_id, before any LLM call)
   → classify_rental → extract_listing (LLM) → geocode → upsert into listings
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
| `db/` | SQLAlchemy Core tables (mirror the Drizzle schema), upserts, `schema_check` |
| `sources/` | `telegram.py`, `whatsapp.py`, `facebook.py` (browser + Graph API) |
| `scripts/backfill_results.py` | one-off import of legacy `scraper/results/*.json` |

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r ingestion/requirements.txt
playwright install chromium        # for WhatsApp/Facebook browser scraping
cp .env.example .env               # fill in credentials (see below)
```

`DATABASE_URL` must point at the same Postgres the web app migrated. Run the
migrations from the web app first (`cd web && npm run db:migrate`), then:

```bash
python -m ingestion check          # validates settings, DB connectivity, schema
```

## Commands

```bash
python -m ingestion run telegram  [--limit N] [--scrape-only] [--chat @group]
python -m ingestion run whatsapp  [--chat "Chat Name"] [--scrape-only]
python -m ingestion run facebook  [--group URL] [--posts N] [--scrape-only] [--api]
python -m ingestion analyze       [--source facebook] [--workers N]
python -m ingestion backfill      [--results-dir scraper/results]
python -m ingestion groups        list | add <url>
python -m ingestion check
```

Interactive auth happens on first run (Telegram 2FA prompt, WhatsApp QR scan,
Facebook manual login). Sessions persist under `ingestion/state/` so subsequent
cron runs are unattended.

## Environment (.env)

```ini
DATABASE_URL=postgresql+psycopg://basera:basera@localhost:5433/basera

MODEL_PROVIDER=openai            # or gemini
OPENAI_API_KEY=sk-...            # or GEMINI_API_KEY
GOOGLE_MAPS_API_KEY=...

# Telegram
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
TELEGRAM_PHONE=+91...
TARGET_CHAT=@some_group          # or TARGET_PEER_ID

# WhatsApp
WHATSAPP_TARGET_CHAT=Exact Chat Title

# Facebook
FACEBOOK_TARGET_GROUP=https://www.facebook.com/groups/xxxx
FB_ACCESS_TOKEN=...              # optional, enables --api mode
FB_GROUP_ID=...
```

## Database contract

The web app (Drizzle) **owns the schema and migrations**. This engine only
`INSERT ... ON CONFLICT`s and never migrates. `db/tables.py` mirrors the Drizzle
schema; `schema_check` fails fast if the live DB drifts. See
[web/README.md](../web/README.md) for the migration rules.
