# Deploy Runbook

Production is **Vercel** (Next.js web) + **Neon** (hosted Postgres) + an **OCI VM**
(Python ingestion, native systemd — no Docker in prod) + **GitHub Actions**
(schema migrations). Dev vs prod is purely which `.env` a checkout has; the same
code runs everywhere.

- Web: Vercel project rooted at `web/`.
- DB: Neon Postgres. Pooled URL for Vercel runtime; **unpooled/direct** URL for
  migrations and ingestion.
- Ingestion VM: ssh alias `oci-us-host`, repo at `~/deployments/prod/basera`,
  runs as the systemd **user** unit `basera-runner`.

---

## 1. Postgres (Neon)

Keep both connection strings:

- **Pooled** (`…-pooler.…neon.tech`) — Vercel runtime traffic.
- **Unpooled / direct** (no `-pooler`) — migrations **and** ingestion.

Hosted Postgres needs TLS: include `sslmode=require` in the URL.

```ini
# web / Vercel / Drizzle (pooled)
DATABASE_URL=postgres://USER:PASSWORD@POOLER_HOST/DB?sslmode=require
# ingestion / psycopg (direct/unpooled — note the +psycopg driver)
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@DIRECT_HOST/DB?sslmode=require
```

> **Two-database trap:** the GitHub `PROD_DATABASE_URL` secret and Vercel's DB
> must point at the **same** Neon database, or migrations run against one DB while
> the app reads an empty one (`relation "cities" does not exist`). Keep
> `PROD_DATABASE_URL` == Vercel's unpooled URL.

## 2. GitHub Actions

Add the repo secret `PROD_DATABASE_URL` (the **direct/unpooled** URL).

- `.github/workflows/migrate.yml` — runs `drizzle-kit migrate` on pushes to
  `main` touching `web/drizzle/**` or `web/src/db/schema.ts` (also runnable
  manually from the Actions tab).
- `.github/workflows/ci.yml` — on PRs and `main`: `npm run lint`, `tsc --noEmit`,
  `npm run build`, and compiles the Python ingestion package.

**Ordering:** ingestion hard-fails `check` until its tables exist. When a release
adds a migration, let `migrate.yml` run against prod **before** restarting the
ingestion runner on the new code.

## 3. Web on Vercel

Project root `web/`. Env vars (Production + Preview):

```ini
DATABASE_URL=postgres://USER:PASSWORD@POOLER_HOST/DB?sslmode=require
ADMIN_TOKEN=<long random token>
NEXT_PUBLIC_SITE_URL=https://<your-domain>   # correct sitemap/canonical/OG URLs
```

Default Vercel commands (`npm ci` / `npm run build`). Neon's Vercel integration
injects DB vars with a `NEON_` prefix; `web/src/db/index.ts` falls back
`DATABASE_URL ?? NEON_DATABASE_URL`.

## 4. Ingestion on the VM (native systemd)

Prod runs the ingestion engine directly in a venv under a systemd **user** unit
(not Docker). Bring-up on a fresh Ubuntu VM:

```bash
ssh oci-us-host
cd ~/deployments/prod/basera

# 4a. Python + browser deps
sudo apt-get install -y python3-venv
python3 -m venv .venv
./.venv/bin/pip install -r ingestion/requirements.txt
./.venv/bin/playwright install chromium
sudo ./.venv/bin/playwright install-deps chromium   # OS libs; Chromium won't launch without them
```

**4b. `.env`** at the repo root (`chmod 600`):

```ini
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@DIRECT_HOST/DB?sslmode=require
MODEL_PROVIDER=gemini
GEMINI_API_KEY=...
GOOGLE_MAPS_API_KEY=...
HEADLESS=true
BROWSER_CHANNEL=            # empty => Playwright's bundled Chromium
BROWSER_NO_SANDBOX=true     # required on server/container VMs (adds --no-sandbox)
TELEGRAM_BOT_TOKEN=...      # optional (admin-facing alerts)
TELEGRAM_ALERT_CHAT_ID=...
```

