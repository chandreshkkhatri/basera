"""Unified LLM client.

Merges the two duplicated provider-dispatch code paths from the original
scraper (`call_llm` and `extract_location_with_gpt`) into one class. The
extraction tool schema is generated once from the ExtractedListing model.
"""

from __future__ import annotations

import json
import logging
import re
import time

from .config import Settings
from .models import (
    EXTRACTION_PARAMETERS,
    EXTRACTION_TOOL_DESCRIPTION,
    EXTRACTION_TOOL_NAME,
    ExtractedListing,
)

log = logging.getLogger(__name__)


class QuotaExceededError(Exception):
    """Raised when the LLM API's rate limit / quota is fully exhausted."""


def _is_rate_limit(err: Exception) -> bool:
    s = str(err).lower()
    return (
        "429" in s
        or "resource_exhausted" in s
        or "quota exceeded" in s
        or "insufficient_quota" in s
        or "rate limit" in s
        or "limit exceeded" in s
    )


def _retry_after_seconds(err: Exception, default: float) -> float:
    match = re.search(r"retry in ([\d.]+)s", str(err), re.IGNORECASE)
    if match:
        return float(match.group(1)) + 1
    return default


class LLMClient:
    """Wraps whichever provider the settings select. Provider dispatch happens
    once at construction, not per call."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.provider = settings.model_provider
        self._openai = None
        self._gemini = None
        self._genai_types = None

        if self.provider == "gemini":
            from google import genai
            from google.genai import types

            self._genai_types = types
            self._gemini = (
                genai.Client(api_key=settings.gemini_api_key)
                if settings.gemini_api_key
                else genai.Client()
            )
            self._model = settings.model_name or "gemini-2.5-flash"
        else:
            import openai

            openai.api_key = settings.openai_api_key
            self._openai = openai
            self._model = settings.model_name or "gpt-4o-mini"

    # -- generic completion ------------------------------------------------
    def complete(
        self,
        prompt: str,
        system: str | None = None,
        *,
        max_tokens: int = 300,
        temperature: float = 0.1,
    ) -> str | None:
        """Plain text completion with retry/backoff on rate limits."""
        retries = self.settings.llm_retries
        for attempt in range(retries):
            try:
                if self.provider == "gemini":
                    return self._gemini_complete(prompt, system, max_tokens, temperature)
                return self._openai_complete(prompt, system, max_tokens, temperature)
            except Exception as e:  # noqa: BLE001 — classify then re-raise
                if _is_rate_limit(e) and attempt < retries - 1:
                    wait = _retry_after_seconds(e, self.settings.llm_backoff_base_s)
                    log.warning(
                        "Rate limit hit; waiting %.0fs (attempt %d/%d)",
                        wait, attempt + 1, retries,
                    )
                    time.sleep(wait)
                    continue
                if _is_rate_limit(e):
                    raise QuotaExceededError(str(e)) from e
                log.error("LLM completion error: %s", e)
                return None
        return None

    def _openai_complete(self, prompt, system, max_tokens, temperature) -> str | None:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        resp = self._openai.chat.completions.create(
            model=self._model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content

    def _gemini_complete(self, prompt, system, max_tokens, temperature) -> str | None:
        types = self._genai_types
        args = {"temperature": temperature, "max_output_tokens": max_tokens}
        if system:
            args["system_instruction"] = system
        resp = self._gemini.models.generate_content(
            model=self._model,
            contents=prompt,
            config=types.GenerateContentConfig(**args),
        )
        return resp.text

    # -- rental classification --------------------------------------------
    def classify_rental(self, text: str) -> bool:
        """True if the post is about renting residential property. LLM first,
        keyword fallback on non-quota errors (ported from facebook_bot.py)."""
        try:
            response = self.complete(
                prompt=(
                    "Determine if this Facebook post is about renting "
                    "residential property. Reply YES or NO.\n"
                    f"Text: '''{text}'''"
                ),
                system="Reply with only YES or NO. Do not add any introduction "
                "or explanations.",
                temperature=0.0,
                max_tokens=1024,
            )
            if response:
                return "yes" in response.strip().lower()
        except QuotaExceededError:
            raise
        except Exception as e:  # noqa: BLE001
            log.debug("classify_rental LLM error, using keyword fallback: %s", e)

        keywords = [
            "rent", "for rent", "room for rent",
            "apartment for rent", "flat for rent", "house for rent",
        ]
        low = text.lower()
        return any(k in low for k in keywords)

    # -- structured extraction --------------------------------------------
    def extract_listing(self, text: str) -> ExtractedListing | None:
        """Extract structured rental fields via provider function calling."""
        try:
            if self.provider == "gemini":
                raw = self._gemini_extract(text)
            else:
                raw = self._openai_extract(text)
        except QuotaExceededError:
            raise
        except Exception as e:  # noqa: BLE001
            if _is_rate_limit(e):
                raise QuotaExceededError(str(e)) from e
            log.error("extract_listing error: %s", e)
            return None

        if raw is None:
            return None
        return ExtractedListing.model_validate(raw)

    def _openai_extract(self, text: str) -> dict | None:
        resp = self._openai.chat.completions.create(
            model=self._model,
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that extracts "
                    "location and rental details from text listings.",
                },
                {"role": "user", "content": text},
            ],
            temperature=0.1,
            tools=[
                {
                    "type": "function",
                    "function": {
                        "name": EXTRACTION_TOOL_NAME,
                        "description": EXTRACTION_TOOL_DESCRIPTION,
                        "parameters": EXTRACTION_PARAMETERS,
                    },
                }
            ],
            tool_choice={
                "type": "function",
                "function": {"name": EXTRACTION_TOOL_NAME},
            },
        )
        calls = resp.choices[0].message.tool_calls
        if calls:
            return json.loads(calls[0].function.arguments)
        return None

    def _gemini_extract(self, text: str) -> dict | None:
        types = self._genai_types
        declaration = types.FunctionDeclaration(
            name=EXTRACTION_TOOL_NAME,
            description=EXTRACTION_TOOL_DESCRIPTION,
            parameters=EXTRACTION_PARAMETERS,
        )
        config = types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=2048,
            tools=[types.Tool(function_declarations=[declaration])],
            tool_config=types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode="ANY")
            ),
        )
        resp = self._gemini.models.generate_content(
            model=self._model, contents=text, config=config
        )
        if resp.function_calls:
            return dict(resp.function_calls[0].args)
        return None
