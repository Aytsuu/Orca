from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    app_host: str = Field(default="127.0.0.1", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    app_cors_origins: str = Field(
        default="http://127.0.0.1:4321,http://localhost:4321",
        alias="APP_CORS_ORIGINS",
    )

    supabase_url: str | None = Field(default=None, alias="SUPABASE_URL")
    supabase_publishable_key: str | None = Field(default=None, alias="SUPABASE_PUBLISHABLE_KEY")
    supabase_anon_key: str | None = Field(default=None, alias="SUPABASE_ANON_KEY")
    supabase_secret_key: str | None = Field(default=None, alias="SUPABASE_SECRET_KEY")
    supabase_service_key: str | None = Field(default=None, alias="SUPABASE_SERVICE_KEY")
    redis_url: str | None = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    agent_queue_name: str = Field(default="orca-agent-pipeline", alias="AGENT_QUEUE_NAME")
    agent_queue_timeout_seconds: int = Field(default=300, alias="AGENT_QUEUE_TIMEOUT_SECONDS")
    transcript_queue_name: str = Field(default="orca-transcripts", alias="TRANSCRIPT_QUEUE_NAME")
    transcript_queue_timeout_seconds: int = Field(
        default=600,
        alias="TRANSCRIPT_QUEUE_TIMEOUT_SECONDS",
    )
    transcript_queue_retry_max: int = Field(default=3, alias="TRANSCRIPT_QUEUE_RETRY_MAX")
    transcript_queue_retry_backoff_seconds: int = Field(
        default=10,
        alias="TRANSCRIPT_QUEUE_RETRY_BACKOFF_SECONDS",
    )
    debounce_message_count: int = Field(default=3, alias="DEBOUNCE_MESSAGE_COUNT")
    debounce_silence_seconds: int = Field(default=8, alias="DEBOUNCE_SILENCE_SECONDS")

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.app_cors_origins.split(",") if origin.strip()]

    @computed_field
    @property
    def supabase_client_key(self) -> str | None:
        # The Python backend client is compatible with the JWT-style anon key.
        return self.supabase_anon_key or self.supabase_publishable_key

    @computed_field
    @property
    def supabase_admin_key(self) -> str | None:
        # Service-role JWT is the stable admin credential for backend operations.
        return self.supabase_service_key or self.supabase_secret_key

    @computed_field
    @property
    def docs_enabled(self) -> bool:
        return self.app_env in {"local", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
