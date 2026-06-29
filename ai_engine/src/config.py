from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    llm_provider: str | None = Field(default=None, alias="LLM_PROVIDER")
    llm_model: str = Field(default="gemini-2.5-flash", alias="LLM_MODEL")
    llm_fast_model: str = Field(default="gemini-2.5-flash-lite", alias="LLM_FAST_MODEL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    llm_fallback_enabled: bool = Field(default=True, alias="LLM_FALLBACK_ENABLED")
    llm_fallback_provider: str | None = Field(default="gemini", alias="LLM_FALLBACK_PROVIDER")
    llm_fallback_api_key: str | None = Field(default=None, alias="LLM_FALLBACK_API_KEY")
    llm_fallback_model: str = Field(
        default="gemini-2.5-flash",
        alias="LLM_FALLBACK_MODEL",
    )
    llm_fallback_fast_model: str = Field(
        default="gemini-2.5-flash-lite",
        alias="LLM_FALLBACK_FAST_MODEL",
    )
    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_service_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_KEY")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    agent_queue_name: str = Field(default="orca-agent-pipeline", alias="AGENT_QUEUE_NAME")
    agent_queue_timeout_seconds: int = Field(default=300, alias="AGENT_QUEUE_TIMEOUT_SECONDS")
    daily_llm_budget_per_project: int = Field(default=100, alias="DAILY_LLM_BUDGET")
    llm_budget_warning_threshold: float = Field(
        default=0.8,
        alias="LLM_BUDGET_WARNING_THRESHOLD",
    )
    debounce_message_count: int = Field(default=3, alias="DEBOUNCE_MESSAGE_COUNT")
    debounce_silence_seconds: int = Field(default=8, alias="DEBOUNCE_SILENCE_SECONDS")
    summary_message_threshold: int = Field(default=15, alias="SUMMARY_MESSAGE_THRESHOLD")
    llm_rate_limit_rpm: int = Field(default=15, alias="LLM_RATE_LIMIT_RPM")
    context_warning_tokens: int = Field(default=100000, alias="CONTEXT_WARNING_TOKENS")
    context_memory_limit: int = Field(default=10, alias="CONTEXT_MEMORY_LIMIT")
    context_summary_limit: int = Field(default=5, alias="CONTEXT_SUMMARY_LIMIT")


@lru_cache
def get_settings() -> Settings:
    return Settings()
