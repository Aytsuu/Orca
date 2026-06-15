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


class MemberOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    role: str
    can_approve: bool
    can_edit: bool
    created_at: datetime
