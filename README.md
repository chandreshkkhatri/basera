# Basera

Aggregates house-rental postings scraped from Telegram, WhatsApp and Facebook
groups into one searchable feed, and routes people to **contact the poster on
the original platform**. Basera never handles the transaction — it deep-links
out to the source post (t.me / wa.me / facebook.com).

## Architecture

```
┌────────────────────┐        ┌───────────────┐        ┌────────────────────┐
│  ingestion/ (Python)│  write │   Postgres    │  read  │   web/ (Next.js)   │
│  scrape → LLM →     │───────▶│  listings     │◀───────│  feed · map ·      │
│  geocode → upsert   │        │  raw_posts    │        │  detail · status   │
│  CLI, cron          │        │  scrape_runs  │        │  App Router + API  │
└────────────────────┘        └───────────────┘        └────────────────────┘
```

- **[ingestion/](ingestion/)** — Python data-ingestion engine. A CLI you run
  manually or via cron; scrapes each source, extracts structured fields with an
  LLM (OpenAI/Gemini tool-calling), geocodes, and upserts into Postgres.
- **[web/](web/)** — Next.js (App Router, TypeScript) full-stack app. Browses
  and filters listings, shows them on a map, and computes distance from a
  user-set point of interest. Owns the database schema via Drizzle migrations.
- **Postgres** — the shared contract. The web app owns migrations; the ingestion
  engine only inserts. See [web/README.md](web/README.md) for the rules.

## Quickstart

```bash
# 1. Database
docker compose up -d postgres

# 2. Web app (owns schema + migrations)
cd web
npm install
cp .env.example .env.local
npm run db:migrate
npm run db:seed          # optional: ~150 fake listings for local dev
npm run dev              # http://localhost:3000

# 3. Ingestion engine (in another shell, from repo root)
python -m venv .venv && source .venv/bin/activate
pip install -r ingestion/requirements.txt
cp .env.example .env     # fill in credentials
python -m ingestion check
python -m ingestion backfill        # import any legacy scraper/results/*.json
python -m ingestion run telegram --limit 50
```

The local Postgres is published on host port **5433** (to avoid clashing with a
system Postgres on 5432).

## Repository layout

| Path | What |
|------|------|
| `web/` | Next.js app (UI + API), Drizzle schema/migrations, seed script |
| `ingestion/` | Python scraping + LLM extraction + DB upsert CLI |
| `docker-compose.yml` | local Postgres 16 |
| `scraper/` | **archived** original single-file scrapers (superseded by `ingestion/`; results kept for backfill) |
