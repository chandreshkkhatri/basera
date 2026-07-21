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
npm run db:seed          # optional: ~180 demo listings across Pune, Mumbai,
                         # and a disabled Bengaluru (to exercise the admin toggle)
npm run dev              # http://localhost:3000

# 3. Ingestion engine (in another shell, from repo root)
python -m venv .venv && source .venv/bin/activate
pip install -r ingestion/requirements.txt
cp .env.example .env     # fill in credentials
python -m ingestion check
python -m ingestion groups add https://www.facebook.com/groups/xxxx --city Pune
python -m ingestion run --posts 50   # scrapes every enabled group
python -m ingestion analyze          # retries pending AI-processing work
python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
                                    # bounded continuous run for local testing
```

Register cities and Facebook groups either with `ingestion groups add` or in the
web app's `/admin` panel (gated by `ADMIN_TOKEN`). Both write the same DB.

The local Postgres is published on host port **5433** (to avoid clashing with a
system Postgres on 5432).

For production setup on Neon + Vercel, GitHub Actions migration secrets, and
the ingestion runbook (native systemd on the VM, ops + troubleshooting), see
[docs/deploy.md](docs/deploy.md).

## Common Ingestion Workflows

### Manage Facebook groups

The ingestion engine scrapes every **enabled** group in the shared DB. You can
manage that registry either in the web app's `/admin` page or from the CLI:

```bash
cd /home/chandresh/code/basera
source .venv/bin/activate

python -m ingestion groups list
python -m ingestion groups add https://www.facebook.com/groups/xxxx --city Pune
python -m ingestion groups remove https://www.facebook.com/groups/xxxx
```

Use `groups remove` to stop scraping deleted, renamed, or invalid groups.

### Retry failed AI processing

Raw capture and AI analysis are separate stages. A scrape stores raw posts in
`raw_posts`; the AI/geocoding path turns successful ones into `listings`.

```bash
python -m ingestion run --posts 50
python -m ingestion analyze
```

Retryable AI-processing failures are **not** dropped immediately. They remain
pending in `raw_posts` and are retried later by `analyze` or by a later scrape
that sees the same post again. The retry budget is configurable in `.env`:

```ini
PROCESSING_MAX_ATTEMPTS=3
PROCESSING_RETRY_BACKOFF_S=300
```

### Run continuously for a fixed window

For local testing, the easiest way to run repeated scrape/analyze cycles for a
bounded period is the helper script below:

```bash
cd /home/chandresh/code/basera
source .venv/bin/activate
python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
```

That runs one scrape cycle every 30 minutes for 12 hours, then runs
`python -m ingestion analyze` after each cycle so pending retryable AI work gets
another pass before the next cycle.

To keep it running after you close the terminal:

```bash
nohup python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50 \
  > ingestion/state/logs/window-$(date +%Y%m%d-%H%M%S).log 2>&1 &
```

If you want a permanent schedule instead of a bounded 12-hour window, use cron
or systemd as described in [docs/deploy.md](docs/deploy.md).

## Using Processed Data

Processed listings are written into Postgres and consumed directly by the web
app:

- `/` reads the `listings` table for the city-scoped feed.
- `/map` reads the same listings with coordinates.
- `/listings/[id]` shows full extracted details, original text, and the source
  link.
- `/status` reads `scrape_runs` plus listing counts to show recent ingestion
  health.
- `/api/listings` exposes the same filtered listing data as JSON for other
  clients.

Useful ways to inspect or consume that data locally:

```bash
# JSON feed for external clients or debugging
curl "http://localhost:3000/api/listings?city=pune&view=full"

# map payload only
curl "http://localhost:3000/api/listings?city=pune&view=map"
```

Typical validation path after a real ingestion run:

1. Open `/status` to confirm recent scrape runs and counts.
2. Open `/` for the city feed.
3. Open `/map` to verify coordinates rendered for geocoded listings.
4. Open `/listings/<id>` to inspect the extracted fields and original post text.

For a local 12-hour scrape window without setting up cron, run:

```bash
cd /home/chandresh/code/basera
source .venv/bin/activate
python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
```

That command runs a scrape cycle every 30 minutes, then runs `analyze` so any
pending retryable AI-processing work gets another pass before the next cycle.

## Repository layout

| Path | What |
|------|------|
| `web/` | Next.js app (UI + API), Drizzle schema/migrations, seed script |
| `ingestion/` | Python scraping + LLM extraction + DB upsert CLI |
| `docker-compose.yml` | local Postgres 16 |
| `scraper/` | **archived** original single-file scrapers (superseded by `ingestion/`; results kept for backfill) |
