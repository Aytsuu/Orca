from __future__ import annotations

from typing import Any
from uuid import UUID

from supabase import AsyncClient

from src.members.service import ensure_default_member_invitation
from src.projects.exceptions import ProjectAccessDenied, ProjectNotFound

AGENT_NAMES = ("monitor", "analyzer", "planner", "updater")


def _initial_project_plan_content(*, title: str, description: str) -> dict[str, Any]:
    return {
        "title": title,
        "description": description,
        "objectives": [],
        "stakeholders": [],
        "phases": [],
        "global_risks": [],
    }


def _project_with_membership(
    project_row: dict[str, Any],
    member_row: dict[str, Any],
    *,
    member_count: int,
) -> dict[str, Any]:
    return {
        "id": project_row["id"],
        "name": project_row["name"],
        "description": project_row["description"],
        "created_at": project_row["created_at"],
        "member_count": member_count,
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
    await (
        supabase.table("project_plan")
        .insert(
            {
                "project_id": project["id"],
                "content": _initial_project_plan_content(
                    title=name.strip(),
                    description=description.strip(),
                ),
                "version": 1,
                "finalized_at": None,
            }
        )
        .execute()
    )
    for agent_name in AGENT_NAMES:
        await (
            supabase.table("agent_status")
            .insert({"project_id": project["id"], "agent": agent_name, "status": "idle"})
            .execute()
        )
    await ensure_default_member_invitation(
        supabase,
        project_id=project["id"],
        created_by_session_id=session_id,
    )

    return _project_with_membership(project, member_result.data[0], member_count=1)


async def list_projects_for_session(supabase: AsyncClient, session_id: str) -> list[dict[str, Any]]:
    member_rows = (
        await supabase.table("project_member").select("*").eq("session_id", session_id).execute()
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
            projects.append(
                _project_with_membership(
                    project_rows[0],
                    member,
                    member_count=await get_project_member_count(
                        supabase, project_id=project_rows[0]["id"]
                    ),
                )
            )
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
    return _project_with_membership(
        project_rows[0],
        member,
        member_count=await get_project_member_count(supabase, project_id=project_rows[0]["id"]),
    )


async def update_project(
    supabase: AsyncClient,
    *,
    project_id: UUID,
    name: str | None,
    description: str | None,
) -> dict[str, Any]:
    updates = {
        key: value
        for key, value in {
            "name": name.strip() if name is not None else None,
            "description": description.strip() if description is not None else None,
        }.items()
        if value is not None
    }
    if not updates:
        project = await get_project_by_id(supabase, project_id=project_id)
        return project

    rows = (
        await supabase.table("project").update(updates).eq("id", str(project_id)).execute()
    ).data
    if not rows:
        raise ProjectNotFound()
    return rows[0]


async def delete_project(supabase: AsyncClient, *, project_id: UUID) -> None:
    from src.chat.delete_service import delete_project_storage_objects

    project = await get_project_by_id(supabase, project_id=project_id)
    project_id_str = str(project["id"])
    await delete_project_storage_objects(supabase, project_id=project_id_str)
    for table_name in (
        "agent_run",
        "project_memory",
        "conversation_summary",
        "agent_artifact",
        "project_llm_usage",
        "plan_proposal",
        "project_plan",
        "plan_version",
        "chat_message",
        "uploaded_file",
        "agent_status",
        "project_member",
        "project_invitation",
    ):
        await supabase.table(table_name).delete().eq("project_id", project_id_str).execute()
    await supabase.table("project").delete().eq("id", project_id_str).execute()


async def list_project_members(
    supabase: AsyncClient,
    *,
    project_id: UUID,
) -> list[dict[str, Any]]:
    await get_project_by_id(supabase, project_id=project_id)
    members = (
        await supabase.table("project_member")
        .select("*")
        .eq("project_id", str(project_id))
        .order("created_at")
        .execute()
    ).data
    return members


async def get_project_member_count(supabase: AsyncClient, *, project_id: UUID | str) -> int:
    members = (
        await supabase.table("project_member")
        .select("id")
        .eq("project_id", str(project_id))
        .execute()
    ).data
    return len(members)


async def get_project_by_id(supabase: AsyncClient, *, project_id: UUID) -> dict[str, Any]:
    project_rows = (
        await supabase.table("project").select("*").eq("id", str(project_id)).limit(1).execute()
    ).data
    if not project_rows:
        raise ProjectNotFound()
    return project_rows[0]
