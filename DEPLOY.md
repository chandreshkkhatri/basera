# Deploy Runbook

Production uses a hosted Postgres database, Vercel for the Next.js app, GitHub
Actions for schema migrations, and a server/cron job for ingestion.

## 1. Create Postgres

Create a Neon or Supabase Postgres project and keep both connection strings:

- App/pooler URL for Vercel runtime traffic.
- Direct/non-pooler URL for migrations and ingestion.

Use TLS for hosted Postgres. The web app and Drizzle migrations enable SSL when
`sslmode=require`, `PGSSLMODE=require`, `DATABASE_SSL=true`, or production uses
a non-local host. For Python ingestion, include `sslmode=require` in the URL.

Examples:

```ini
# web / Vercel / Drizzle
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require

# ingestion / psycopg
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/DB?sslmode=require
```

## 2. Configure GitHub Actions

Add this repository secret:

```text
PROD_DATABASE_URL=postgres://USER:PASSWORD@DIRECT_HOST:5432/DB?sslmode=require
```

The `.github/workflows/migrate.yml` workflow runs `npx drizzle-kit migrate` on
pushes to `main` that change `web/drizzle/**` or `web/src/db/schema.ts`. It can
also be run manually from the Actions tab.

The `.github/workflows/ci.yml` workflow runs on pull requests and `main` pushes:

```bash
cd web
npm run lint
npx tsc --noEmit
npm run build
```

It also compiles the Python ingestion package.

## 3. Deploy Web on Vercel

Create a Vercel project rooted at `web/`.

Set environment variables for Production and Preview:

```ini
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB?sslmode=require
ADMIN_TOKEN=<long random token>
```

Use Vercel's default install/build commands for the `web` directory:

```bash
npm ci
npm run build
```

Run the migration workflow before sending real traffic to a new database.

## 4. Run Ingestion on a Server

Build the ingestion image from the repo root:

```bash
docker build -f ingestion/Dockerfile -t basera-ingestion .
```

Create `/opt/basera/.env` on the server:

```ini
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@DIRECT_HOST:5432/DB?sslmode=require
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
GOOGLE_MAPS_API_KEY=...
HEADLESS=true
BROWSER_CHANNEL=

# Optional: Graph API mode
FB_ACCESS_TOKEN=...
FB_GROUP_ID=...
```

Run a check:

```bash
docker run --rm --env-file /opt/basera/.env \
  -v /opt/basera/state:/app/ingestion/state \
  basera-ingestion check
```

Run ingestion:

```bash
docker run --rm --env-file /opt/basera/.env \
  -v /opt/basera/state:/app/ingestion/state \
  basera-ingestion run --api --posts 50
```

For browser scraping, perform the first Facebook login on a machine with an
interactive display and persist `ingestion/state/`; subsequent runs can reuse
that mounted state directory.

## 5. Cron

Example cron entry for a server with Docker:

```cron
*/30 * * * * docker run --rm --env-file /opt/basera/.env -v /opt/basera/state:/app/ingestion/state basera-ingestion run --api --posts 50 >> /var/log/basera-ingestion.log 2>&1
```

The app exposes `/status` to review recent ingestion runs and group health.
