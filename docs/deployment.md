# Production Deployment Guide

This runbook describes how to deploy the Basera application to production. 

---

## Production Architecture

In production, Basera relies on:
1. **Hosted Postgres**: Managed database service (e.g., Neon, Supabase).
2. **Vercel**: Next.js full-stack app deployment.
3. **GitHub Actions**: Automating database migrations and CI check passes.
4. **Virtual Private Server (VPS)**: Dedicated daemon or cron job running the Python Ingestion CLI inside a Docker container.

---

## 1. Provision PostgreSQL Database

Create a database instance on a cloud provider like Neon or Supabase.

* **Connection Strings**:
  * **App/Pooler URL**: Use for Next.js runtime traffic on Vercel (benefits from connection pooling).
  * **Direct URL**: Use for database migrations and the ingestion script (bypasses pooling to avoid transactional issues).
* **SSL/TLS Requirement**:
  Production databases must use TLS. Secure connection strings by appending `sslmode=require` or `ssl=true`.

Examples:
```ini
# For Drizzle and Next.js (web/)
DATABASE_URL=postgres://user:password@pooler-host:5432/db?sslmode=require

# For SQLAlchemy and Python Ingestion (ingestion/)
DATABASE_URL=postgresql+psycopg://user:password@direct-host:5432/db?sslmode=require
```

---

## 2. Configure GitHub Actions

Basera automatically executes database migrations on merge. Add the following repository secret to GitHub:
* `PROD_DATABASE_URL`: Set to the **Direct/Non-pooler** database connection string.

### Automatic Workflows
* **Database Migrations (`.github/workflows/migrate.yml`)**: Triggered whenever changes are pushed to `main` within `web/drizzle/**` or `web/src/db/schema.ts`. Runs `npx drizzle-kit migrate` to apply migrations automatically.
* **Continuous Integration (`.github/workflows/ci.yml`)**: Validates TypeScript build types, ESLint rules, and compiles Python ingestion packages on any pull request or push to `main`.

---

## 3. Deploy Web Application on Vercel

1. Create a new project in Vercel and point it to the repository.
2. In the **Build & Development Settings**, configure the **Root Directory** to `web/`.
3. Add the following **Environment Variables**:
   * `DATABASE_URL`: The pooled Postgres connection string.
   * `ADMIN_TOKEN`: A long, randomly generated secret token to secure the `/admin` portal.
4. Use Vercel's default commands:
   * **Install Command**: `npm ci`
   * **Build Command**: `npm run build`

---

## 4. Deploy Ingestion Engine on a Server

The Python ingestion engine requires a server to run Playwright browser scraping.

### Build Ingestion Docker Image
From the repository root on your deployment server, run:
```bash
docker build -f ingestion/Dockerfile -t basera-ingestion .
```

### Server Configuration File
Create an environment file at `/opt/basera/.env` on the server:
```ini
DATABASE_URL=postgresql+psycopg://user:password@direct-host:5432/db?sslmode=require
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_openai_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
HEADLESS=true
```

### Initial Facebook Authentication
Browser-based scraping requires authentication. On the first setup:
1. Run the container temporarily on a machine with a graphical environment (or using VNC).
2. Start the scraper and complete the Facebook login screen manually.
3. Keep the persistent browser state file saved under `/opt/basera/state/`.
4. Copy `/opt/basera/state/` to your server. Subsequent headless runs will reuse this state to stay authenticated.

### Running Ingestion Manually
```bash
# Validate settings and DB connectivity
docker run --rm --env-file /opt/basera/.env \
  -v /opt/basera/state:/app/ingestion/state \
  basera-ingestion check

# Run ingestion cycle
docker run --rm --env-file /opt/basera/.env \
  -v /opt/basera/state:/app/ingestion/state \
  basera-ingestion run --api --posts 50
```

---

## 5. Configure Automated Cron Jobs

To run the scraper continuously, set up a cron job on your deployment server:

```cron
# Edit crontab using 'crontab -e'
# Runs the scraper every 30 minutes and logs output
*/30 * * * * docker run --rm --env-file /opt/basera/.env -v /opt/basera/state:/app/ingestion/state basera-ingestion run --api --posts 50 >> /var/log/basera-ingestion.log 2>&1
```

Once running, you can monitor the ingestion history and status from the `/status` page on the web app.
