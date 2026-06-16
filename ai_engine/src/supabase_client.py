from __future__ import annotations

from supabase import AsyncClient, acreate_client

from src.config import get_settings
from src.exceptions import ConfigurationError


async def get_supabase_admin() -> AsyncClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_key:
        raise ConfigurationError("Supabase service credentials are not configured.")
    return await acreate_client(settings.supabase_url, settings.supabase_service_key)
