# Ingestion Pipeline

This document describes the stages, configuration, and retry mechanics of Basera's data ingestion pipeline.

---

## Architecture Overview

The ingestion engine splits its execution into two decoupled phases:
1. **Scraping / Capture Phase**: Gathers raw data from Facebook and stores it directly into `raw_posts`.
2. **Analysis / Enrichment Phase**: Classifies, structures, geocodes, and loads raw posts into `listings`.

This decoupled design ensures that scraping errors, rate-limiting, network issues, or LLM budget limits do not cross-contaminate.

```
Facebook Group
     │
     ▼ (Playwright or Graph API)
[1. Scrape & Capture] 
     │
     ▼
raw_posts table (Deduplicated on source + source_id)
     │
     ▼
[2. AI Classification] ────► Is it a rental listing? ────► [NO] ──► Mark Processed
     │                                                              (is_rental = false)
     ▼ [YES]
[3. LLM Field Extraction] (Rent, BHK, Gender, Furnishing, Contact, etc.)
     │
     ▼
[4. Geocoding] (Google Maps Geocoding API)
     │
     ▼
[5. Load / Upsert] ────► listings table (Derives city_id from group registry)
```

---

## Pipeline Phases

### 1. Scraping and Capture
The pipeline extracts group feed items in one of two modes:
* **Browser Automation (Default)**: Uses Playwright to drive Chromium, log into Facebook (via a persisted profile), scroll group pages, and read each post. The post **permalink, exact timestamp, full text, and author** come primarily from **GraphQL feed interception** — a `page.on("response")` listener parses the feed's `…/graphql` payloads (`ingestion/sources/fb_graphql.py`) and correlates each story to the scraped DOM post by id or text. The DOM extraction ladder (`_post_url_aggressive`: poll anchor → hover → regex HTML → click-through) is the automatic fallback. `raw_posts.meta.url_source` records which path supplied the URL (`graphql` / `dom` / `reconstructed`); disable interception with `GRAPHQL_INTERCEPTION_ENABLED=false`. See [post_url_extraction.md](post_url_extraction.md).
* **Graph API**: If `FB_ACCESS_TOKEN` and `FB_GROUP_ID` are configured in `.env`, the scraper requests feeds directly via the Graph API (`run --api`), bypassing browser automation.

Posts are immediately saved to the `raw_posts` table. A unique constraint on `(source, source_id)` ensures duplicate items are discarded before calling external APIs.

### 2. Rental Classification
Before invoking expensive structure extraction schemas, the text undergoes a binary classification using the configured LLM.
* If the post is not offering a property for rent (e.g., roommate inquiries, spam, generalized questions, lookups for flats), the post is marked as `is_rental = false` and its processing terminates.
* If it is a rental offer, it advances to structural extraction.

### 3. LLM Structured Extraction
The text is passed to the LLM (OpenAI or Gemini API) utilizing tool calling / JSON Schema constraints to build a structured `ExtractedListing` model. The extracted fields are:
* `rent`: Cleaned numeric rent (rupees/month). If unspecified or 0, it maps to `NULL`.
* `bhk`: Free-form description string (e.g., "2 BHK", "1 RK").
* `gender_preference`: Normalizes to `any`, `male`, `female`, `family`, or `bachelor`.
* `furnishing_status`: Normalizes to `fully furnished`, `semi furnished`, or `unfurnished`.
* `location`: Neighborhood, landmark, or street name.
* `contact_name`: Original poster's name.
* `contact_url`: Direct messaging link.
* `additional_details`: A brief summarized text of rules, amenities, deposits, etc.

### 4. Geocoding
If a `location` is successfully extracted by the LLM:
* The location text is sent to the Google Maps Geocoding API.
* The API returns precise coordinates (`latitude` and `longitude`).
* If geocoding fails or is empty, the listing is still inserted, but without map coordinate attributes.

### 5. DB Listing Upsert
The pipeline maps the parsed post data into the `listings` table:
1. Resolves the parent group in the database to retrieve its associated `city_id`.
2. Updates `city_id` and denormalizes the `city` name.
3. Inserts or updates the listing using an upsert query to avoid duplicate constraints on `(source, source_id)`.
4. Sets the `processed_at` timestamp on the source `raw_posts` row to mark it as completed.

---

## Recovery and AI Retries

LLM and Geocoding APIs may fail due to network timeouts, rate limit limits (429 errors), or prompt validation checks. To prevent data loss:

* **Unprocessed Posts**: If processing fails mid-pipeline, the `processed_at` field in `raw_posts` remains `NULL`.
* **Retry Loop**: Run `python -m ingestion analyze` to process outstanding `raw_posts` records where `processed_at IS NULL`.
* **Backoff Configuration**: You can customize how retries are handled in `.env`:
  ```ini
  # Maximum number of times to try processing a raw post before flagging it as failed.
  PROCESSING_MAX_ATTEMPTS=3
  # Delay (seconds) before a failed post is eligible to be processed again.
  PROCESSING_RETRY_BACKOFF_S=300
  ```
* **Failed Status**: Once a post reaches its max attempts limit, it is excluded from future analysis cycles unless reset manually or re-scraped.
* **Idempotency**: Running scraping runs multiple times will not duplicate processing because existing `raw_posts` entries are skipped at the database level.

---

## Operations (production)

In production the pipeline runs continuously on the OCI VM as the systemd user
unit `basera-runner` (`run_window --forever`, 30-min cycles: scrape → analyze →
watchdog). Full runbook — VM setup, `.env`, updating to new code, and
troubleshooting — is in [deploy.md](deploy.md).

`systemctl --user` / `journalctl --user` over ssh need `export
XDG_RUNTIME_DIR=/run/user/$(id -u)` first (uid `1000` for the `ubuntu` user).

**Check logs**

```bash
ssh oci-us-host
export XDG_RUNTIME_DIR=/run/user/$(id -u)
systemctl --user status basera-runner            # is it running?
journalctl --user -u basera-runner -f            # live tail
journalctl --user -u basera-runner --since '-24h' --no-pager \
  | grep -iE 'Run complete|logged in|login required'   # summaries + login events
```

**Stats (last 24h)** — one `Run complete` line per cycle carries the counters
(`new`, `upserted`, `url_missing`, `url_from_graphql`):

```bash
ssh oci-us-host "export XDG_RUNTIME_DIR=/run/user/1000; \
  journalctl --user -u basera-runner --since '-24h' --no-pager | grep 'Run complete'"
```

For a per-status roll-up from the `scrape_runs` table, and the last successful
run time, use the DB query in [deploy.md § Ingestion stats](deploy.md#ingestion-stats-last-24h).

**Login failure (`LOGIN_EXPIRY` alert / `Run complete [login_failed]`)** — the
Facebook session died and the headless VM can't re-login itself; the runner backs
off hourly until the profile is refreshed. Fix procedure (re-login on a machine
with a display, rsync the profile, restart) is in
[deploy.md § Fixing FB login](deploy.md#fixing-fb-login-login_expiry).
