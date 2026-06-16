from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from src.members.schemas import MemberInvitationAcceptanceOut, MemberOut
from src.members.service import accept_member_invitation
from src.models import DataEnvelope
from src.session import get_session_id
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["member-invitations"])


@router.post("/member-invitations/{token}/accept", response_model=DataEnvelope[MemberInvitationAcceptanceOut])
async def accept_member_invitation_endpoint(
    token: str,
    session_id: Annotated[str, Depends(get_session_id)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[MemberInvitationAcceptanceOut]:
    invitation, member = await accept_member_invitation(
        supabase,
        token=token,
        session_id=session_id,
    )
    return DataEnvelope(
        data=MemberInvitationAcceptanceOut(
            project_id=invitation["project_id"],
            member=MemberOut.model_validate(member),
        )
    )
