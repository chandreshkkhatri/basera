# Basera Web

Next.js (App Router, TypeScript) app for browsing aggregated rental listings and
contacting posters on their source platform. Reads the Postgres database written
by the [ingestion engine](../ingestion).

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
cp .env.example .env.local
npm run db:migrate
npm run db:seed                      # ~150 fake listings for local dev
npm run dev
```

## Pages

- `/` — listings feed: filter bar (city, rent, BHK, gender, furnishing, source,
  posted-within), sort (newest / rent / distance), offset pagination.
- `/listings/[id]` — full post, all extracted fields, mini-map, and the
  **Contact on <platform>** deep-link CTA.
- `/map` — Leaflet markers for the filtered set, sharing the same URL filters.
- `/status` — ingestion health: last run per source, counts, recent runs.

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
