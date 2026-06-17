from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient


async def get_agent_run(supabase: AsyncClient, run_id: str) -> dict[str, Any]:
    rows = (
        await supabase.table("agent_run").select("*").eq("id", run_id).limit(1).execute()
    ).data
    if not rows:
        raise ValueError(f"Agent run {run_id} was not found.")
    return rows[0]


async def update_agent_run(
    supabase: AsyncClient,
    run_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    updated = await supabase.table("agent_run").update(payload).eq("id", run_id).execute()
    return updated.data[0]


async def claim_agent_run(supabase: AsyncClient, run_id: str) -> dict[str, Any] | None:
    payload = {
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = (
        await supabase.table("agent_run")
        .update(payload)
        .eq("id", run_id)
        .eq("status", "queued")
        .execute()
    ).data
    return updated[0] if updated else None


async def set_run_status(
    supabase: AsyncClient,
    run_id: str,
    *,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    payload: dict[str, Any] = {"status": status}
    if status == "running":
        payload["started_at"] = now
    if status in {"completed", "failed"}:
        payload["completed_at"] = now
    if error_code:
        payload["error_code"] = error_code
    if error_message:
        payload["error_message"] = error_message
    return await update_agent_run(supabase, run_id, payload)


async def set_agent_status(
    supabase: AsyncClient,
    *,
    project_id: str,
    agent: str,
    status: str,
) -> None:
    payload = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = (
        await supabase.table("agent_status")
        .update(payload)
        .eq("project_id", project_id)
        .eq("agent", agent)
        .execute()
    ).data
    if not updated:
        await supabase.table("agent_status").insert(
            {"project_id": project_id, "agent": agent, **payload}
        ).execute()


async def create_agent_artifact(
    supabase: AsyncClient,
    *,
    run_id: str,
    project_id: str,
    agent: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    created = (
        await supabase.table("agent_artifact")
        .insert(
            {
                "run_id": run_id,
                "project_id": project_id,
                "agent": agent,
                "payload": payload,
            }
        )
        .execute()
    ).data[0]
    return created


async def create_memory_items(
    supabase: AsyncClient,
    *,
    project_id: str,
    items: list[dict[str, Any]],
) -> None:
    if not items:
        return
    payload = [
        {
            "project_id": project_id,
            "kind": item["kind"],
            "content": item["content"],
            "source_message_ids": item["source_message_ids"],
            "confidence": item["confidence"],
            "status": "active",
        }
        for item in items
    ]
    await supabase.table("project_memory").insert(payload).execute()


async def supersede_pending_proposals(supabase: AsyncClient, project_id: str) -> None:
    pending_rows = (
        await supabase.table("plan_proposal")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "pending")
        .execute()
    ).data
    for row in pending_rows:
        await supabase.table("plan_proposal").update({"status": "superseded"}).eq(
            "id", row["id"]
        ).execute()


async def create_plan_proposal(
    supabase: AsyncClient,
    *,
    project_id: str,
    changes: list[dict[str, Any]],
) -> dict[str, Any]:
    await supersede_pending_proposals(supabase, project_id)
    created = (
        await supabase.table("plan_proposal")
        .insert({"project_id": project_id, "status": "pending", "changes": changes})
        .execute()
    ).data[0]
    return created


async def create_conversation_summary(
    supabase: AsyncClient,
    *,
    project_id: str,
    summary: str,
    source_message_ids: list[str],
    last_message_created_at: str | None,
) -> None:
    await supabase.table("conversation_summary").insert(
        {
            "project_id": project_id,
            "summary": summary,
            "source_message_ids": source_message_ids,
            "last_message_created_at": last_message_created_at,
        }
    ).execute()


async def get_llm_usage(
    supabase: AsyncClient,
    *,
    project_id: str,
    date: str,
) -> dict[str, Any] | None:
    rows = (
        await supabase.table("project_llm_usage")
        .select("*")
        .eq("project_id", project_id)
        .eq("date", date)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


async def increment_llm_usage(
    supabase: AsyncClient,
    *,
    project_id: str,
    date: str,
) -> dict[str, Any]:
    existing = await get_llm_usage(supabase, project_id=project_id, date=date)
    if existing:
        updated = (
            await supabase.table("project_llm_usage")
            .update({"call_count": existing["call_count"] + 1})
            .eq("id", existing["id"])
            .execute()
        ).data[0]
        return updated
    created = (
        await supabase.table("project_llm_usage")
        .insert({"project_id": project_id, "date": date, "call_count": 1})
        .execute()
    ).data[0]
    return created
