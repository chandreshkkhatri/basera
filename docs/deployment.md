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

---

## Troubleshooting

### Resolving `LOGIN_EXPIRY (critical)` Error
This alert fires when a scrape run can't find a logged-in Facebook session —
the `c_user` cookie is missing from the browser profile
(`ingestion/state/profiles/facebook`). Production runs `HEADLESS=true`, so the
server cannot complete an interactive login itself.

#### Step 0: Check whether it's transient (often it is)
The alert is sent on the FIRST failed run, but the runner sleeps 60 minutes
and retries — and Facebook login checks do fail transiently. A real expiry
keeps alerting across several retries; a transient one self-heals. Before
doing anything:

```bash
# Did later cycles recover?
ssh <vm> "journalctl --user -u basera-runner --since '-3 hours' --no-pager \
  | grep -iE 'logged in|login required|Run complete' | tail -20"

# Is the session cookie alive? (c_user AND xs must both be present/unexpired)
ssh <vm> '~/deployments/prod/basera/.venv/bin/python - <<"PY"
import sqlite3, glob, datetime
ck = glob.glob("/home/*/deployments/prod/basera/ingestion/state/profiles/facebook/Default/Cookies")[0]
con = sqlite3.connect(f"file:{ck}?mode=ro&immutable=1", uri=True)
for name, exp in con.execute("select name, expires_utc from cookies where host_key like \"%facebook.com\" and name in (\"c_user\",\"xs\")"):
    print(name, datetime.datetime.fromtimestamp(exp/1000000-11644473600, datetime.UTC))
PY'
```

If the log shows "Already logged in" on recent cycles: do nothing. Facebook
periodically rotates `c_user`/`xs` with fresh one-year expiries on successful
runs. Note: an invalidated `xs` (while `c_user` lingers) means Facebook
hard-killed the session — that's a real expiry.

#### Method 1: Re-login locally, transfer the profile (Recommended)
The VM has no display, so the interactive login happens on a workstation and
the refreshed profile is copied over:

1. Stop the runner: `ssh <vm> 'systemctl --user stop basera-runner'`
2. On a machine with a display, from the repo root:
   ```bash
   HEADLESS=false .venv/bin/python -m ingestion run --group <any group url> --posts 1
   ```
   Log in to Facebook in the Chrome window (solve 2FA if prompted); let the
   command finish.
3. Transfer the profile, excluding browser caches (1.6 GB → ~12 MB; the
   session lives in `Default/Cookies`):
   ```bash
   rsync -az --exclude='**/Cache/' --exclude='**/Code Cache/' --exclude='**/GPUCache/' \
     --exclude='**/GrShaderCache/' --exclude='**/ShaderCache/' --exclude='**/CacheStorage/' \
     ingestion/state/profiles <vm>:~/deployments/prod/basera/ingestion/state/
   ```
4. Restart: `ssh <vm> 'systemctl --user start basera-runner'` and watch
   `journalctl --user -u basera-runner -f` for "Already logged in".

#### Reducing login risk
The URL-extraction ladder's click-through rung (clicking posts to resolve
permalinks) is the most automation-like behavior the scraper performs. If
login expiries become frequent, set `URL_CLICK_FALLBACK=false` in the VM's
`.env` (keeps the safer hover + HTML-regex extraction) and restart the
runner — no redeploy needed.

#### Method 2: Switch to Facebook Graph API Mode
To bypass browser session timeouts entirely, configure Facebook Graph API mode in your production server's `.env`:
1. Generate a Facebook Graph API access token.
2. Update `/opt/basera/.env` to configure:
   ```ini
   FB_ACCESS_TOKEN=your_permanent_or_long_lived_token
   FB_GROUP_ID=target_group_numeric_id
   ```
3. Ensure the cron command or script execution includes the `--api` flag:
   ```bash
   basera-ingestion run --api --posts 50
   ```
