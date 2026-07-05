-- Dev-only bootstrap DDL. The authoritative schema + migration history lives
-- in web/drizzle/*.sql (generated from web/src/db/schema.ts). Prefer running
-- `cd web && npm run db:migrate`. This file exists so the Python side can stand
-- up a database without the Node toolchain if needed. Keep it in sync manually.

CREATE TABLE IF NOT EXISTS listings (
    id                 bigserial PRIMARY KEY,
    source             text NOT NULL,
    source_id          text NOT NULL,
    source_url         text,
    source_group       text,
    posted_at          timestamptz NOT NULL,
    scraped_at         timestamptz NOT NULL DEFAULT now(),
    location           text,
    city               text,
    rent               integer,
    bhk                text,
    gender_preference  text NOT NULL DEFAULT 'any',
    furnishing_status  text,
    additional_details text,
    latitude           double precision,
    longitude          double precision,
    original_text      text NOT NULL,
    contact_name       text,
    contact_url        text,
    is_rental          boolean NOT NULL DEFAULT true,
    status             text NOT NULL DEFAULT 'active',
    CONSTRAINT listings_source_chk CHECK (source IN ('telegram','whatsapp','facebook')),
    CONSTRAINT listings_status_chk CHECK (status IN ('active','stale','hidden'))
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_source_source_id_uq ON listings (source, source_id);
CREATE INDEX IF NOT EXISTS listings_posted_at_idx ON listings (posted_at DESC);
CREATE INDEX IF NOT EXISTS listings_city_lower_idx ON listings (lower(city));
CREATE INDEX IF NOT EXISTS listings_rent_idx ON listings (rent);
CREATE INDEX IF NOT EXISTS listings_lat_lon_idx ON listings (latitude, longitude);
CREATE INDEX IF NOT EXISTS listings_feed_idx ON listings (status, is_rental, posted_at DESC);

CREATE TABLE IF NOT EXISTS raw_posts (
    id            bigserial PRIMARY KEY,
    source        text NOT NULL,
    source_id     text NOT NULL,
    source_group  text,
    source_url    text,
    text          text NOT NULL,
    posted_at     timestamptz,
    scraped_at    timestamptz NOT NULL DEFAULT now(),
    author_name   text,
    author_url    text,
    meta          jsonb,
    processed_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS raw_posts_source_source_id_uq ON raw_posts (source, source_id);
CREATE INDEX IF NOT EXISTS raw_posts_unprocessed_idx ON raw_posts (processed_at);

CREATE TABLE IF NOT EXISTS scrape_runs (
    id                bigserial PRIMARY KEY,
    source            text NOT NULL,
    target            text NOT NULL,
    started_at        timestamptz NOT NULL DEFAULT now(),
    finished_at       timestamptz,
    posts_seen        integer NOT NULL DEFAULT 0,
    posts_new         integer NOT NULL DEFAULT 0,
    listings_upserted integer NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'running',
    error             text
);
CREATE INDEX IF NOT EXISTS scrape_runs_source_started_idx ON scrape_runs (source, started_at DESC);

-- Alert outbox: rows are always recorded, then delivered to Telegram.
-- delivery_status: pending -> sending -> sent | failed, or suppressed
-- (category disabled / cooldown / notifier unconfigured).
CREATE TABLE IF NOT EXISTS alerts (
    id                 bigserial PRIMARY KEY,
    category           text NOT NULL,
    severity           text NOT NULL DEFAULT 'error',
    source             text NOT NULL DEFAULT 'ingestion',
    message            text NOT NULL,
    details            jsonb,
    run_id             bigint REFERENCES scrape_runs(id) ON DELETE SET NULL,
    created_at         timestamptz NOT NULL DEFAULT now(),
    delivery_status    text NOT NULL DEFAULT 'pending',
    delivery_attempts  integer NOT NULL DEFAULT 0,
    last_attempt_at    timestamptz,
    delivered_at       timestamptz,
    delivery_error     text
);
CREATE INDEX IF NOT EXISTS alerts_category_created_idx ON alerts (category, created_at DESC);
CREATE INDEX IF NOT EXISTS alerts_pending_idx ON alerts (delivery_status, created_at);
CREATE INDEX IF NOT EXISTS alerts_created_idx ON alerts (created_at DESC);
