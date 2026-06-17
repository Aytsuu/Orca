from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from src.config import get_settings
from src.exceptions import (
    AuthenticationError,
    ConfigurationError,
    InvalidOutputError,
    QuotaExceededError,
    RateLimitError,
    TransportError,
)
from src.llm.client import SchemaT
from src.llm.rate_limiter import RateLimiter

REPAIR_PROMPT = """
The previous output failed validation with the following error:
{validation_error}

Please fix the output to match the required schema. The original prompt was:
{original_prompt}

Return ONLY the corrected JSON.
""".strip()


class GeminiJsonLlmClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        rate_limiter: RateLimiter | None = None,
    ) -> None:
        settings = get_settings()
        resolved_api_key = api_key or settings.llm_api_key
        if not resolved_api_key:
            raise ConfigurationError("LLM_API_KEY is required for Gemini.")
        self._settings = settings
        self._api_key = resolved_api_key
        self._rate_limiter = rate_limiter or RateLimiter(settings.llm_rate_limit_rpm)
        self._async_client = None

    async def _get_async_client(self):
        if self._async_client is None:
            try:
                from google import genai
            except ImportError as exc:
                raise ConfigurationError("google-genai is not installed.") from exc
            self._async_client = genai.Client(api_key=self._api_key).aio
        return self._async_client

    def _build_config(self, types_module, schema: type[SchemaT], temperature: float):
        return types_module.GenerateContentConfig(
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=schema,
        )

    async def _request_json(
        self,
        *,
        prompt: str,
        schema: type[SchemaT],
        model: str,
        temperature: float,
    ):
        try:
            from google.genai import errors, types
        except ImportError as exc:
            raise ConfigurationError("google-genai is not installed.") from exc

        client = await self._get_async_client()
        try:
            return await client.models.generate_content(
                model=model,
                contents=prompt,
                config=self._build_config(types, schema, temperature),
            )
        except Exception as exc:  # pragma: no cover - exercised with test doubles
            classified = self._classify_exception(exc, errors_module=errors)
            if classified:
                raise classified from exc
            if isinstance(exc, (AttributeError, TypeError, ValueError)):
                raise ConfigurationError(
                    f"Gemini schema/request configuration failed: {exc}"
                ) from exc
            raise

    def _classify_exception(self, exc: Exception, *, errors_module) -> Exception | None:
        del errors_module
        code = getattr(exc, "code", None)
        message = str(exc).lower()

        if code == 401 or "api key" in message or "unauthorized" in message:
            return AuthenticationError(str(exc))
        if code == 429:
            if "quota" in message or "resource exhausted" in message:
                return QuotaExceededError(str(exc))
            return RateLimitError(str(exc))
        if "quota" in message or "resource exhausted" in message:
            return QuotaExceededError(str(exc))
        if code is not None and int(code) >= 500:
            return TransportError(str(exc))
        if any(token in message for token in ("timeout", "timed out", "connection", "socket")):
            return TransportError(str(exc))
        return None

    def _parse_response(self, response: Any, schema: type[SchemaT]) -> SchemaT:
        parsed = getattr(response, "parsed", None)
        if parsed is not None:
            try:
                return parsed if isinstance(parsed, schema) else schema.model_validate(parsed)
            except ValidationError as exc:
                raise InvalidOutputError(str(exc)) from exc

        text = getattr(response, "text", None)
        if not text:
            raise InvalidOutputError("Gemini returned an empty response.")
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            raise InvalidOutputError(str(exc)) from exc

    async def _repair_invalid_output(
        self,
        *,
        prompt: str,
        schema: type[SchemaT],
        model: str,
        validation_error: str,
    ) -> SchemaT:
        repair_prompt = REPAIR_PROMPT.format(
            validation_error=validation_error,
            original_prompt=prompt,
        )
        response = await self._request_json(
            prompt=repair_prompt,
            schema=schema,
            model=model,
            temperature=0.0,
        )
        return self._parse_response(response, schema)

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
            response = await self._request_json(
                prompt=prompt,
                schema=schema,
                model=model,
                temperature=temperature,
            )
            return self._parse_response(response, schema)
        except InvalidOutputError as exc:
            return await self._repair_invalid_output(
                prompt=prompt,
                schema=schema,
                model=model,
                validation_error=exc.message,
            )
