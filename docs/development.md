# Local Development Guide

This guide describes how to set up the local development environment for the Basera project, including the PostgreSQL database, the Next.js web application, and the Python data ingestion engine.

---

## Prerequisites

Ensure you have the following installed on your machine:
* **Docker** & **Docker Compose**
* **Node.js** (v18+ recommended)
* **Python** (v3.10 or higher)
* **Google Chrome** (required by default for scraping browser automation)

---

## 1. Database Setup

Basera uses a PostgreSQL database. For local development, a pre-configured database service is provided via Docker Compose. 

To start the database:
```bash
# From the repository root directory
docker compose up -d postgres
```

> [!NOTE]
> The database container publishes to host port **5433** (instead of the standard 5432) to avoid conflicts with any system-wide PostgreSQL installations.

---

## 2. Web Application Setup (`web/`)

The web application manages database migrations and seeds. 

```bash
# Navigate to the web folder
cd web

# Install Node dependencies
npm install

# Create environment configuration file
cp .env.example .env.local
```

### Environment Variables (`web/.env.local`)
Configure the variables inside your new `.env.local` file:
* `DATABASE_URL`: Set to `postgres://basera:basera@localhost:5433/basera` (pre-filled by default).
* `ADMIN_TOKEN`: A secret token of your choice. Used to gate access to the `/admin` panel.

### Run Database Migrations
Basera uses Drizzle ORM. Run the migrations to initialize your database schema:
```bash
npm run db:migrate
```

> [!WARNING]
> **Never run `drizzle-kit push`.** It bypasses SQL migration files and can cause schema mismatch errors with the Python ingestion model definitions. Always use `db:migrate`.

### Seed Demo Listings (Optional)
To quickly see the application in action with dummy listings across Pune, Mumbai, and Bengaluru:
```bash
npm run db:seed
```

### Run Next.js Server
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to inspect the application.

---

## 3. Ingestion Engine Setup (`ingestion/`)

The ingestion engine is a Python CLI that captures listings and processes them using LLMs.

```bash
# (From repository root)
# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r ingestion/requirements.txt

# Create root env file
cp .env.example .env
```

### Playwright Browsers Setup
The browser-based scraping engine utilizes Playwright to automate Chrome. Ensure Chrome is installed locally, or initialize the driver dependencies:
```bash
# If Chrome is installed:
playwright install chrome

# Or, if you prefer to use Playwright's bundled Chromium (set BROWSER_CHANNEL= empty in .env):
playwright install chromium
```

### Environment Variables (`.env` in Root)
Edit the root `.env` file to provide the necessary third-party API keys:
* `DATABASE_URL`: Set to `postgresql+psycopg://basera:basera@localhost:5433/basera`
* `MODEL_PROVIDER`: Set to `openai` or `gemini`
* `OPENAI_API_KEY` or `GEMINI_API_KEY`: Key for structural rental extraction.
* `GOOGLE_MAPS_API_KEY`: Used to geocode addresses.

### Perform Connectivity Check
Verify settings and database connections:
```bash
python -m ingestion check
```

---

## 4. Common Developer Workflows

### Managing Cities and Facebook Groups
Ingestion will only target groups that are marked **enabled** in the database. You can register cities and groups via the Web app's Admin Panel at `/admin` (using your `ADMIN_TOKEN`) or via the Ingestion CLI:

```bash
# List all registered groups
python -m ingestion groups list

# Add a group scoping it to a city
python -m ingestion groups add https://www.facebook.com/groups/your-group-url --city "Pune"

# Remove a group
python -m ingestion groups remove https://www.facebook.com/groups/your-group-url
```

### Running Ingestion
Scrape and process all enabled Facebook groups:
```bash
# Full cycle: Scrape raw data and process it immediately
python -m ingestion run

# Scrape only (captures raw text/snapshots into DB but does not execute LLM APIs)
python -m ingestion run --scrape-only

# Process raw posts that have not yet been evaluated by LLM
python -m ingestion analyze --workers 4
```

### Testing Repeated runs (Windowed Executions)
To simulate production cron jobs locally, run the windowed script. It loops over scraper runs periodically and processes new posts:
```bash
# Scrapes and processes up to 50 posts every 30 minutes for a duration of 12 hours
python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50
```
To run it in the background:
```bash
nohup python -m ingestion.scripts.run_window --hours 12 --interval-minutes 30 --posts 50 \
  > ingestion/state/logs/window-$(date +%Y%m%d-%H%M%S).log 2>&1 &
```
