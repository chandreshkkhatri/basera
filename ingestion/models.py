"""Shared data models: the RawPost every source yields, the LLM extraction
schema, and per-run statistics."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator

Gender = Literal["male", "female", "family", "bachelor", "any"]
Furnishing = Literal["fully furnished", "semi furnished", "unfurnished"]


@dataclass
class RawPost:
    """A post as scraped from a source, before LLM analysis."""

    source: str                      # 'telegram' | 'whatsapp' | 'facebook'
    source_id: str                   # unique within the source
    text: str
    posted_at: Optional[datetime] = None
    source_group: Optional[str] = None
    source_url: Optional[str] = None
    author_name: Optional[str] = None
    author_url: Optional[str] = None
    meta: dict = field(default_factory=dict)


class ExtractedListing(BaseModel):
    """Structured fields the LLM pulls from a post. The tool schema handed to
    OpenAI/Gemini is generated from this model, so there is one source of truth.

    Field descriptions are copied verbatim from the original hand-written tool
    schemas (telegram_bot.py:145-291) — extraction quality is tuned to them, so
    do not reword.
    """

    location: Optional[str] = None
    city: Optional[str] = None
    rent: Optional[float] = None
    bhk: Optional[str] = None
    gender_preference: Gender = "any"
    furnishing_status: Furnishing = "unfurnished"
    additional_details: Optional[str] = None

    @field_validator("rent", mode="before")
    @classmethod
    def _coerce_rent(cls, v: object) -> Optional[float]:
        if v in (None, "", 0, "0"):
            return None
        try:
            n = float(str(v).replace(",", ""))
            return n if n > 0 else None
        except (TypeError, ValueError):
            return None

    @field_validator("gender_preference", mode="before")
    @classmethod
    def _default_gender(cls, v: object) -> str:
        allowed = {"male", "female", "family", "bachelor", "any"}
        return v if v in allowed else "any"

    @field_validator("furnishing_status", mode="before")
    @classmethod
    def _default_furnishing(cls, v: object) -> str:
        allowed = {"fully furnished", "semi furnished", "unfurnished"}
        return v if v in allowed else "unfurnished"


# JSON-schema property descriptions shared by both providers' tool definitions.
EXTRACTION_TOOL_NAME = "extract_property_details"
EXTRACTION_TOOL_DESCRIPTION = (
    "Extract specific locality/neighborhood and rent details from a "
    "residential rental listing post."
)
EXTRACTION_PARAMETERS: dict = {
    "type": "object",
    "properties": {
        "location": {
            "type": "string",
            "description": "The specific area/locality/neighborhood mentioned "
            "(e.g. 'Balewadi', 'Baner').",
        },
        "city": {
            "type": "string",
            "description": "The city name (e.g. 'Pune', 'Mumbai').",
        },
        "rent": {
            "type": "number",
            "description": "The monthly rent amount mentioned as a number "
            "(e.g. 25000).",
        },
        "bhk": {
            "type": "string",
            "description": "The configuration of the property "
            "(e.g. '1BHK', '2BHK').",
        },
        "gender_preference": {
            "type": "string",
            "enum": ["male", "female", "family", "bachelor", "any"],
            "description": "Preferred tenant type. Choose 'any' if not "
            "explicitly specified.",
        },
        "furnishing_status": {
            "type": "string",
            "enum": ["fully furnished", "semi furnished", "unfurnished"],
            "description": "Furnishing state of the property. Choose "
            "'unfurnished' if not specified.",
        },
        "additional_details": {
            "type": "string",
            "description": "Any other relevant details (furnished, deposit, "
            "parking, etc.).",
        },
    },
    "required": [
        "location",
        "city",
        "rent",
        "bhk",
        "gender_preference",
        "furnishing_status",
        "additional_details",
    ],
}


@dataclass
class RunStats:
    """Per-run counters, logged at the end and persisted to scrape_runs."""

    posts_seen: int = 0
    posts_new: int = 0
    not_rental: int = 0
    extraction_failed: int = 0
    geocode_failed: int = 0
    listings_upserted: int = 0
    # Not persisted (finish_run reads only the counters); lets the analyze
    # path report a quota stop to the CLI so the runner can cool down.
    quota_exceeded: bool = False

    def summary(self) -> str:
        return (
            f"seen={self.posts_seen} new={self.posts_new} "
            f"not_rental={self.not_rental} extract_failed={self.extraction_failed} "
            f"geocode_failed={self.geocode_failed} "
            f"upserted={self.listings_upserted}"
        )


@dataclass
class RunResult:
    """Outcome of one run_source() call: stats + the persisted run status."""

    stats: RunStats
    status: str  # success | error | quota_exceeded | login_failed
    error: Optional[str] = None
