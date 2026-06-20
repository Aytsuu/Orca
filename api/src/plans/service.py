from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import uuid4

from supabase import AsyncClient

from src.agents.service import get_agent_statuses, set_agent_status
from src.exceptions import BadRequest
from src.plans.exceptions import (
    PhaseDeleteRequiresForce,
    PlanAttachmentNotFound,
    PlanChangeNotFound,
    PlanGapNotFound,
    PlanPhaseNotFound,
    PlanProposalAlreadyResolved,
    PlanProposalNotFound,
    PlanRevertUnavailable,
    PlanRiskNotFound,
    PlanTaskNotFound,
)

MAX_REVERTS = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _empty_plan_content() -> dict[str, Any]:
    return {
        "title": "",
        "description": "",
        "objectives": [],
        "stakeholders": [],
        "technology_stack": [],
        "phases": [],
        "global_risks": [],
    }


def _normalize_attachment(attachment: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(attachment)
    normalized.setdefault("id", str(uuid4()))
    normalized.setdefault("filename", "")
    normalized.setdefault("mime_type", "application/octet-stream")
    normalized.setdefault("storage_path", "")
    normalized.setdefault("size_bytes", 0)
    normalized.setdefault("uploaded_by_session_id", "")
    normalized.setdefault("uploaded_at", _now_iso())
    return normalized


def _normalize_task(task: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(task)
    normalized.setdefault("id", str(uuid4()))
    normalized.setdefault("title", "")
    normalized.setdefault("owner", None)
    normalized.setdefault("due", None)
    normalized.setdefault("priority", "medium")
    normalized.setdefault("description", None)
    normalized["acceptance_criteria"] = list(normalized.get("acceptance_criteria") or [])
    normalized["attachments"] = [
        _normalize_attachment(attachment)
        for attachment in list(normalized.get("attachments") or [])
    ]
    normalized["source_message_ids"] = list(normalized.get("source_message_ids") or [])
    normalized.setdefault("source_excerpt", None)
    normalized.setdefault("confidence", None)
    normalized.setdefault("status", None)
    return normalized


def _normalize_gap(gap: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(gap)
    normalized.setdefault("id", str(uuid4()))
    normalized.setdefault("description", "")
    normalized.setdefault("severity", "minor")
    normalized["source_message_ids"] = list(normalized.get("source_message_ids") or [])
    normalized.setdefault("source_excerpt", None)
    return normalized


def _normalize_phase(phase: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(phase)
    normalized.setdefault("id", str(uuid4()))
    normalized.setdefault("title", "")
    normalized.setdefault("goal", None)
    normalized.setdefault("description", None)
    normalized.setdefault("timeframe", None)
    normalized["assigned_members"] = [
        _normalize_phase_assigned_member(member)
        for member in list(
            normalized.get("assigned_members") or normalized.get("assignedMembers") or []
        )
    ]
    normalized["tasks"] = [_normalize_task(task) for task in list(normalized.get("tasks") or [])]
    normalized["gaps"] = [_normalize_gap(gap) for gap in list(normalized.get("gaps") or [])]
    return normalized


def _normalize_risk(risk: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(risk)
    normalized.setdefault("id", str(uuid4()))
    normalized.setdefault("description", "")
    normalized.setdefault("severity", "minor")
    normalized.setdefault("mitigation", None)
    normalized["source_message_ids"] = list(normalized.get("source_message_ids") or [])
    normalized.setdefault("source_excerpt", None)
    return normalized


def _normalize_technology_stack_item(item: Any) -> dict[str, str]:
    if isinstance(item, dict):
        title = item.get("title")
        value = item.get("value")
        return {
            "title": str(title).strip() if title is not None else "",
            "value": str(value).strip() if value is not None else "",
        }
    if isinstance(item, str):
        return {"title": item.strip(), "value": ""}
    return {"title": str(item).strip(), "value": ""}


def _normalize_stakeholder(item: Any) -> dict[str, str]:
    if isinstance(item, dict):
        name = str(item.get("name") or item.get("title") or item.get("role") or "Unknown").strip()
        role = str(item.get("role") or item.get("title") or name).strip() or name
        user_id = str(
            item.get("user_id")
            or item.get("userId")
            or item.get("session_id")
            or name.lower().replace(" ", "_")
        ).strip()
        initials = str(item.get("initials") or _to_initials(name)).strip() or _to_initials(name)
        return {
            "user_id": user_id,
            "name": name,
            "role": role,
            "initials": initials[:10],
        }

    name = str(item or "Unknown").strip() or "Unknown"
    return {
        "user_id": name.lower().replace(" ", "_"),
        "name": name,
        "role": name,
        "initials": _to_initials(name),
    }


def _coerce_objective(value: Any) -> str:
    if isinstance(value, str):
        recovered = _extract_objective_from_stringified_mapping(value)
        if recovered is not None:
            return recovered
        return value
    if isinstance(value, dict):
        for key in ("goal", "title", "description", "detail", "name", "value"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate
    return str(value)


def _coerce_objective_list(value: Any) -> list[str]:
    if isinstance(value, list):
        objectives: list[str] = []
        for item in value:
            objective = _coerce_objective(item).strip()
            if objective:
                objectives.append(objective)
        return objectives
    if value is None:
        return []

    objective = _coerce_objective(value).strip()
    return [objective] if objective.strip() else []


def _extract_objective_from_stringified_mapping(value: str) -> str | None:
    stripped = value.strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return None

    for key in ("goal", "title", "description", "detail", "name", "value"):
        pattern = rf"['\"]{re.escape(key)}['\"]\s*:\s*(['\"])(.*?)\1"
        match = re.search(pattern, stripped)
        if match:
            candidate = match.group(2).strip()
            if candidate:
                return candidate

    return None


def _to_initials(value: str) -> str:
    words = [part for part in value.replace("_", " ").split() if part]
    if not words:
        return "NA"
    initials = "".join(part[0].upper() for part in words[:2])
    return initials[:10] or "NA"


def _normalize_phase_assigned_member(member: Any) -> dict[str, str]:
    if isinstance(member, dict):
        name = str(
            member.get("name")
            or member.get("title")
            or member.get("session_id")
            or member.get("sessionId")
            or "Unknown member"
        ).strip()
        session_id = str(
            member.get("session_id")
            or member.get("sessionId")
            or member.get("id")
            or name.lower().replace(" ", "_")
        ).strip()
        role = str(member.get("role") or "VIEWER").strip().upper() or "VIEWER"
        if role != "APPROVER":
            role = "VIEWER"
        initials = str(member.get("initials") or _to_initials(name)).strip() or _to_initials(name)
        return {
            "session_id": session_id,
            "name": name,
            "role": role,
            "initials": initials[:10],
        }

    name = str(member or "Unknown member").strip() or "Unknown member"
    return {
        "session_id": name.lower().replace(" ", "_"),
        "name": name,
        "role": "VIEWER",
        "initials": _to_initials(name),
    }


def _normalize_proposal_change(change: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(change)
    section = str(normalized.get("section") or "")
    target_id = normalized.get("targetId") or normalized.get("target_id")
    parts = section.split(".")

    if len(parts) >= 3 and parts[0] == "phases":
        phase_id = parts[1]
        nested_section = parts[2]
        if nested_section in {"tasks", "gaps"}:
            normalized["section"] = nested_section
            if target_id is None:
                if normalized.get("action") == "add":
                    target_id = phase_id
                elif len(parts) >= 4:
                    target_id = parts[3]

    if target_id is not None:
        normalized["targetId"] = target_id

    return normalized


def _sanitize_proposal_row(proposal: dict[str, Any]) -> dict[str, Any]:
    sanitized = deepcopy(proposal)
    sanitized["changes"] = [
        _normalize_proposal_change(change) for change in list(sanitized.get("changes") or [])
    ]
    return sanitized


def normalize_plan_content(content: dict[str, Any] | None) -> dict[str, Any]:
    raw = deepcopy(content or {})
    normalized = _empty_plan_content()
    normalized["title"] = str(raw.get("title") or "")
    normalized["description"] = str(raw.get("description") or "")
    normalized["objectives"] = [
        _coerce_objective(objective) for objective in list(raw.get("objectives") or [])
    ]
    normalized["stakeholders"] = [
        _normalize_stakeholder(item) for item in list(raw.get("stakeholders") or [])
    ]
    normalized["technology_stack"] = [
        _normalize_technology_stack_item(item) for item in list(raw.get("technology_stack") or [])
    ]
    normalized["phases"] = [_normalize_phase(phase) for phase in list(raw.get("phases") or [])]
    normalized["global_risks"] = [
        _normalize_risk(risk) for risk in list(raw.get("global_risks") or raw.get("risks") or [])
    ]

    # Preserve legacy top-level sections for backward compatibility.
    for key, value in raw.items():
        if key not in normalized:
            normalized[key] = deepcopy(value)

    return normalized


def serialize_plan_row(plan_row: dict[str, Any]) -> dict[str, Any]:
    content = normalize_plan_content(plan_row.get("content"))
    return {
        **plan_row,
        "content": content,
        "title": content["title"],
        "description": content["description"],
        "objectives": content["objectives"],
        "stakeholders": content["stakeholders"],
        "technology_stack": content["technology_stack"],
        "phases": content["phases"],
        "global_risks": content["global_risks"],
    }


def _find_phase(content: dict[str, Any], phase_id: str) -> dict[str, Any]:
    normalized_target = _normalize_phase_reference(phase_id)
    for phase in content["phases"]:
        if (
            phase["id"] == phase_id
            or _normalize_phase_reference(phase.get("title", "")) == normalized_target
        ):
            return phase
    raise PlanPhaseNotFound()


def _normalize_phase_reference(value: str) -> str:
    return " ".join(str(value or "").strip().lower().replace("_", " ").split())


def _find_task(content: dict[str, Any], task_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    for phase in content["phases"]:
        for task in phase["tasks"]:
            if task["id"] == task_id:
                return phase, task
    raise PlanTaskNotFound()


def _find_gap(content: dict[str, Any], gap_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    for phase in content["phases"]:
        for gap in phase["gaps"]:
            if gap["id"] == gap_id:
                return phase, gap
    raise PlanGapNotFound()


def _find_risk(content: dict[str, Any], risk_id: str) -> dict[str, Any]:
    for risk in content["global_risks"]:
        if risk["id"] == risk_id:
            return risk
    raise PlanRiskNotFound()


def _find_attachment(
    content: dict[str, Any],
    task_id: str,
    attachment_id: str,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    phase, task = _find_task(content, task_id)
    for attachment in task["attachments"]:
        if attachment["id"] == attachment_id:
            return phase, task, attachment
    raise PlanAttachmentNotFound()


def _legacy_merge_change(content: dict[str, Any], change: dict[str, Any]) -> dict[str, Any]:
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


def _has_structured_shape(content: dict[str, Any] | None) -> bool:
    if not isinstance(content, dict):
        return False
    return any(
        key in content
        for key in (
            "phases",
            "global_risks",
            "title",
            "description",
            "objectives",
            "stakeholders",
            "technology_stack",
        )
    )


def _target_exists(content: dict[str, Any], change: dict[str, Any]) -> bool:
    normalized_change = _normalize_proposal_change(change)
    section = normalized_change.get("section")
    action = normalized_change.get("action")
    target_id = normalized_change.get("targetId") or normalized_change.get("target_id")

    if not target_id:
        return True

    if section == "tasks":
        if action == "add":
            try:
                _find_phase(content, target_id)
                return True
            except PlanPhaseNotFound:
                return False
        try:
            _find_task(content, target_id)
            return True
        except PlanTaskNotFound:
            return False

    if section == "phases":
        if action == "add":
            return True
        try:
            _find_phase(content, target_id)
            return True
        except PlanPhaseNotFound:
            return False

    if section == "gaps":
        if action == "add":
            try:
                _find_phase(content, target_id)
                return True
            except PlanPhaseNotFound:
                return False
        try:
            _find_gap(content, target_id)
            return True
        except PlanGapNotFound:
            return False

    if section == "risks":
        if action == "add":
            return True
        try:
            _find_risk(content, target_id)
            return True
        except PlanRiskNotFound:
            return False

    return True


def _apply_structured_change(content: dict[str, Any], change: dict[str, Any]) -> dict[str, Any]:
    current = normalize_plan_content(content)
    normalized_change = _normalize_proposal_change(change)
    section = normalized_change.get("section")
    action = normalized_change.get("action")
    target_id = normalized_change.get("targetId") or normalized_change.get("target_id")
    value = deepcopy(normalized_change.get("content"))

    if section == "objectives":
        objectives = _coerce_objective_list(value)
        if action == "remove":
            current["objectives"] = [
                existing for existing in current["objectives"] if existing not in set(objectives)
            ]
            return current
        current["objectives"] = (
            [*current["objectives"], *objectives] if action == "add" else objectives
        )
        return current

    if section == "stakeholders":
        items = value if isinstance(value, list) else [value]
        normalized_items = [_normalize_stakeholder(item) for item in items]
        if action == "add":
            current["stakeholders"].extend(normalized_items)
            return current
        if action == "update":
            current["stakeholders"] = normalized_items
            return current
        if action == "remove":
            stakeholder_ids = {item["user_id"] for item in normalized_items if item.get("user_id")}
            current["stakeholders"] = [
                existing
                for existing in current["stakeholders"]
                if existing.get("user_id") not in stakeholder_ids
            ]
            return current

    if section == "tasks":
        if action == "add":
            phase = _find_phase(current, target_id)
            tasks = value if isinstance(value, list) else [value]
            phase["tasks"].extend(_normalize_task(task) for task in tasks)
            return current
        phase, task = _find_task(current, target_id)
        if action == "update" and isinstance(value, dict):
            updated_task = _normalize_task({**task, **value, "id": task["id"]})
            phase["tasks"] = [
                updated_task if existing["id"] == task["id"] else existing
                for existing in phase["tasks"]
            ]
            return current
        if action == "remove":
            phase["tasks"] = [
                existing for existing in phase["tasks"] if existing["id"] != task["id"]
            ]
            return current

    if section == "phases":
        if action == "add":
            phases = value if isinstance(value, list) else [value]
            current["phases"].extend(_normalize_phase(phase) for phase in phases)
            return current
        phase = _find_phase(current, target_id)
        if action == "update" and isinstance(value, dict):
            updated_phase = _normalize_phase({**phase, **value, "id": phase["id"]})
            current["phases"] = [
                updated_phase if existing["id"] == phase["id"] else existing
                for existing in current["phases"]
            ]
            return current
        if action == "remove":
            current["phases"] = [
                existing for existing in current["phases"] if existing["id"] != phase["id"]
            ]
            return current

    if section == "gaps":
        if action == "add":
            phase = _find_phase(current, target_id)
            gaps = value if isinstance(value, list) else [value]
            phase["gaps"].extend(_normalize_gap(gap) for gap in gaps)
            return current
        phase, gap = _find_gap(current, target_id)
        if action == "update" and isinstance(value, dict):
            updated_gap = _normalize_gap({**gap, **value, "id": gap["id"]})
            phase["gaps"] = [
                updated_gap if existing["id"] == gap["id"] else existing
                for existing in phase["gaps"]
            ]
            return current
        if action == "remove":
            phase["gaps"] = [existing for existing in phase["gaps"] if existing["id"] != gap["id"]]
            return current

    if section == "risks":
        if action == "add":
            risks = value if isinstance(value, list) else [value]
            current["global_risks"].extend(_normalize_risk(risk) for risk in risks)
            return current
        risk = _find_risk(current, target_id)
        if action == "update" and isinstance(value, dict):
            updated_risk = _normalize_risk({**risk, **value, "id": risk["id"]})
            current["global_risks"] = [
                updated_risk if existing["id"] == risk["id"] else existing
                for existing in current["global_risks"]
            ]
            return current
        if action == "remove":
            current["global_risks"] = [
                existing for existing in current["global_risks"] if existing["id"] != risk["id"]
            ]
            return current

    if section == "technology_stack":
        items = value if isinstance(value, list) else [value]
        normalized_items = [_normalize_technology_stack_item(item) for item in items]
        if action == "add":
            current["technology_stack"].extend(normalized_items)
            return current
        if action == "update":
            current["technology_stack"] = normalized_items
            return current
        if action == "remove":
            titles_to_remove = {item["title"] for item in normalized_items if item.get("title")}
            current["technology_stack"] = [
                existing
                for existing in current["technology_stack"]
                if existing.get("title") not in titles_to_remove
            ]
            return current

    return _legacy_merge_change(current, normalized_change)


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
    return _sanitize_proposal_row(rows[0]) if rows else None


async def get_latest_proposal(supabase: AsyncClient, project_id: str) -> dict[str, Any] | None:
    rows = (
        await supabase.table("plan_proposal")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    return _sanitize_proposal_row(rows[0]) if rows else None


async def list_plan_versions(supabase: AsyncClient, project_id: str) -> list[dict[str, Any]]:
    current_plan = await get_current_plan(supabase, project_id)
    rows = (
        await supabase.table("plan_version")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(MAX_REVERTS)
        .execute()
    ).data

    versions: list[dict[str, Any]] = []
    if current_plan:
        versions.append(
            {
                "id": current_plan["id"],
                "version": current_plan["version"],
                "created_at": current_plan.get("finalized_at")
                or current_plan.get("created_at")
                or _now_iso(),
                "status": "current",
            }
        )
    for row in rows:
        versions.append(
            {
                "id": row["id"],
                "version": row.get("version", 1),
                "created_at": row["created_at"],
                "status": "archived",
            }
        )
    return versions


async def _trim_versions(supabase: AsyncClient, project_id: str) -> None:
    versions = (
        await supabase.table("plan_version")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    for stale_version in versions[MAX_REVERTS:]:
        await supabase.table("plan_version").delete().eq("id", stale_version["id"]).execute()


async def _persist_plan_update(
    supabase: AsyncClient,
    *,
    project_id: str,
    current_plan: dict[str, Any] | None,
    next_content: dict[str, Any],
) -> dict[str, Any]:
    if current_plan:
        await (
            supabase.table("plan_version")
            .insert(
                {
                    "project_id": project_id,
                    "content": normalize_plan_content(current_plan["content"]),
                    "version": current_plan["version"],
                }
            )
            .execute()
        )
        updated = (
            await supabase.table("project_plan")
            .update(
                {
                    "content": normalize_plan_content(next_content),
                    "version": current_plan["version"] + 1,
                    "finalized_at": _now_iso(),
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
                    "content": normalize_plan_content(next_content),
                    "version": 1,
                    "finalized_at": _now_iso(),
                }
            )
            .execute()
        ).data[0]

    await _trim_versions(supabase, project_id)
    return updated


async def _mutate_plan(
    supabase: AsyncClient,
    *,
    project_id: str,
    mutate: Callable[[dict[str, Any]], Any],
) -> dict[str, Any]:
    current_plan = await get_current_plan(supabase, project_id)
    content = normalize_plan_content(current_plan["content"] if current_plan else None)
    mutate(content)
    updated = await _persist_plan_update(
        supabase,
        project_id=project_id,
        current_plan=current_plan,
        next_content=content,
    )
    return serialize_plan_row(updated)


async def _proposal_conflicts(
    supabase: AsyncClient,
    *,
    project_id: str,
    target_ids: list[str],
) -> list[str]:
    proposal = await get_pending_proposal(supabase, project_id)
    if not proposal:
        return []
    conflicts: list[str] = []
    for change in proposal.get("changes", []):
        normalized_change = _normalize_proposal_change(change)
        target_id = normalized_change.get("targetId") or normalized_change.get("target_id")
        if target_id and target_id in target_ids:
            conflicts.append(change["id"])
    return conflicts


def _resolve_selected_changes(
    proposal: dict[str, Any],
    *,
    approved_change_indexes: list[int] | None,
    change_ids: list[str] | None,
) -> list[dict[str, Any]]:
    changes = [
        _normalize_proposal_change({**change, "id": change.get("id", f"legacy-change-{index}")})
        for index, change in enumerate(list(proposal["changes"]))
    ]
    proposal["changes"] = changes
    if change_ids:
        selected = [change for change in changes if change["id"] in set(change_ids)]
    elif approved_change_indexes is not None:
        approved_indexes = set(approved_change_indexes)
        selected = [change for index, change in enumerate(changes) if index in approved_indexes]
    else:
        selected = changes
    if change_ids and len(selected) != len(set(change_ids)):
        raise PlanChangeNotFound()
    return selected


def _apply_change_overrides(
    selected_changes: list[dict[str, Any]],
    *,
    change_overrides: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    if not change_overrides:
        return selected_changes
    return [
        {**change, "content": deepcopy(change_overrides[change["id"]])}
        if change["id"] in change_overrides
        else change
        for change in selected_changes
    ]


async def approve_proposal(
    supabase: AsyncClient,
    *,
    project_id: str,
    approved_change_indexes: list[int] | None = None,
    change_ids: list[str] | None = None,
    change_overrides: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    proposal = await get_pending_proposal(supabase, project_id)
    if not proposal:
        latest = await get_latest_proposal(supabase, project_id)
        if latest:
            raise PlanProposalAlreadyResolved()
        raise PlanProposalNotFound()

    selected_changes = _resolve_selected_changes(
        proposal,
        approved_change_indexes=approved_change_indexes,
        change_ids=change_ids,
    )
    selected_changes = _apply_change_overrides(
        selected_changes,
        change_overrides={
            str(item["change_id"]): item["content"]
            for item in list(change_overrides or [])
            if item.get("change_id")
        },
    )
    await get_agent_statuses(supabase, project_id)
    await set_agent_status(supabase, project_id=project_id, agent="updater", status="running")

    try:
        current_plan = await get_current_plan(supabase, project_id)
        raw_content = current_plan["content"] if current_plan else None
        is_structured = _has_structured_shape(raw_content)
        next_content = (
            normalize_plan_content(raw_content) if is_structured else deepcopy(raw_content or {})
        )
        applied_or_stale: list[dict[str, Any]] = []

        for change in selected_changes:
            if is_structured and not _target_exists(next_content, change):
                applied_or_stale.append({**deepcopy(change), "state": "stale"})
                continue
            next_content = (
                _apply_structured_change(next_content, change)
                if is_structured
                else _legacy_merge_change(next_content, change)
            )
            applied_or_stale.append({**deepcopy(change), "state": "applied"})

        updated = await _persist_plan_update(
            supabase,
            project_id=project_id,
            current_plan=current_plan,
            next_content=next_content,
        )

        selected_ids = {change["id"] for change in selected_changes}
        remaining_changes = [
            change for change in proposal["changes"] if change["id"] not in selected_ids
        ]
        next_status = "pending" if remaining_changes else "applied"
        next_changes = remaining_changes if remaining_changes else applied_or_stale

        await (
            supabase.table("plan_proposal")
            .update(
                {
                    "status": next_status,
                    "changes": next_changes,
                }
            )
            .eq("id", proposal["id"])
            .execute()
        )

        await set_agent_status(supabase, project_id=project_id, agent="updater", status="completed")
        return serialize_plan_row(updated)
    except Exception:
        await set_agent_status(supabase, project_id=project_id, agent="updater", status="failed")
        raise


async def accept_proposal_change(
    supabase: AsyncClient,
    *,
    project_id: str,
    change_id: str,
    content_override: Any | None = None,
) -> dict[str, Any]:
    change_overrides = None
    if content_override is not None:
        change_overrides = [{"change_id": change_id, "content": content_override}]
    return await approve_proposal(
        supabase,
        project_id=project_id,
        change_ids=[change_id],
        change_overrides=change_overrides,
    )


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


async def reject_proposal_change(
    supabase: AsyncClient,
    *,
    project_id: str,
    change_id: str,
) -> dict[str, Any]:
    proposal = await get_pending_proposal(supabase, project_id)
    if not proposal:
        raise PlanProposalNotFound()

    remaining = [change for change in proposal["changes"] if change["id"] != change_id]
    if len(remaining) == len(proposal["changes"]):
        raise PlanChangeNotFound()

    status = "pending" if remaining else "rejected"
    changes = (
        remaining
        if remaining
        else [
            {
                **deepcopy(
                    next(change for change in proposal["changes"] if change["id"] == change_id)
                ),
                "state": "rejected",
            }
        ]
    )
    updated = (
        await supabase.table("plan_proposal")
        .update({"status": status, "changes": changes})
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
                "content": normalize_plan_content(prior["content"]),
                "version": max(1, current_plan["version"] + 1),
                "finalized_at": _now_iso(),
            }
        )
        .eq("id", current_plan["id"])
        .execute()
    ).data[0]
    return serialize_plan_row(updated)


async def update_plan_meta(
    supabase: AsyncClient,
    *,
    project_id: str,
    title: str | None,
    description: str | None,
    objectives: list[str] | None,
) -> tuple[dict[str, Any], list[str]]:
    plan = await _mutate_plan(
        supabase,
        project_id=project_id,
        mutate=lambda content: content.update(
            {
                **({"title": title.strip()} if title is not None else {}),
                **({"description": description.strip()} if description is not None else {}),
                **({"objectives": list(objectives)} if objectives is not None else {}),
            }
        ),
    )
    return plan, []


async def create_phase(
    supabase: AsyncClient,
    *,
    project_id: str,
    title: str,
    goal: str | None,
    description: str | None,
    timeframe: str | None,
    assigned_members: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[str]]:
    created_phase: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal created_phase
        created_phase = _normalize_phase(
            {
                "id": str(uuid4()),
                "title": title.strip(),
                "goal": goal.strip() if goal else None,
                "description": description.strip() if description else None,
                "timeframe": timeframe.strip() if timeframe else None,
                "assigned_members": [
                    _normalize_phase_assigned_member(member) for member in assigned_members
                ],
                "tasks": [],
                "gaps": [],
            }
        )
        content["phases"].append(created_phase)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return created_phase, []


async def update_phase(
    supabase: AsyncClient,
    *,
    project_id: str,
    phase_id: str,
    title: str | None,
    goal: str | None,
    description: str | None,
    timeframe: str | None,
    assigned_members: list[dict[str, Any]] | None,
) -> tuple[dict[str, Any], list[str]]:
    updated_phase: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal updated_phase
        phase = _find_phase(content, phase_id)
        if title is not None:
            phase["title"] = title.strip()
        if goal is not None:
            phase["goal"] = goal.strip() or None
        if description is not None:
            phase["description"] = description.strip() or None
        if timeframe is not None:
            phase["timeframe"] = timeframe.strip() or None
        if assigned_members is not None:
            phase["assigned_members"] = [
                _normalize_phase_assigned_member(member) for member in assigned_members
            ]
        updated_phase = deepcopy(phase)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    conflicts = await _proposal_conflicts(supabase, project_id=project_id, target_ids=[phase_id])
    return updated_phase, conflicts


async def delete_phase(
    supabase: AsyncClient,
    *,
    project_id: str,
    phase_id: str,
    force: bool,
) -> dict[str, Any]:
    deleted_phase: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal deleted_phase
        phase = _find_phase(content, phase_id)
        task_count = len(phase["tasks"])
        if task_count and not force:
            raise PhaseDeleteRequiresForce(detail={"task_count": task_count})
        deleted_phase = deepcopy(phase)
        content["phases"] = [
            existing for existing in content["phases"] if existing["id"] != phase_id
        ]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return deleted_phase


async def create_task(
    supabase: AsyncClient,
    *,
    project_id: str,
    phase_id: str,
    title: str,
    owner: str | None,
    due: str | None,
    priority: str,
    description: str | None,
    acceptance_criteria: list[str],
) -> tuple[dict[str, Any], list[str]]:
    created_task: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal created_task
        phase = _find_phase(content, phase_id)
        created_task = _normalize_task(
            {
                "id": str(uuid4()),
                "title": title.strip(),
                "owner": owner.strip() if owner else None,
                "due": due.strip() if due else None,
                "priority": priority,
                "description": description.strip() if description else None,
                "acceptance_criteria": list(acceptance_criteria),
                "attachments": [],
            }
        )
        phase["tasks"].append(created_task)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    conflicts = await _proposal_conflicts(supabase, project_id=project_id, target_ids=[phase_id])
    return created_task, conflicts


async def update_task(
    supabase: AsyncClient,
    *,
    project_id: str,
    task_id: str,
    title: str | None,
    owner: str | None,
    due: str | None,
    priority: str | None,
    description: str | None,
    acceptance_criteria: list[str] | None,
) -> tuple[dict[str, Any], list[str]]:
    updated_task: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal updated_task
        _, task = _find_task(content, task_id)
        if title is not None:
            task["title"] = title.strip()
        if owner is not None:
            task["owner"] = owner.strip() or None
        if due is not None:
            task["due"] = due.strip() or None
        if priority is not None:
            task["priority"] = priority
        if description is not None:
            task["description"] = description.strip() or None
        if acceptance_criteria is not None:
            task["acceptance_criteria"] = list(acceptance_criteria)
        updated_task = deepcopy(task)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    conflicts = await _proposal_conflicts(supabase, project_id=project_id, target_ids=[task_id])
    return updated_task, conflicts


async def delete_task(
    supabase: AsyncClient,
    *,
    project_id: str,
    task_id: str,
) -> dict[str, Any]:
    deleted_task: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal deleted_task
        phase, task = _find_task(content, task_id)
        deleted_task = deepcopy(task)
        phase["tasks"] = [existing for existing in phase["tasks"] if existing["id"] != task_id]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return deleted_task


async def delete_gap(
    supabase: AsyncClient,
    *,
    project_id: str,
    gap_id: str,
) -> tuple[dict[str, Any], list[str]]:
    deleted_gap: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal deleted_gap
        phase, gap = _find_gap(content, gap_id)
        deleted_gap = deepcopy(gap)
        phase["gaps"] = [existing for existing in phase["gaps"] if existing["id"] != gap_id]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    conflicts = await _proposal_conflicts(supabase, project_id=project_id, target_ids=[gap_id])
    return deleted_gap, conflicts


async def create_risk(
    supabase: AsyncClient,
    *,
    project_id: str,
    description: str,
    severity: str,
    mitigation: str | None,
) -> tuple[dict[str, Any], list[str]]:
    created_risk: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal created_risk
        created_risk = _normalize_risk(
            {
                "id": str(uuid4()),
                "description": description.strip(),
                "severity": severity,
                "mitigation": mitigation.strip() if mitigation else None,
            }
        )
        content["global_risks"].append(created_risk)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return created_risk, []


async def update_risk(
    supabase: AsyncClient,
    *,
    project_id: str,
    risk_id: str,
    description: str | None,
    severity: str | None,
    mitigation: str | None,
) -> tuple[dict[str, Any], list[str]]:
    updated_risk: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal updated_risk
        risk = _find_risk(content, risk_id)
        if description is not None:
            risk["description"] = description.strip()
        if severity is not None:
            risk["severity"] = severity
        if mitigation is not None:
            risk["mitigation"] = mitigation.strip() or None
        updated_risk = deepcopy(risk)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    conflicts = await _proposal_conflicts(supabase, project_id=project_id, target_ids=[risk_id])
    return updated_risk, conflicts


async def delete_risk(
    supabase: AsyncClient,
    *,
    project_id: str,
    risk_id: str,
) -> dict[str, Any]:
    deleted_risk: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal deleted_risk
        risk = _find_risk(content, risk_id)
        deleted_risk = deepcopy(risk)
        content["global_risks"] = [
            existing for existing in content["global_risks"] if existing["id"] != risk_id
        ]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return deleted_risk


async def create_task_attachment(
    supabase: AsyncClient,
    *,
    project_id: str,
    task_id: str,
    uploaded_file_id: str,
) -> dict[str, Any]:
    uploaded_rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", uploaded_file_id)
        .limit(1)
        .execute()
    ).data
    if not uploaded_rows:
        raise BadRequest(message="Uploaded file does not belong to this project.")
    uploaded_file = uploaded_rows[0]
    created_attachment: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal created_attachment
        _, task = _find_task(content, task_id)
        created_attachment = _normalize_attachment(
            {
                "id": str(uuid4()),
                "uploaded_file_id": uploaded_file["id"],
                "filename": uploaded_file["filename"],
                "mime_type": uploaded_file["mime_type"],
                "storage_path": uploaded_file["storage_path"],
                "size_bytes": uploaded_file["size_bytes"],
                "uploaded_by_session_id": uploaded_file["session_id"],
                "uploaded_at": uploaded_file["created_at"],
            }
        )
        task["attachments"].append(created_attachment)

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return created_attachment


async def delete_task_attachment(
    supabase: AsyncClient,
    *,
    project_id: str,
    task_id: str,
    attachment_id: str,
) -> dict[str, Any]:
    deleted_attachment: dict[str, Any] = {}

    def _mutate(content: dict[str, Any]) -> None:
        nonlocal deleted_attachment
        _, task, attachment = _find_attachment(content, task_id, attachment_id)
        deleted_attachment = deepcopy(attachment)
        task["attachments"] = [
            existing for existing in task["attachments"] if existing["id"] != attachment_id
        ]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)
    return deleted_attachment
