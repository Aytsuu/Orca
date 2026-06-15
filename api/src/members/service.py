from __future__ import annotations

from supabase import AsyncClient

from src.members.exceptions import InvalidPermissionsUpdate, MemberAlreadyExists, MemberNotFound


async def add_member(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    role: str,
    can_approve: bool | None,
    can_edit: bool | None,
) -> dict:
    existing = (
        await supabase.table("project_member")
        .select("id")
        .eq("project_id", project_id)
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    ).data
    if existing:
        raise MemberAlreadyExists()

    member = (
        await supabase.table("project_member")
        .insert(
            {
                "project_id": project_id,
                "session_id": session_id,
                "role": role,
                "can_approve": can_approve if can_approve is not None else role == "approver",
                "can_edit": can_edit if can_edit is not None else role == "approver",
            }
        )
        .execute()
    ).data[0]
    return member


async def update_member_permissions(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    can_approve: bool | None,
    can_edit: bool | None,
) -> dict:
    updates = {
        key: value
        for key, value in {
            "can_approve": can_approve,
            "can_edit": can_edit,
        }.items()
        if value is not None
    }
    if not updates:
        raise InvalidPermissionsUpdate()

    result = (
        await supabase.table("project_member")
        .update(updates)
        .eq("project_id", project_id)
        .eq("session_id", session_id)
        .execute()
    ).data
    if not result:
        raise MemberNotFound()
    return result[0]
