from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from src.models import ApiModel

ProjectMemberRole = Literal["creator", "approver", "member"]


class ProjectCreate(ApiModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=4000)


class ProjectMembershipOut(ApiModel):
    role: ProjectMemberRole
    can_approve: bool
    can_edit: bool


class ProjectOut(ApiModel):
    id: UUID
    name: str
    description: str
    created_at: datetime
    membership: ProjectMembershipOut
