from __future__ import annotations

from typing import Any
from uuid import UUID

from supabase import AsyncClient

from src.projects.exceptions import ProjectAccessDenied, ProjectNotFound

AGENT_NAMES = ("monitor", "analyzer", "planner", "updater")


def _project_with_membership(
    project_row: dict[str, Any],
    member_row: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": project_row["id"],
        "name": project_row["name"],
        "description": project_row["description"],
        "created_at": project_row["created_at"],
        "membership": {
            "role": member_row["role"],
            "can_approve": member_row["can_approve"],
            "can_edit": member_row["can_edit"],
        },
    }


async def create_project(
    supabase: AsyncClient,
    *,
    session_id: str,
    name: str,
    description: str,
) -> dict[str, Any]:
    project_result = (
        await supabase.table("project")
        .insert({"name": name.strip(), "description": description.strip()})
        .execute()
    )
    project = project_result.data[0]
    member_payload = {
        "project_id": project["id"],
        "session_id": session_id,
        "role": "creator",
        "can_approve": True,
        "can_edit": True,
    }
    member_result = await supabase.table("project_member").insert(member_payload).execute()
    for agent_name in AGENT_NAMES:
        await supabase.table("agent_status").insert(
            {"project_id": project["id"], "agent": agent_name, "status": "idle"}
        ).execute()

    return _project_with_membership(project, member_result.data[0])


async def list_projects_for_session(supabase: AsyncClient, session_id: str) -> list[dict[str, Any]]:
    member_rows = (
        await supabase.table("project_member")
        .select("*")
        .eq("session_id", session_id)
        .execute()
    ).data
    projects: list[dict[str, Any]] = []
    for member in member_rows:
        project_rows = (
            await supabase.table("project")
            .select("*")
            .eq("id", member["project_id"])
            .limit(1)
            .execute()
        ).data
        if project_rows:
            projects.append(_project_with_membership(project_rows[0], member))
    projects.sort(key=lambda item: item["created_at"], reverse=True)
    return projects


async def get_project_member(
    supabase: AsyncClient,
    *,
    project_id: UUID,
    session_id: str,
) -> dict[str, Any]:
    rows = (
        await supabase.table("project_member")
        .select("*")
        .eq("project_id", str(project_id))
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        project_exists = (
            await supabase.table("project")
            .select("id")
            .eq("id", str(project_id))
            .limit(1)
            .execute()
        ).data
        if not project_exists:
            raise ProjectNotFound()
        raise ProjectAccessDenied()
    return rows[0]


async def get_project_for_session(
    supabase: AsyncClient,
    *,
    project_id: UUID,
    session_id: str,
) -> dict[str, Any]:
    member = await get_project_member(supabase, project_id=project_id, session_id=session_id)
    project_rows = (
        await supabase.table("project").select("*").eq("id", str(project_id)).limit(1).execute()
    ).data
    if not project_rows:
        raise ProjectNotFound()
    return _project_with_membership(project_rows[0], member)
