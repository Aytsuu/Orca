from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from supabase import AsyncClient

from src.members.schemas import (
    DefaultMemberInvitationOut,
    MemberCreate,
    MemberInvitationCreate,
    MemberInvitationOut,
    MemberOut,
    MemberPermissionsUpdate,
)
from src.members.service import (
    add_member,
    create_member_invitation,
    ensure_default_member_invitation,
    update_member_permissions,
)
from src.models import DataEnvelope
from src.permissions import require_approver_membership
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["members"])


@router.post(
    "/{project_id}/members",
    response_model=DataEnvelope[MemberOut],
    status_code=status.HTTP_201_CREATED,
)
async def add_member_endpoint(
    project_id: UUID,
    payload: MemberCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[MemberOut]:
    require_approver_membership(project_context["membership"])
    member = await add_member(
        supabase,
        project_id=str(project_id),
        session_id=payload.session_id,
        role=payload.role,
        can_approve=payload.can_approve,
        can_edit=payload.can_edit,
    )
    return DataEnvelope(data=MemberOut.model_validate(member))


@router.patch(
    "/{project_id}/members/{member_session_id}/permissions",
    response_model=DataEnvelope[MemberOut],
)
async def update_member_permissions_endpoint(
    project_id: UUID,
    member_session_id: str,
    payload: MemberPermissionsUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[MemberOut]:
    require_approver_membership(project_context["membership"])
    member = await update_member_permissions(
        supabase,
        project_id=str(project_id),
        session_id=member_session_id,
        can_approve=payload.can_approve,
        can_edit=payload.can_edit,
    )
    return DataEnvelope(data=MemberOut.model_validate(member))


@router.post(
    "/{project_id}/member-invitations",
    response_model=DataEnvelope[MemberInvitationOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_member_invitation_endpoint(
    project_id: UUID,
    payload: MemberInvitationCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[MemberInvitationOut]:
    require_approver_membership(project_context["membership"])
    invitation = await create_member_invitation(
        supabase,
        project_id=str(project_id),
        created_by_session_id=project_context["session_id"],
        invitee_name=payload.invitee_name,
        invitee_email=payload.invitee_email,
        role=payload.role,
        can_approve=payload.can_approve,
        can_edit=payload.can_edit,
    )
    return DataEnvelope(data=MemberInvitationOut.model_validate(invitation))


@router.get(
    "/{project_id}/member-invitations/default",
    response_model=DataEnvelope[DefaultMemberInvitationOut],
)
async def get_default_member_invitation_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[DefaultMemberInvitationOut]:
    invitation = await ensure_default_member_invitation(
        supabase,
        project_id=str(project_id),
        created_by_session_id=project_context["session_id"],
    )
    return DataEnvelope(
        data=DefaultMemberInvitationOut(
            project_id=invitation["project_id"],
            token=invitation["token"],
        )
    )
