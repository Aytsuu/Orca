from __future__ import annotations

from pydantic import ValidationError

from src.config import get_settings
from src.exceptions import ConfigurationError, InvalidOutputError, RateLimitError
from src.llm.client import SchemaT
from src.llm.rate_limiter import RateLimiter


class GeminiJsonLlmClient:
    def __init__(self, rate_limiter: RateLimiter | None = None) -> None:
        settings = get_settings()
        if not settings.llm_api_key:
            raise ConfigurationError("LLM_API_KEY is required for Gemini.")
        self._api_key = settings.llm_api_key
        self._rate_limiter = rate_limiter or RateLimiter(settings.llm_rate_limit_rpm)

    async def generate_json(
        self,
        prompt: str,
        schema: type[SchemaT],
        *,
        model: str,
        temperature: float,
    ) -> SchemaT:
        await self._rate_limiter.acquire()
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise ConfigurationError("google-genai is not installed.") from exc

        client = genai.Client(api_key=self._api_key)
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=temperature,
                    response_mime_type="application/json",
                    response_schema=schema.model_json_schema(),
                ),
            )
        except Exception as exc:  # pragma: no cover
            if "429" in str(exc):
                raise RateLimitError(str(exc)) from exc
            raise

        text = getattr(response, "text", None)
        if not text:
            raise InvalidOutputError("Gemini returned an empty response.")
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            raise InvalidOutputError(str(exc)) from exc
