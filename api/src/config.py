from __future__ import annotations

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

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

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.app_cors_origins.split(",") if origin.strip()]

    @computed_field
    @property
    def supabase_client_key(self) -> str | None:
        return self.supabase_publishable_key or self.supabase_anon_key

    @computed_field
    @property
    def supabase_admin_key(self) -> str | None:
        return self.supabase_secret_key or self.supabase_service_key

    @computed_field
    @property
    def docs_enabled(self) -> bool:
        return self.app_env in {"local", "staging"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

