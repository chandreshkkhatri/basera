# Basera Web

Next.js (App Router, TypeScript) app for browsing rental listings aggregated
from Facebook groups and deep-linking out to contact the poster on Facebook.
Reads the Postgres database written by the [ingestion engine](../ingestion).

## Stack

- **Next.js 16** App Router — server components read the DB directly for the
  feed / detail / status pages; one route handler (`/api/listings`) serves the
  map's client-side fetch. Both call the same query module so filter logic lives
  once (`src/db/queries/listings.ts`).
- **Drizzle ORM + `pg`** — schema in `src/db/schema.ts`, plain-SQL migrations in
  `drizzle/`.
- **Tailwind + shadcn/ui**, **Leaflet + OpenStreetMap** (no client-side Google
  key), **zod** for URL search-param parsing.

URL `searchParams` are the single source of truth for filters, so every filtered
view is a shareable link.

## Develop

```bash
docker compose up -d postgres        # from repo root
npm install
cp .env.example .env.local           # set ADMIN_TOKEN to use /admin locally
npm run db:migrate
npm run db:seed                      # ~180 demo listings across cities
npm run dev
```

`drizzle-kit` and the seed load `.env.local` automatically, so no manual
`DATABASE_URL` export is needed. For production (Vercel + hosted Postgres,
migrations in CI), see [DEPLOY.md](../DEPLOY.md).

## Cities & sourcing

Sourcing is **Facebook-only**. Every Facebook group is assigned to a **city**,
and each listing inherits its group's city. The header **city selector** scopes
the whole app to one selected city (persisted in `localStorage`, carried in the
URL as `?city=<slug>`). Only **enabled** cities are shown, and a disabled city's
listings never appear anywhere — even via a direct `?city=` link, the server
falls back to the first enabled city.

## Pages

- `/` — listings feed for the selected city: filter bar (rent, BHK, gender,
  furnishing, posted-within), sort (newest / rent / distance), offset pagination.
- `/listings/[id]` — full post, all extracted fields, mini-map, and the
  **Contact on Facebook** deep-link CTA.
- `/map` — Leaflet markers for the selected city, sharing the same URL filters.
- `/status` — ingestion health: last run per group, counts, recent runs.
- `/admin` — env-gated: enable/disable cities and manage the Facebook group
  registry (add group URL, assign to a city, toggle, delete).

## Admin

The `/admin` panel is gated by a shared secret in `ADMIN_TOKEN` (see
`.env.example`). Sign in with the token to exchange it for an httpOnly cookie;
the page and all `/api/admin/*` mutations verify it. If `ADMIN_TOKEN` is unset,
admin access is disabled entirely. Cities and the group registry live in the DB
(`cities`, `groups`), so the Python ingestion engine reads exactly what the
admin configured — `ingestion run` scrapes every enabled group of every enabled
city.

## Point of interest & distance

The user sets a point (e.g. their office) via the header picker; it persists in
`localStorage`. Distance chips are computed client-side (Haversine). Sorting by
distance writes `sort=distance&poiLat=…&poiLng=…` into the URL and orders in SQL
(`src/lib/distance.ts`), so distance-sorted links stay shareable.

## Database contract (shared with Python ingestion)

This app **owns the schema and migrations**. Rules the Python side relies on:

1. **Only the web app migrates.** `npm run db:generate` then `npm run db:migrate`.
   Python only runs `INSERT … ON CONFLICT (source, source_id) DO UPDATE`.
2. Generated SQL in `drizzle/00XX_*.sql` is the authoritative DDL history — the
   Python `ingestion/db/tables.py` mirror is kept in sync against it.
3. Changes are **additive** (new nullable columns) unless coordinated. Never
   rename a column Python writes.
4. **Never `drizzle-kit push`** — it skips the SQL history.

LLM-extracted enums (`gender_preference`, `furnishing_status`, `bhk`) are plain
`text`, not DB enums: a drifted model string must never fail a Python insert.
`src/lib/normalize.ts` guards them at render time. CHECK constraints exist only
on the closed sets we control (`source`, `status`).

`cities` and `groups` are also shared: the admin UI writes them, Python reads
them (`ingestion/db/tables.py` mirror). A listing's `city_id` is set from its
group at ingestion time; `city` (text) stays denormalized for display.
