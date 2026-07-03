"""SQLAlchemy engine factory (psycopg3 driver)."""

from __future__ import annotations

from sqlalchemy import Engine, create_engine

from ..config import Settings


def get_engine(settings: Settings) -> Engine:
    url = settings.database_url
    # Accept a plain postgres:// URL (as the web app uses) and route it through
    # the psycopg3 driver Python needs.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return create_engine(url, pool_pre_ping=True)
