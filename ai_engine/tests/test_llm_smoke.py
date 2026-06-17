from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.llm import smoke


class FakeGeminiJsonLlmClient:
    created_with: list[str | None] = []
    calls: list[dict[str, object]] = []

    def __init__(self, *, api_key: str | None = None) -> None:
        self.created_with.append(api_key)

    async def generate_json(self, prompt, schema, *, model: str, temperature: float):
        self.calls.append(
            {
                "prompt": prompt,
                "schema": schema,
                "model": model,
                "temperature": temperature,
            }
        )
        return schema(ok=True, msg="pong")


@pytest.mark.asyncio
async def test_fallback_smoke_uses_fallback_key_and_fast_model(monkeypatch) -> None:
    FakeGeminiJsonLlmClient.created_with = []
    FakeGeminiJsonLlmClient.calls = []
    monkeypatch.setattr(smoke, "GeminiJsonLlmClient", FakeGeminiJsonLlmClient)
    monkeypatch.setattr(
        smoke,
        "get_settings",
        lambda: SimpleNamespace(
            llm_fallback_api_key="fallback-key",
            llm_fallback_fast_model="gemini-fallback-lite",
        ),
    )

    result = await smoke.run_smoke_test(profile="fallback")

    assert result.ok is True
    assert FakeGeminiJsonLlmClient.created_with == ["fallback-key"]
    assert FakeGeminiJsonLlmClient.calls[0]["model"] == "gemini-fallback-lite"
