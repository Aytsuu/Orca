from __future__ import annotations

from datetime import datetime, timezone
from secrets import token_urlsafe

from supabase import AsyncClient

from src.members.exceptions import (
    InvalidPermissionsUpdate,
    MemberAlreadyExists,
    MemberInvitationAlreadyRedeemed,
    MemberInvitationNotFound,
    MemberNotFound,
)


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


async def create_member_invitation(
    supabase: AsyncClient,
    *,
    project_id: str,
    created_by_session_id: str,
    invitee_name: str,
    invitee_email: str,
    role: str,
    can_approve: bool | None,
    can_edit: bool | None,
) -> dict:
    invitation = (
        await supabase.table("project_invitation")
        .insert(
            {
                "project_id": project_id,
                "token": token_urlsafe(24),
                "invitee_name": invitee_name.strip(),
                "invitee_email": invitee_email.strip(),
                "role": role,
                "can_approve": can_approve if can_approve is not None else role == "approver",
                "can_edit": can_edit if can_edit is not None else role == "approver",
                "created_by_session_id": created_by_session_id,
            }
        )
        .execute()
    ).data[0]
    return invitation


async def ensure_default_member_invitation(
    supabase: AsyncClient,
    *,
    project_id: str,
    created_by_session_id: str,
) -> dict:
    existing_invitations = (
        await supabase.table("project_invitation")
        .select("*")
        .eq("project_id", project_id)
        .eq("invitee_email", "__default__")
        .limit(1)
        .execute()
    ).data
    if existing_invitations:
        return existing_invitations[0]

    return await create_member_invitation(
        supabase,
        project_id=project_id,
        created_by_session_id=created_by_session_id,
        invitee_name="Project member",
        invitee_email="__default__",
        role="member",
        can_approve=False,
        can_edit=True,
    )


async def accept_member_invitation(
    supabase: AsyncClient,
    *,
    token: str,
    session_id: str,
) -> tuple[dict, dict]:
    invitation_rows = (
        await supabase.table("project_invitation").select("*").eq("token", token).limit(1).execute()
    ).data
    if not invitation_rows:
        raise MemberInvitationNotFound()

    invitation = invitation_rows[0]
    if invitation["redeemed_at"]:
        if invitation["redeemed_by_session_id"] == session_id:
            member_rows = (
                await supabase.table("project_member")
                .select("*")
                .eq("project_id", invitation["project_id"])
                .eq("session_id", session_id)
                .limit(1)
                .execute()
            ).data
            if not member_rows:
                raise MemberInvitationNotFound()
            return invitation, member_rows[0]
        raise MemberInvitationAlreadyRedeemed()

    member_rows = (
        await supabase.table("project_member")
        .select("*")
        .eq("project_id", invitation["project_id"])
        .eq("session_id", session_id)
        .limit(1)
        .execute()
    ).data
    if member_rows:
        member = member_rows[0]
    else:
        member = await add_member(
            supabase,
            project_id=invitation["project_id"],
            session_id=session_id,
            role=invitation["role"],
            can_approve=invitation["can_approve"],
            can_edit=invitation["can_edit"],
        )

    updated_invitation = (
        await supabase.table("project_invitation")
        .update(
            {
                "redeemed_at": datetime.now(timezone.utc).isoformat(),
                "redeemed_by_session_id": session_id,
            }
        )
        .eq("id", invitation["id"])
        .execute()
    ).data[0]
    return updated_invitation, member
