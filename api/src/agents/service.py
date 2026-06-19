from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient

from src.agents.queue import QueueProducer
from src.config import get_settings
from src.exceptions import NotFound

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


async def get_latest_run_artifacts(supabase: AsyncClient, project_id: str) -> list[dict[str, Any]]:
    runs = (
        await supabase.table("agent_run")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    ).data
    if not runs:
        return []
    latest_run = runs[-1]

    artifacts = (
        await supabase.table("agent_artifact")
        .select("*")
        .eq("project_id", project_id)
        .eq("run_id", latest_run["id"])
        .order("created_at", desc=True)
        .execute()
    ).data
    return artifacts


async def _get_pending_proposal(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
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


def _derive_change_title(change: dict[str, Any]) -> str:
    content = change.get("content")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, str) and first.strip():
            return first
        if isinstance(first, dict):
            for key in ("title", "name", "description", "detail", "value", "role"):
                derived = first.get(key)
                if isinstance(derived, str) and derived.strip():
                    return derived
    return str(change.get("title") or f'{change.get("action", "update")} {change.get("section", "change")}')


def _normalize_change(change: dict[str, Any], index: int) -> dict[str, Any]:
    normalized = dict(change)
    normalized["id"] = str(normalized.get("id") or f"planner-change-{index}")
    normalized.setdefault("title", _derive_change_title(normalized))
    normalized.setdefault("detail", normalized.get("justification") or "")
    return normalized


