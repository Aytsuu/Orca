from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from src.config import get_settings
from src.exceptions import ConfigurationError
from src.repository import get_llm_usage, increment_llm_usage


class DailyLlmBudgetExceededError(RuntimeError):
    pass


class GeminiEmbedder:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        async_client: Any | None = None,
        supabase=None,
        project_id: str | None = None,
        usage_date: str | None = None,
    ) -> None:
        settings = get_settings()
        self._api_key = api_key or settings.llm_api_key
        if not self._api_key:
            raise ConfigurationError("LLM_API_KEY is required for transcript embeddings.")
        self._model = model or settings.embedding_model
        self._async_client = async_client
        self._supabase = supabase
        self._project_id = project_id
        self._usage_date = usage_date or datetime.now(timezone.utc).date().isoformat()
        self._settings = settings

    async def _get_async_client(self):
        if self._async_client is None:
            try:
                from google import genai
            except ImportError as exc:  # pragma: no cover - environment-specific
                raise ConfigurationError("google-genai is not installed.") from exc
            self._async_client = genai.Client(api_key=self._api_key).aio
        return self._async_client

    async def _ensure_budget_available(self) -> None:
        if not self._supabase or not self._project_id:
            return
        usage = await get_llm_usage(
            self._supabase,
            project_id=self._project_id,
            date=self._usage_date,
        )
        if usage and usage["call_count"] >= self._settings.daily_llm_budget_per_project:
            raise DailyLlmBudgetExceededError("Daily LLM budget reached for transcript embeddings.")

    async def embed_batch(
        self,
        texts: list[str],
        *,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        if not texts:
            return []

        await self._ensure_budget_available()
        client = await self._get_async_client()
        response = await client.models.embed_content(
            model=self._model,
            contents=texts,
            config={"task_type": task_type},
        )
        embeddings = []
        for item in getattr(response, "embeddings", []) or []:
            values = getattr(item, "values", None)
            if values is None and isinstance(item, dict):
                values = item.get("values")
            embeddings.append(list(values or []))
        if len(embeddings) != len(texts):
            raise ValueError("Embedding response count did not match the input batch size.")
        if self._supabase and self._project_id:
            await increment_llm_usage(
                self._supabase,
                project_id=self._project_id,
                date=self._usage_date,
            )
        return embeddings
