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
    Column("status", Text, nullable=False),
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

# Columns Python writes; schema_check asserts each exists in the live DB.
EXPECTED_COLUMNS: dict[str, set[str]] = {
    "listings": {c.name for c in listings.columns},
    "raw_posts": {c.name for c in raw_posts.columns},
    "scrape_runs": {c.name for c in scrape_runs.columns},
}
