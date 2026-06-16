from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient

from src.agents.service import get_agent_statuses, set_agent_status
from src.plans.exceptions import (
    PlanProposalAlreadyResolved,
    PlanProposalNotFound,
    PlanRevertUnavailable,
)

MAX_REVERTS = 3


def _merge_change(content: dict[str, Any], change: dict[str, Any]) -> dict[str, Any]:
    section = change.get("section", "items")
    action = change.get("action", "update")
    value = deepcopy(change.get("content"))
    current = deepcopy(content)
    existing = current.get(section)

    if action in {"add", "update"}:
        if isinstance(existing, dict) and isinstance(value, dict):
            current[section] = {**existing, **value}
        elif isinstance(existing, list) and isinstance(value, list):
            current[section] = [*existing, *value] if action == "add" else value
        else:
            current[section] = value
        return current

    if action == "remove":
        if isinstance(existing, dict) and isinstance(value, dict):
            current[section] = {key: item for key, item in existing.items() if key not in value}
        elif isinstance(existing, list) and isinstance(value, list):
            current[section] = [item for item in existing if item not in value]
        else:
            current.pop(section, None)
        return current

    return current


async def get_current_plan(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
    rows = (
        await supabase.table("project_plan")
        .select("*")
        .eq("project_id", project_id)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


async def get_pending_proposal(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
    rows = (
        await supabase.table("plan_proposal")
        .select("*")
        .eq("project_id", project_id)
        .eq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


async def get_latest_proposal(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
    rows = (
        await supabase.table("plan_proposal")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


async def approve_proposal(
    supabase: AsyncClient,
    *,
    project_id: str,
    approved_change_indexes: list[int] | None,
) -> dict[str, Any]:
    proposal = await get_pending_proposal(supabase, project_id)
    if not proposal:
        latest = await get_latest_proposal(supabase, project_id)
        if latest:
            raise PlanProposalAlreadyResolved()
        raise PlanProposalNotFound()

    await get_agent_statuses(supabase, project_id)
    await set_agent_status(supabase, project_id=project_id, agent="updater", status="running")

    try:
        approved_indexes = set(approved_change_indexes or range(len(proposal["changes"])))
        approved_changes = [
            {**change, "approved": index in approved_indexes}
            for index, change in enumerate(proposal["changes"])
            if index in approved_indexes
        ]

        current_plan = await get_current_plan(supabase, project_id)
        current_content = deepcopy(current_plan["content"]) if current_plan else {}
        next_content = current_content
        for change in approved_changes:
            next_content = _merge_change(next_content, change)

        if current_plan:
            await supabase.table("plan_version").insert(
                {"project_id": project_id, "content": current_content}
            ).execute()
            updated = (
                await supabase.table("project_plan")
                .update(
                    {
                        "content": next_content,
                        "version": current_plan["version"] + 1,
                        "finalized_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                .eq("id", current_plan["id"])
                .execute()
            ).data[0]
        else:
            updated = (
                await supabase.table("project_plan")
                .insert(
                    {
                        "project_id": project_id,
                        "content": next_content,
                        "version": 1,
                        "finalized_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
                .execute()
            ).data[0]

        await supabase.table("plan_proposal").update(
            {"status": "applied", "changes": approved_changes}
        ).eq("id", proposal["id"]).execute()

        versions = (
            await supabase.table("plan_version")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        ).data
        for stale_version in versions[MAX_REVERTS:]:
            await supabase.table("plan_version").delete().eq("id", stale_version["id"]).execute()

        await set_agent_status(supabase, project_id=project_id, agent="updater", status="completed")
        return updated
    except Exception:
        await set_agent_status(supabase, project_id=project_id, agent="updater", status="failed")
        raise


async def reject_proposal(supabase: AsyncClient, project_id: str) -> dict[str, Any]:
    proposal = await get_pending_proposal(supabase, project_id)
    if not proposal:
        raise PlanProposalNotFound()
    updated = (
        await supabase.table("plan_proposal")
        .update({"status": "rejected"})
        .eq("id", proposal["id"])
        .execute()
    ).data[0]
    return updated


async def revert_plan(supabase: AsyncClient, project_id: str) -> dict[str, Any]:
    current_plan = await get_current_plan(supabase, project_id)
    versions = (
        await supabase.table("plan_version")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(MAX_REVERTS)
        .execute()
    ).data
    if not current_plan or not versions:
        raise PlanRevertUnavailable()

    prior = versions[0]
    await supabase.table("plan_version").delete().eq("id", prior["id"]).execute()
    updated = (
        await supabase.table("project_plan")
        .update(
            {
                "content": prior["content"],
                "version": max(1, current_plan["version"] + 1),
                "finalized_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .eq("id", current_plan["id"])
        .execute()
    ).data[0]
    return updated
