from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient

from src.agents.queue import QueueProducer
from src.config import get_settings

AGENT_NAMES = ("monitor", "analyzer", "planner", "updater")
ACTIVE_RUN_STATUSES = {"queued", "running"}


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


async def get_latest_agent_artifacts(supabase: AsyncClient, project_id: str) -> list[dict]:
    latest_runs = (
        await supabase.table("agent_run")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    if not latest_runs:
        return []

    latest_run = latest_runs[0]
    artifacts = (
        await supabase.table("agent_artifact")
        .select("*")
        .eq("project_id", project_id)
        .eq("run_id", latest_run["id"])
        .order("created_at", desc=True)
        .execute()
    ).data
    return artifacts


async def set_agent_status(
    supabase: AsyncClient,
    *,
    project_id: str,
    agent: str,
    status: str,
) -> None:
    await supabase.table("agent_status").update(
        {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("project_id", project_id).eq("agent", agent).execute()


async def set_agent_statuses_for_new_run(supabase: AsyncClient, project_id: str) -> None:
    updated_at = datetime.now(timezone.utc).isoformat()
    for index, agent_name in enumerate(AGENT_NAMES):
        status = "queued" if index == 0 else "idle"
        await supabase.table("agent_status").update(
            {"status": status, "updated_at": updated_at}
        ).eq("project_id", project_id).eq("agent", agent_name).execute()


async def get_active_run(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
    return await get_latest_run_with_statuses(supabase, project_id, ACTIVE_RUN_STATUSES)


async def get_latest_run_with_statuses(
    supabase: AsyncClient,
    project_id: str,
    statuses: set[str],
) -> dict[str, Any] | None:
    rows = (
        await supabase.table("agent_run")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    for row in rows:
        if row["status"] in statuses:
            return row
    return None


def _merge_ids(existing: list[str], incoming: list[str]) -> list[str]:
    merged = list(existing)
    for item in incoming:
        if item not in merged:
            merged.append(item)
    return merged


async def append_run_inputs(
    supabase: AsyncClient,
    *,
    run: dict[str, Any],
    message_ids: list[str] | None = None,
    file_ids: list[str] | None = None,
) -> dict[str, Any]:
    payload = {
        "new_message_ids": _merge_ids(run.get("new_message_ids", []), message_ids or []),
        "new_file_ids": _merge_ids(run.get("new_file_ids", []), file_ids or []),
    }
    updated = (
        await supabase.table("agent_run").update(payload).eq("id", run["id"]).execute()
    ).data[0]
    return updated


async def create_agent_run(
    supabase: AsyncClient,
    *,
    project_id: str,
    triggered_by: str,
    message_ids: list[str] | None = None,
    file_ids: list[str] | None = None,
) -> dict[str, Any]:
    inserted = (
        await supabase.table("agent_run")
        .insert(
            {
                "project_id": project_id,
                "triggered_by": triggered_by,
                "status": "queued",
                "new_message_ids": message_ids or [],
                "new_file_ids": file_ids or [],
            }
        )
        .execute()
    ).data[0]
    return inserted


async def trigger_agents(
    supabase: AsyncClient,
    queue_producer: QueueProducer,
    *,
    project_id: str,
    triggered_by: str,
    message_ids: list[str] | None = None,
    file_ids: list[str] | None = None,
    debounce: bool = False,
) -> dict[str, Any]:
    settings = get_settings()
    await get_agent_statuses(supabase, project_id)
    queued_run = await get_latest_run_with_statuses(supabase, project_id, {"queued"})

    if queued_run:
        updated_run = await append_run_inputs(
            supabase,
            run=queued_run,
            message_ids=message_ids,
            file_ids=file_ids,
        )
        if (
            debounce
            and updated_run["status"] == "queued"
            and len(updated_run.get("new_message_ids", [])) >= settings.debounce_message_count
        ):
            queue_producer.enqueue_run(updated_run["id"])
        return {
            "run_id": updated_run["id"],
            "project_id": project_id,
            "status": updated_run["status"],
            "reused_active_run": True,
        }

    running_run = await get_latest_run_with_statuses(supabase, project_id, {"running"})
    if running_run:
        created_run = await create_agent_run(
            supabase,
            project_id=project_id,
            triggered_by=triggered_by,
            message_ids=message_ids,
            file_ids=file_ids,
        )
        queue_producer.enqueue_run(created_run["id"])
        return {
            "run_id": created_run["id"],
            "project_id": project_id,
            "status": "queued",
            "reused_active_run": False,
        }

    created_run = await create_agent_run(
        supabase,
        project_id=project_id,
        triggered_by=triggered_by,
        message_ids=message_ids,
        file_ids=file_ids,
    )
    await set_agent_statuses_for_new_run(supabase, project_id)
    delay_seconds = None
    if debounce and len(created_run.get("new_message_ids", [])) < settings.debounce_message_count:
        delay_seconds = settings.debounce_silence_seconds
    queue_producer.enqueue_run(created_run["id"], delay_seconds=delay_seconds)
    return {
        "run_id": created_run["id"],
        "project_id": project_id,
        "status": "queued",
        "reused_active_run": False,
    }
