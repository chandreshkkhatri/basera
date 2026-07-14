"""Validators and schema consistency for the LLM extraction models."""

from ingestion.models import (
    EXTRACTION_PARAMETERS,
    ExtractedListing,
    RunStats,
)


class TestExtractedListingValidators:
    def test_intent_accepts_known_values(self):
        for intent in ("offer", "seek", "not_rental"):
            assert ExtractedListing.model_validate({"intent": intent}).intent == intent

    def test_intent_defaults_to_offer_on_garbage_or_missing(self):
        assert ExtractedListing.model_validate({"intent": "banana"}).intent == "offer"
        assert ExtractedListing.model_validate({}).intent == "offer"

    def test_rent_coercion(self):
        assert ExtractedListing.model_validate({"rent": "25,000"}).rent == 25000
        assert ExtractedListing.model_validate({"rent": 0}).rent is None
        assert ExtractedListing.model_validate({"rent": ""}).rent is None
        assert ExtractedListing.model_validate({"rent": "-5"}).rent is None
        assert ExtractedListing.model_validate({"rent": "abc"}).rent is None

    def test_gender_defaults_to_any(self):
        assert (
            ExtractedListing.model_validate({"gender_preference": "aliens"})
            .gender_preference
            == "any"
        )

    def test_furnishing_defaults_to_unfurnished(self):
        assert (
            ExtractedListing.model_validate({"furnishing_status": "??"})
            .furnishing_status
            == "unfurnished"
        )


class TestExtractionSchemaConsistency:
    """The tool schema handed to OpenAI/Gemini must stay in lockstep with the
    pydantic model — drift means silently dropped fields."""

    def test_schema_properties_match_model_fields(self):
        assert set(EXTRACTION_PARAMETERS["properties"]) == set(
            ExtractedListing.model_fields
        )

    def test_all_properties_required(self):
        # Providers behave better when every field is required and the model
        # explicitly nulls what's absent.
        assert set(EXTRACTION_PARAMETERS["required"]) == set(
            EXTRACTION_PARAMETERS["properties"]
        )

    def test_intent_enum_matches_literal(self):
        assert EXTRACTION_PARAMETERS["properties"]["intent"]["enum"] == [
            "offer",
            "seek",
            "not_rental",
        ]


def test_runstats_summary_includes_all_counters():
    s = RunStats(
        posts_seen=1, posts_new=2, not_rental=3, not_offer=4,
        extraction_failed=5, geocode_failed=6, listings_upserted=7,
    )
    out = s.summary()
    for fragment in (
        "seen=1", "new=2", "not_rental=3", "not_offer=4",
        "extract_failed=5", "geocode_failed=6", "upserted=7",
    ):
        assert fragment in out