> **aarch64 note:** there is no Google Chrome build for linux-arm64. Leave
> `BROWSER_CHANNEL=` **empty** so the persistent context launches with the
> bundled Chromium. With `channel=chrome` the launch fails and silently falls
> back to a *non-persistent* context — which drops the Facebook session.

**4c. Facebook session.** Browser scraping needs a logged-in profile. The VM is
headless, so log in **on a machine with a display** once and copy the profile
over — see [Fixing FB login (LOGIN_EXPIRY)](#fixing-fb-login-login_expiry); the
same procedure does the first-time setup.

**4d. Verify, then install the service:**

```bash
./.venv/bin/python -m ingestion check    # DB + schema + provider

mkdir -p ~/.config/systemd/user
# NOTE: the committed deploy/systemd/basera-runner.service hardcodes ~/code/basera.
# Prod lives at ~/deployments/prod/basera, so write the unit with the real paths:
cat > ~/.config/systemd/user/basera-runner.service <<'UNIT'
[Unit]
Description=Basera ingestion continuous runner (scrape + analyze + watchdog)

[Service]
Type=simple
WorkingDirectory=%h/deployments/prod/basera
ExecStart=%h/deployments/prod/basera/.venv/bin/python -m ingestion.scripts.run_window --forever --interval-minutes 30 --posts 50
Restart=always
RestartSec=60

[Install]
WantedBy=default.target
UNIT

sudo loginctl enable-linger "$USER"          # survive logout/reboot
export XDG_RUNTIME_DIR=/run/user/$(id -u)     # needed for `systemctl --user` over ssh
systemctl --user daemon-reload
systemctl --user enable --now basera-runner
```

**4e. Daily archive cron** (tiered lifecycle: 7d+ active → archived/off-feed,
14d+ → cold-storage table). Separate from the runner:

```cron
0 3 * * * cd $HOME/deployments/prod/basera && $HOME/deployments/prod/basera/.venv/bin/python -m ingestion archive >> $HOME/basera-archive.log 2>&1 # basera-archive
```

### Updating the VM to new code

```bash
ssh oci-us-host 'cd ~/deployments/prod/basera && git pull --ff-only origin main \
  && ./.venv/bin/python -m ingestion check \
  && XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart basera-runner'
```

Re-run `pip install -r ingestion/requirements.txt` only if requirements changed;
let `migrate.yml` run first if the release includes a DB migration.

---

## Operations

`systemctl --user` / `journalctl --user` over ssh need `XDG_RUNTIME_DIR` set
first (the runner is a *user* unit). uid is `1000` for the `ubuntu` user.

### Check ingestion logs

```bash
ssh oci-us-host
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# service state
systemctl --user status basera-runner

# live tail
journalctl --user -u basera-runner -f

# last 200 lines / a time window
journalctl --user -u basera-runner -n 200 --no-pager
journalctl --user -u basera-runner --since '-24h' --no-pager

# only the run summaries + login events
journalctl --user -u basera-runner --since '-24h' --no-pager \
  | grep -iE 'Run complete|logged in|login required'
```

### Ingestion stats (last 24h)

From the logs — one `Run complete` line per cycle (`url_from_graphql` =
permalinks from GraphQL interception; `url_missing` = posts with no URL):

```bash
ssh oci-us-host "export XDG_RUNTIME_DIR=/run/user/1000; \
  journalctl --user -u basera-runner --since '-24h' --no-pager | grep 'Run complete'"
```

From the database — `scrape_runs` aggregated over the last 24h (ssh in first, so
the `ingestion` package is importable from the repo root):

```bash
ssh oci-us-host
cd ~/deployments/prod/basera
./.venv/bin/python - <<'PY'
from ingestion.config import load_settings
from ingestion.db.engine import get_engine
from sqlalchemy import text
eng = get_engine(load_settings())
with eng.connect() as c:
    print("runs(24h) by status:")
    for r in c.execute(text(
        "select status, count(*) runs, coalesce(sum(posts_new),0) new, "
        "coalesce(sum(listings_upserted),0) upserted "
        "from scrape_runs where started_at > now() - interval '24 hours' "
        "group by status order by runs desc")):
        print(f"  {r.status:14} runs={r.runs} new={r.new} upserted={r.upserted}")
    print("last success:", c.execute(text(
        "select max(finished_at) from scrape_runs where status = 'success'")).scalar())
PY
```

Example output during the login incident above — a healthy stretch then the stall:

```
runs(24h) by status:
  success        runs=210 new=661 upserted=420
  login_failed   runs=8 new=0 upserted=0
last success: 2026-07-20 21:15:49+00:00
```

The web `/status` page also shows recent runs and per-group health.

---

## Troubleshooting

### Fixing FB login (LOGIN_EXPIRY)

Fires when a scrape can't find a logged-in Facebook session — the `c_user`
cookie is gone from the profile (`ingestion/state/profiles/facebook`). Prod is
`HEADLESS=true`, so the server can't log in interactively; the log shows
`Not logged in and running headless; cannot log in interactively` and every
cycle ends `Run complete [login_failed]`.

**Step 0 — is it transient?** The alert fires on the first failure, but the
runner retries hourly and FB login checks fail transiently. Check whether later
cycles recovered, and whether the session cookies are still alive:

```bash
ssh oci-us-host "export XDG_RUNTIME_DIR=/run/user/1000; \
  journalctl --user -u basera-runner --since '-3h' --no-pager | grep -iE 'logged in|login required|Run complete' | tail -20"

ssh oci-us-host './deployments/prod/basera/.venv/bin/python - <<"PY"
import sqlite3, datetime
ck="/home/ubuntu/deployments/prod/basera/ingestion/state/profiles/facebook/Default/Cookies"
con=sqlite3.connect(f"file:{ck}?mode=ro&immutable=1", uri=True)
now=datetime.datetime.now(datetime.timezone.utc)
for name,exp in con.execute("select name,expires_utc from cookies where host_key like \"%facebook.com\" and name in (\"c_user\",\"xs\")"):
    dt=datetime.datetime(1601,1,1,tzinfo=datetime.timezone.utc)+datetime.timedelta(microseconds=exp)
    print(name, dt.date(), "VALID" if dt>now else "EXPIRED")
PY'
```

If recent cycles show "Already logged in", do nothing — FB rotates the cookies
with fresh expiries on success. A **present-but-invalidated** session (cookies
still in the file, but navigating FB logs out / clears `c_user`) is a real
expiry: FB hard-killed the session server-side (common when the same session is
used from a datacenter IP or two locations). Copying the same dead profile again
won't help — you need a fresh login.

**Method 1 — re-login on a workstation, transfer the profile (recommended).**
The VM has no display, so log in where there is one and copy the refreshed
profile over:

1. Stop the runner:
   `ssh oci-us-host 'export XDG_RUNTIME_DIR=/run/user/1000; systemctl --user stop basera-runner'`
2. On a machine with a display, log in to Facebook so the session persists into
   `ingestion/state/profiles/facebook`. Either via the ingestion CLI (needs a
   local ingestion venv + reachable DB):
   ```bash
   HEADLESS=false .venv/bin/python -m ingestion run --group <any group url> --posts 1
   ```
   …or, DB-independent, drive the profile directly with the Playwright already in
   `web/node_modules` (log in in the window that opens, then Ctrl-C):
   ```bash
   cd web && node -e 'const{chromium}=require("playwright");(async()=>{
     const c=await chromium.launchPersistentContext(
       require("path").resolve("../ingestion/state/profiles/facebook"),
       {headless:false,args:["--disable-blink-features=AutomationControlled"]});
     const p=c.pages()[0]||await c.newPage();
     await p.goto("https://www.facebook.com/login");
     console.log("Log in (solve 2FA), then Ctrl-C once the feed loads."); await new Promise(()=>{});
   })()'
   ```
3. Transfer the profile, excluding browser caches (session lives in
   `Default/Cookies`):
   ```bash
   rsync -az --exclude='**/Cache/' --exclude='**/Code Cache/' --exclude='**/GPUCache/' \
     --exclude='**/*Cache/' --exclude='**/CacheStorage/' --exclude='**/ScriptCache/' \
     ingestion/state/profiles \
     oci-us-host:deployments/prod/basera/ingestion/state/
   ```
4. Restart and confirm:
   ```bash
   ssh oci-us-host 'export XDG_RUNTIME_DIR=/run/user/1000; systemctl --user restart basera-runner'
   ssh oci-us-host 'export XDG_RUNTIME_DIR=/run/user/1000; journalctl --user -u basera-runner -f'
   # watch for "Already logged in to Facebook (session cookie present)"
   ```

**Reducing login risk.** The URL ladder's click-through rung (clicking posts to
resolve permalinks) is the most automation-like behaviour. Since GraphQL
interception now carries most permalinks, you can disable it: set
`URL_CLICK_FALLBACK=false` in the VM `.env` and restart — no redeploy needed.

