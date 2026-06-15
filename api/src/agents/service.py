from __future__ import annotations

from datetime import datetime, timezone

from supabase import AsyncClient

AGENT_NAMES = ("monitor", "analyzer", "planner", "updater")


async def get_agent_statuses(supabase: AsyncClient, project_id: str) -> list[dict]:
    rows = (
        await supabase.table("agent_status")
        .select("*")
        .eq("project_id", project_id)
        .order("agent")
        .execute()
    ).data
    if rows:
        return rows

    initialized: list[dict] = []
    for agent_name in AGENT_NAMES:
        inserted = (
            await supabase.table("agent_status")
            .insert({"project_id": project_id, "agent": agent_name, "status": "idle"})
            .execute()
        ).data[0]
        initialized.append(inserted)
    return initialized


async def trigger_agents(supabase: AsyncClient, project_id: str) -> dict:
    await get_agent_statuses(supabase, project_id)
    updated_at = datetime.now(timezone.utc).isoformat()
    for index, agent_name in enumerate(AGENT_NAMES):
        status = "queued" if index == 0 else "idle"
        await supabase.table("agent_status").update(
            {"status": status, "updated_at": updated_at}
        ).eq("project_id", project_id).eq("agent", agent_name).execute()
    return {"project_id": project_id, "status": "queued"}
