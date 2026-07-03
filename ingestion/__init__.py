"""Basera data ingestion engine.

Scrapes house-rental posts from Telegram, WhatsApp and Facebook groups,
extracts structured fields with an LLM, geocodes them, and upserts into the
shared Postgres database that the Next.js web app reads.

Run via the CLI:  python -m ingestion --help
"""

__version__ = "0.1.0"
