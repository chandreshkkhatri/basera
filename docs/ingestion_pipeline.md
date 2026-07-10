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
* **Browser Automation (Default)**: Uses Playwright to simulate Chrome, log into Facebook (if required), scroll down group pages, and parse post HTML. The raw HTML snippets or state references are stored inside `raw_posts.meta`, and the visible text is extracted.
* **Graph API**: If `FB_ACCESS_TOKEN` and `FB_GROUP_ID` are configured in `.env`, the scraper requests feeds directly via the Graph API, bypassing browser automation.

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
