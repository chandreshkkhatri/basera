"""Keyword fallback classifier — the safety net when the LLM call fails."""

import pytest

from ingestion.llm import _keyword_classify


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        # offers
        ("2 BHK Fully Furnished Flat Available for Rent Hinjawadi Phase 2", "offer"),
        ("No Brokerage Direct from Owner 3 BHK Flat for Rent at Balewadi", "offer"),
        ("Spacious 1BHK available on rent, semi furnished, Wakad", "offer"),
        ("Renting out my 2bhk in Kharadi from next month", "offer"),
        # seekers
        ("Looking for a 2bhk immediate available in sus for working bachelors", "seek"),
        ("Hi, I am looking for accommodation from 1st August near Blue Ridge", "seek"),
        ("Flatmate Required - Baner. Looking for flatmates for a 2 BHK", "seek"),
        ("Need a flat in Baner under 20k", "seek"),
        ("In search of a 1RK near EON IT park", "seek"),
        # neither
        ("Selling my old sofa and fridge, contact me", "not_rental"),
        ("Best home cleaning services in Pune, call now", "not_rental"),
    ],
)
def test_keyword_classify(text, expected):
    assert _keyword_classify(text) == expected


def test_offer_phrase_wins_over_generic_seek_marketing():
    # Marketing copy on real offers often contains "looking for":
    # an explicit offer phrase must take precedence.
    assert (
        _keyword_classify("Looking for a home? 2 BHK available for rent in Baner")
        == "offer"
    )
