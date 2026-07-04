# Basera

Aggregates house-rental postings scraped from **Facebook groups** into one
searchable, per-city feed, and routes people to **contact the poster on
Facebook**. Basera never handles the transaction — it deep-links out to the
source post. Each Facebook group is assigned to a city; users browse one
selected city at a time, and admins enable/disable cities and manage the group
registry from a gated `/admin` panel.

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
  manually or via cron; scrapes every enabled Facebook group, extracts
  structured fields with an LLM (OpenAI/Gemini tool-calling), geocodes, tags
  each listing with its group's city, and upserts into Postgres.
- **[web/](web/)** — Next.js (App Router, TypeScript) full-stack app. Browses
  and filters listings for a selected city, shows them on a map, computes
  distance from a user-set point of interest, and provides a gated `/admin`
  panel for cities and groups. Owns the database schema via Drizzle migrations.
- **Postgres** — the shared contract. The web app owns migrations and writes the
  `cities`/`groups` registry; the ingestion engine reads that registry and
  inserts listings. See [web/README.md](web/README.md) for the rules.

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
python -m ingestion groups add https://www.facebook.com/groups/xxxx --city Pune
python -m ingestion run --posts 50   # scrapes every enabled group
```

Register cities and Facebook groups either with `ingestion groups add` or in the
web app's `/admin` panel (gated by `ADMIN_TOKEN`). Both write the same DB.

The local Postgres is published on host port **5433** (to avoid clashing with a
system Postgres on 5432).

## Repository layout

| Path | What |
|------|------|
| `web/` | Next.js app (UI + API), Drizzle schema/migrations, seed script |
| `ingestion/` | Python scraping + LLM extraction + DB upsert CLI |
| `docker-compose.yml` | local Postgres 16 |
| `scraper/` | **archived** original single-file scrapers (superseded by `ingestion/`; results kept for backfill) |
