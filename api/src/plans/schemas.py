from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from src.models import ApiModel

ProposalStatus = Literal["pending", "approved", "rejected", "applied", "superseded"]


class PlanOut(ApiModel):
    id: UUID
    project_id: UUID
    content: dict[str, Any]
    version: int
    finalized_at: datetime | None = None


class ProposalOut(ApiModel):
    id: UUID
    project_id: UUID
    status: ProposalStatus
    changes: list[dict[str, Any]]
    created_at: datetime


class PlanApprove(ApiModel):
    approved_change_indexes: list[int] | None = None


class PlanReject(ApiModel):
    reason: str | None = Field(default=None, max_length=1000)
