from __future__ import annotations

from types import SimpleNamespace

from src.pipelines import runner


def _settings(**overrides):
    values = {
        "llm_fallback_enabled": True,
        "llm_fallback_api_key": None,
        "llm_fallback_provider": "gemini",
        "llm_rate_limit_rpm": 15,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_default_fallback_client_is_not_created_without_fallback_key(monkeypatch) -> None:
    runner.build_default_fallback_llm_client.cache_clear()
    monkeypatch.setattr(runner, "get_settings", lambda: _settings(llm_fallback_api_key=None))

    assert runner.build_default_fallback_llm_client() is None


def test_default_fallback_client_is_created_when_fallback_key_is_configured(monkeypatch) -> None:
    runner.build_default_fallback_llm_client.cache_clear()
    created = []

    class FakeGeminiClient:
        def __init__(self, *, api_key, rate_limiter):
            del rate_limiter
            created.append(api_key)

    monkeypatch.setattr(
        runner,
        "get_settings",
        lambda: _settings(llm_fallback_api_key="fallback-key"),
    )
    monkeypatch.setattr(runner, "GeminiJsonLlmClient", FakeGeminiClient)

    client = runner.build_default_fallback_llm_client()

    assert isinstance(client, FakeGeminiClient)
    assert created == ["fallback-key"]