def _build_pending_proposal_activity_items(pending: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not pending:
        return []

    created_at = pending["created_at"]
    items: list[dict[str, Any]] = []
    for index, change in enumerate(list(pending.get("changes") or [])):
        normalized_change = _normalize_change(change, index)
        items.append(
            {
                "id": f'pending-proposal-change:{pending["id"]}:{normalized_change["id"]}',
                "artifact_id": pending["id"],
                "agent": "planner",
                "kind": "proposal_change",
                "title": normalized_change["title"],
                "detail": normalized_change.get("detail") or "",
                "actionable": False,
                "proposal_change": normalized_change,
                "created_at": created_at,
            }
        )
    return items


async def append_plan_proposal_changes(
    supabase: AsyncClient,
    *,
    project_id: str,
    changes: list[dict[str, Any]],
) -> dict[str, Any]:
    pending = await _get_pending_proposal(supabase, project_id)
    normalized_changes = [_normalize_change(change, index) for index, change in enumerate(changes)]
    if pending:
        existing_changes = [
            _normalize_change(change, index) for index, change in enumerate(list(pending.get("changes") or []))
        ]
        existing_ids = {change["id"] for change in existing_changes}
        merged = existing_changes + [change for change in normalized_changes if change["id"] not in existing_ids]
        updated = (
            await supabase.table("plan_proposal")
            .update({"changes": merged})
            .eq("id", pending["id"])
            .execute()
        ).data[0]
        return updated

    created = (
        await supabase.table("plan_proposal")
        .insert({"project_id": project_id, "status": "pending", "changes": normalized_changes})
        .execute()
    ).data[0]
    return created


async def get_agent_activity(supabase: AsyncClient, project_id: str) -> list[dict[str, Any]]:
    artifacts = await get_latest_run_artifacts(supabase, project_id)
    pending = await _get_pending_proposal(supabase, project_id)
    pending_change_ids = {
        str(change.get("id"))
        for change in list((pending or {}).get("changes") or [])
        if change.get("id") is not None
    }

    items = _build_pending_proposal_activity_items(pending)
    for artifact in artifacts:
        payload = artifact.get("payload") or {}
        created_at = artifact["created_at"]
        if artifact["agent"] == "planner":
            for index, change in enumerate(list(payload.get("changes") or [])):
                normalized_change = _normalize_change(change, index)
                if normalized_change["id"] in pending_change_ids:
                    continue
                items.append(
                    {
                        "id": f'planner-change:{artifact["id"]}:{normalized_change["id"]}',
                        "artifact_id": artifact["id"],
                        "agent": "planner",
                        "kind": "proposal_change",
                        "title": normalized_change["title"],
                        "detail": normalized_change.get("detail") or "",
                        "actionable": True,
                        "proposal_change": normalized_change,
                        "created_at": created_at,
                    }
                )
            if payload.get("summary"):
                items.append(
                    {
                        "id": f'planner-summary:{artifact["id"]}',
                        "artifact_id": artifact["id"],
                        "agent": "planner",
                        "kind": "insight",
                        "title": "Planner summary",
                        "detail": str(payload["summary"]),
                        "actionable": False,
                        "proposal_change": None,
                        "created_at": created_at,
                    }
                )
        elif artifact["agent"] == "analyzer":
            for gap in list(payload.get("gaps") or []):
                items.append(
                    {
                        "id": f'gap:{artifact["id"]}:{gap.get("title", len(items))}',
                        "artifact_id": artifact["id"],
                        "agent": "analyzer",
                        "kind": "gap",
                        "title": str(gap.get("title") or "Gap"),
                        "detail": str(gap.get("detail") or ""),
                        "actionable": False,
                        "proposal_change": None,
                        "created_at": created_at,
                    }
                )
            for risk in list(payload.get("risks") or []):
                items.append(
                    {
                        "id": f'risk:{artifact["id"]}:{risk.get("title", len(items))}',
                        "artifact_id": artifact["id"],
                        "agent": "analyzer",
                        "kind": "risk",
                        "title": str(risk.get("title") or "Risk"),
                        "detail": str(risk.get("detail") or ""),
                        "actionable": False,
                        "proposal_change": None,
                        "created_at": created_at,
                    }
                )
            for index, suggestion in enumerate(list(payload.get("panel_suggestions") or [])):
                items.append(
                    {
                        "id": f'panel:{artifact["id"]}:{index}',
                        "artifact_id": artifact["id"],
                        "agent": "analyzer",
                        "kind": "insight",
                        "title": "Analyzer insight",
                        "detail": str(suggestion),
                        "actionable": False,
                        "proposal_change": None,
                        "created_at": created_at,
                    }
                )
        elif artifact["agent"] == "monitor" and payload.get("summary_candidate"):
            items.append(
                {
                    "id": f'monitor-summary:{artifact["id"]}',
                    "artifact_id": artifact["id"],
                    "agent": "monitor",
                    "kind": "insight",
                    "title": "Monitor summary",
                    "detail": str(payload["summary_candidate"]),
                    "actionable": False,
                    "proposal_change": None,
                    "created_at": created_at,
                }
            )

    items.sort(key=lambda item: (str(item["created_at"]), str(item["id"])))
    return items


async def promote_activity_item(
    supabase: AsyncClient,
    *,
    project_id: str,
    item_id: str,
) -> dict[str, Any]:
    activity_items = await get_agent_activity(supabase, project_id)
    item = next((candidate for candidate in activity_items if candidate["id"] == item_id), None)
    if not item or not item.get("actionable") or not item.get("proposal_change"):
        raise NotFound("The requested activity item was not found.")
    proposal = await append_plan_proposal_changes(
        supabase,
        project_id=project_id,
        changes=[item["proposal_change"]],
    )
    change_id = str(item["proposal_change"]["id"])
    return {"proposal_id": proposal["id"], "change_ids": [change_id]}


async def promote_all_actionable_activity(
    supabase: AsyncClient,
    *,
    project_id: str,
) -> dict[str, Any]:
    activity_items = await get_agent_activity(supabase, project_id)
    changes = [item["proposal_change"] for item in activity_items if item.get("actionable") and item.get("proposal_change")]
    if not changes:
        raise NotFound("There are no actionable activity items to send for review.")
    proposal = await append_plan_proposal_changes(supabase, project_id=project_id, changes=changes)
    return {
        "proposal_id": proposal["id"],
        "change_ids": [str(change["id"]) for change in changes],
    }
