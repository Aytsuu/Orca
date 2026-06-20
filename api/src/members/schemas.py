from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.models import ApiModel

MemberRole = Literal["approver", "member"]


class MemberCreate(ApiModel):
    session_id: str = Field(min_length=1, max_length=255)
    role: MemberRole
    can_approve: bool | None = None
    can_edit: bool | None = None


class MemberPermissionsUpdate(ApiModel):
    can_approve: bool | None = None
    can_edit: bool | None = None


class MemberInvitationCreate(ApiModel):
    invitee_name: str = Field(min_length=1, max_length=200)
    invitee_email: str = Field(min_length=3, max_length=320)
    role: MemberRole
    can_approve: bool | None = None
    can_edit: bool | None = None


class MemberInvitationOut(ApiModel):
    id: UUID
    project_id: UUID
    token: str
    invitee_name: str
    invitee_email: str
    role: str
    can_approve: bool
    can_edit: bool
    created_by_session_id: str
    created_at: datetime
    redeemed_at: datetime | None = None
    redeemed_by_session_id: str | None = None


class MemberOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    role: str
    can_approve: bool
    can_edit: bool
    created_at: datetime


class MemberInvitationAcceptanceOut(ApiModel):
    project_id: UUID
    member: MemberOut


class DefaultMemberInvitationOut(ApiModel):
    project_id: UUID
    token: str
