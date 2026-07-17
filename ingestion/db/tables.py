"""SQLAlchemy Core table definitions.

These MIRROR the Drizzle schema in web/src/db/schema.ts, which owns migrations.
Python never creates or alters these tables in production (bootstrap.sql is a
dev-only convenience); `repo.schema_check` verifies the live DB matches.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    TIMESTAMP,
)
from sqlalchemy.dialects.postgresql import JSONB

metadata = MetaData()

cities = Table(
    "cities",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("name", Text, nullable=False),
    Column("slug", Text, nullable=False),
    Column("enabled", Boolean, nullable=False),
    Column("display_order", Integer, nullable=False),
    Column("center_lat", Float),
    Column("center_lng", Float),
    Column("created_at", TIMESTAMP(timezone=True)),
)

groups = Table(
    "groups",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("city_id", BigInteger, nullable=False),
    Column("url", Text, nullable=False),
    Column("name", Text),
    Column("fb_group_id", Text),
    Column("enabled", Boolean, nullable=False),
    Column("created_at", TIMESTAMP(timezone=True)),
)

listings = Table(
    "listings",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("source", Text, nullable=False),
    Column("source_id", Text, nullable=False),
    Column("source_url", Text),
    Column("source_group", Text),
    Column("posted_at", TIMESTAMP(timezone=True), nullable=False),
    Column("scraped_at", TIMESTAMP(timezone=True)),
    Column("location", Text),
    Column("city", Text),
    Column("city_id", BigInteger),
    Column("rent", Integer),
    Column("bhk", Text),
    Column("gender_preference", Text, nullable=False),
    Column("furnishing_status", Text),
    Column("additional_details", Text),
    Column("latitude", Float),
    Column("longitude", Float),
    Column("original_text", Text, nullable=False),
    Column("contact_name", Text),
    Column("contact_url", Text),
    Column("is_rental", Boolean, nullable=False),
    # False = poster is seeking a place, not offering one; excluded from feed.
    Column("is_offer", Boolean, nullable=False),
    Column("status", Text, nullable=False),
)

# Cold storage: same columns as listings (+ archived_at), no FK/feed indexes.
# The `archive` command copies rows here from listings by explicit column list.
listings_archive = Table(
    "listings_archive",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("source", Text, nullable=False),
    Column("source_id", Text, nullable=False),
    Column("source_url", Text),
    Column("source_group", Text),
    Column("posted_at", TIMESTAMP(timezone=True), nullable=False),
    Column("scraped_at", TIMESTAMP(timezone=True), nullable=False),
    Column("location", Text),
    Column("city", Text),
    Column("city_id", BigInteger),
    Column("rent", Integer),
    Column("bhk", Text),
    Column("gender_preference", Text, nullable=False),
    Column("furnishing_status", Text),
    Column("additional_details", Text),
    Column("latitude", Float),
    Column("longitude", Float),
    Column("original_text", Text, nullable=False),
    Column("contact_name", Text),
    Column("contact_url", Text),
    Column("is_rental", Boolean, nullable=False),
    Column("is_offer", Boolean, nullable=False),
    Column("status", Text, nullable=False),
    Column("archived_at", TIMESTAMP(timezone=True)),
)

raw_posts = Table(
    "raw_posts",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("source", Text, nullable=False),
    Column("source_id", Text, nullable=False),
    Column("source_group", Text),
    Column("source_url", Text),
    Column("text", Text, nullable=False),
    Column("posted_at", TIMESTAMP(timezone=True)),
    Column("scraped_at", TIMESTAMP(timezone=True)),
    Column("author_name", Text),
    Column("author_url", Text),
    Column("meta", JSONB),
    Column("processed_at", TIMESTAMP(timezone=True)),
)

scrape_runs = Table(
    "scrape_runs",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("source", Text, nullable=False),
    Column("target", Text, nullable=False),
    Column("started_at", TIMESTAMP(timezone=True)),
    Column("finished_at", TIMESTAMP(timezone=True)),
    Column("posts_seen", Integer, nullable=False),
    Column("posts_new", Integer, nullable=False),
    Column("listings_upserted", Integer, nullable=False),
    Column("status", Text, nullable=False),
    Column("error", Text),
)

alert_categories = Table(
    "alert_categories",
    metadata,
    # Admin-managed delivery toggles; absent row = enabled.
    Column("category", Text, primary_key=True),
    Column("enabled", Boolean, nullable=False),
    Column("updated_at", TIMESTAMP(timezone=True)),
)

geocode_cache = Table(
    "geocode_cache",
    metadata,
    # Normalized lookup string: lowercased "location, city".
    Column("query", Text, primary_key=True),
    # NULL coordinates = geocoder definitively found nothing (negative cache).
    Column("latitude", Float),
    Column("longitude", Float),
    Column("created_at", TIMESTAMP(timezone=True)),
)

alerts = Table(
    "alerts",
    metadata,
    Column("id", BigInteger, primary_key=True),
    Column("category", Text, nullable=False),
    Column("severity", Text, nullable=False),
    Column("source", Text, nullable=False),
    Column("message", Text, nullable=False),
    Column("details", JSONB),
    Column("run_id", BigInteger),
    Column("created_at", TIMESTAMP(timezone=True)),
    Column("delivery_status", Text, nullable=False),
    Column("delivery_attempts", Integer, nullable=False),
    Column("last_attempt_at", TIMESTAMP(timezone=True)),
    Column("delivered_at", TIMESTAMP(timezone=True)),
    Column("delivery_error", Text),
)

# Columns Python writes/reads; schema_check asserts each exists in the live DB.
EXPECTED_COLUMNS: dict[str, set[str]] = {
    "cities": {c.name for c in cities.columns},
    "groups": {c.name for c in groups.columns},
    "listings": {c.name for c in listings.columns},
    "listings_archive": {c.name for c in listings_archive.columns},
    "raw_posts": {c.name for c in raw_posts.columns},
    "scrape_runs": {c.name for c in scrape_runs.columns},
    "geocode_cache": {c.name for c in geocode_cache.columns},
    "alert_categories": {c.name for c in alert_categories.columns},
    "alerts": {c.name for c in alerts.columns},
}
