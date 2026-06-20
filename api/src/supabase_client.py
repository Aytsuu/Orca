from __future__ import annotations

from supabase import AsyncClient, acreate_client

from src.config import get_settings
from src.exceptions import SupabaseNotConfigured


async def get_supabase() -> AsyncClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_client_key:
        raise SupabaseNotConfigured()

    return await acreate_client(settings.supabase_url, settings.supabase_client_key)


async def get_supabase_admin() -> AsyncClient:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_admin_key:
        raise SupabaseNotConfigured()

    return await acreate_client(settings.supabase_url, settings.supabase_admin_key)
