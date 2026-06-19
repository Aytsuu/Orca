from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

import pytest
from pydantic import BaseModel

from src.exceptions import AuthenticationError, InvalidOutputError, TransportError
from src.llm.gemini import GeminiJsonLlmClient
from src.agents.schemas import PlannerOutput


class Ping(BaseModel):
    ok: bool
    msg: str


class FakeResponse:
    def __init__(self, *, text: str | None = None, parsed=None) -> None:
        self.text = text
        self.parsed = parsed


class FakeGenerateContentConfig:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs


def install_fake_google(
    monkeypatch: pytest.MonkeyPatch,
    fake_client_class,
    client_error_class=None,
):
    google_module = ModuleType("google")
    genai_module = ModuleType("google.genai")
    types_module = ModuleType("google.genai.types")
    errors_module = ModuleType("google.genai.errors")

    genai_module.Client = fake_client_class
    types_module.GenerateContentConfig = FakeGenerateContentConfig
    errors_module.ClientError = client_error_class or type("ClientError", (Exception,), {})
    errors_module.APIError = type("APIError", (Exception,), {})
    errors_module.ServerError = type("ServerError", (Exception,), {})

    google_module.genai = genai_module
    genai_module.types = types_module
    genai_module.errors = errors_module

    monkeypatch.setitem(sys.modules, "google", google_module)
    monkeypatch.setitem(sys.modules, "google.genai", genai_module)
    monkeypatch.setitem(sys.modules, "google.genai.types", types_module)
    monkeypatch.setitem(sys.modules, "google.genai.errors", errors_module)


@pytest.mark.asyncio
async def test_gemini_client_reuses_async_sdk_client(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.llm.gemini.get_settings",
        lambda: SimpleNamespace(llm_api_key="key", llm_rate_limit_rpm=15),
    )

    created_clients = 0
    calls: list[str] = []

    class FakeModels:
        async def generate_content(self, *, model, contents, config):
            calls.append(contents)
            return FakeResponse(parsed=Ping(ok=True, msg="pong"))

    class FakeAioClient:
        def __init__(self) -> None:
            self.models = FakeModels()

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            nonlocal created_clients
            created_clients += 1
            self.aio = FakeAioClient()

    install_fake_google(monkeypatch, FakeClient)

    client = GeminiJsonLlmClient()
    first = await client.generate_json(
        "first",
        Ping,
        model="gemini-2.5-flash-lite",
        temperature=0.0,
    )
    second = await client.generate_json(
        "second",
        Ping,
        model="gemini-2.5-flash-lite",
        temperature=0.0,
    )

    assert first.msg == "pong"
    assert second.msg == "pong"
    assert created_clients == 1
    assert calls == ["first", "second"]


@pytest.mark.asyncio
async def test_gemini_client_repairs_invalid_output_once(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "src.llm.gemini.get_settings",
        lambda: SimpleNamespace(llm_api_key="key", llm_rate_limit_rpm=15),
    )

    prompts: list[str] = []

    class FakeModels:
        def __init__(self) -> None:
            self._responses = [
                FakeResponse(text='{"ok": true}'),
                FakeResponse(text='{"ok": true, "msg": "pong"}'),
            ]

        async def generate_content(self, *, model, contents, config):
            prompts.append(contents)
            return self._responses.pop(0)

    class FakeAioClient:
        def __init__(self) -> None:
            self.models = FakeModels()

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            self.aio = FakeAioClient()

    install_fake_google(monkeypatch, FakeClient)

    client = GeminiJsonLlmClient()
    result = await client.generate_json(
        "Return ok and msg.",
        Ping,
        model="gemini-2.5-flash-lite",
        temperature=0.0,
    )

    assert result.msg == "pong"
    assert len(prompts) == 2
    assert "failed validation" in prompts[1]
    assert "Return ok and msg." in prompts[1]


@pytest.mark.asyncio
async def test_gemini_client_classifies_auth_and_transport_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "src.llm.gemini.get_settings",
        lambda: SimpleNamespace(llm_api_key="key", llm_rate_limit_rpm=15),
    )

    class FakeClientError(Exception):
        def __init__(self, code: int, message: str) -> None:
            super().__init__(message)
            self.code = code

    class AuthModels:
        async def generate_content(self, *, model, contents, config):
            raise FakeClientError(401, "invalid api key")

    class BrokenModels:
        async def generate_content(self, *, model, contents, config):
            raise RuntimeError("socket closed")

    class AuthAioClient:
        def __init__(self) -> None:
            self.models = AuthModels()

    class BrokenAioClient:
        def __init__(self) -> None:
            self.models = BrokenModels()

    auth_clients = []

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            self.aio = auth_clients.pop(0)

    install_fake_google(monkeypatch, FakeClient, client_error_class=FakeClientError)

    auth_clients[:] = [AuthAioClient()]
    client = GeminiJsonLlmClient()
    with pytest.raises(AuthenticationError):
        await client.generate_json("test", Ping, model="gemini-2.5-flash-lite", temperature=0.0)

    auth_clients[:] = [BrokenAioClient()]
    client = GeminiJsonLlmClient()
    with pytest.raises(TransportError):
        await client.generate_json("test", Ping, model="gemini-2.5-flash-lite", temperature=0.0)


@pytest.mark.asyncio
async def test_gemini_client_raises_invalid_output_after_failed_repair(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "src.llm.gemini.get_settings",
        lambda: SimpleNamespace(llm_api_key="key", llm_rate_limit_rpm=15),
    )

    class FakeModels:
        async def generate_content(self, *, model, contents, config):
            return FakeResponse(text='{"ok": true}')

    class FakeAioClient:
        def __init__(self) -> None:
            self.models = FakeModels()

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            self.aio = FakeAioClient()

    install_fake_google(monkeypatch, FakeClient)

    client = GeminiJsonLlmClient()
    with pytest.raises(InvalidOutputError):
        await client.generate_json("test", Ping, model="gemini-2.5-flash-lite", temperature=0.0)


@pytest.mark.asyncio
async def test_gemini_client_uses_flattened_planner_response_schema(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "src.llm.gemini.get_settings",
        lambda: SimpleNamespace(llm_api_key="key", llm_rate_limit_rpm=15),
    )

    captured_configs: list[FakeGenerateContentConfig] = []

    class FakeModels:
        async def generate_content(self, *, model, contents, config):
            captured_configs.append(config)
            return FakeResponse(text='{"changes": [], "summary": "ok"}')

    class FakeAioClient:
        def __init__(self) -> None:
            self.models = FakeModels()

    class FakeClient:
        def __init__(self, *, api_key: str) -> None:
            self.aio = FakeAioClient()

    install_fake_google(monkeypatch, FakeClient)

    client = GeminiJsonLlmClient()
    result = await client.generate_json(
        "planner",
        PlannerOutput,
        model="gemini-2.5-flash-lite",
        temperature=0.0,
    )

    assert result.summary == "ok"
    response_schema = captured_configs[0].kwargs["response_schema"]
    content_any_of = response_schema["properties"]["changes"]["items"]["properties"]["content"]["anyOf"]
    object_array_schema = content_any_of[0]
    assert object_array_schema["items"]["properties"]["acceptance_criteria"] == {
        "type": "array",
        "items": {"type": "string"},
    }