**Method 2 — Facebook Graph API mode.** To bypass browser sessions entirely, set
`FB_ACCESS_TOKEN` + `FB_GROUP_ID` in the VM `.env` and run with `--api`. Requires
a long-lived token and appropriate group permissions.

### Fix FB login from your phone (no laptop)

The `basera-login-fixer` service lets you refresh the session from your phone via
Telegram — it opens a headful browser on the VM and exposes it over your private
**Tailscale** network (never public). When a login fails, the alert now says
"Reply /relogin to fix it from your phone."

**One-time setup (VM):**

```bash
# 1. Tailscale — the private transport (no public ports, no firewall changes)
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up          # opens an auth URL; approve to add the VM to your tailnet
tailscale ip -4            # note the 100.x address

# 2. Remote-browser tooling
sudo apt-get install -y x11vnc websockify novnc fluxbox xvfb

# 3. Install the service (paths point at the prod checkout, like the runner)
sed "s#%h#$HOME#g" deploy/systemd/basera-login-fixer.service \
  > ~/.config/systemd/user/basera-login-fixer.service
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user daemon-reload
systemctl --user enable --now basera-login-fixer
```

Also install the **Tailscale app** on your phone and sign in to the same tailnet.

**When a login fails, from your phone:**

1. In the bot's Telegram chat, send **`/relogin`**. The service stops the runner,
   opens Chromium on the FB profile, and replies with a `http://100.x:6080/vnc.html…`
   URL + a one-time VNC password.
2. With the Tailscale app connected, open that URL in your phone browser, log in
   to Facebook (2FA and all).
3. Send **`/done`**. The service verifies the session, tears the browser down, and
   restarts the runner — replying "✅ session restored" (or telling you to retry).

Other commands: `/status` (session + runner state), `/cancel` (abort + restart).
The session also auto-closes after 15 minutes.

**Security:** the browser binds only to the tailnet IP (verify with `ss -ltnp` —
ports 5900/6080 on the `100.x` address, never `0.0.0.0`); commands are accepted
only from `TELEGRAM_ALERT_CHAT_ID`; the VNC password is random per session; the
browser is ephemeral; and **no Facebook credentials are stored** — you type them
into the browser view. Logging in from the VM's own IP also tends to make the
session last longer (the created-here/used-here IP now matches).

### Other exit codes the runner handles

The continuous runner reacts to CLI exit codes: `3` quota (cools down), `4`
login required (backs off, alerts), `5` database unreachable (waits + re-probes).
A stuck runner is almost always `4` (see above) or `5` (Neon unreachable — check
the DB URL and Neon status).
