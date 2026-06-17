from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from src.models import ApiModel

ProposalStatus = Literal["pending", "approved", "rejected", "applied", "superseded"]
ChangeAction = Literal["add", "update", "remove"]
ChangeSection = Literal["tasks", "phases", "gaps", "risks"]
ChangeState = Literal["pending", "applied", "rejected", "stale"]
Priority = Literal["critical", "high", "medium", "low"]
Severity = Literal["critical", "major", "minor"]
Confidence = Literal["high", "medium", "low"]
PlanVersionStatus = Literal["current", "archived"]


class Stakeholder(ApiModel):
    user_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    initials: str = Field(min_length=1, max_length=10)


class GapOut(ApiModel):
    id: str
    description: str
    severity: Severity = "minor"
    source_message_ids: list[str] = Field(default_factory=list)
    source_excerpt: str | None = None


class TaskAttachmentOut(ApiModel):
    id: str
    uploaded_file_id: UUID
    filename: str
    mime_type: str
    storage_path: str
    size_bytes: int
    uploaded_by_session_id: str
    uploaded_at: datetime


class TaskOut(ApiModel):
    id: str
    title: str
    owner: str | None = None
    due: str | None = None
    priority: Priority = "medium"
    description: str | None = None
    acceptance_criteria: list[str] = Field(default_factory=list)
    attachments: list[TaskAttachmentOut] = Field(default_factory=list)
    status: str | None = None
    source_message_ids: list[str] = Field(default_factory=list)
    source_excerpt: str | None = None
    confidence: Confidence | None = None


class PhaseOut(ApiModel):
    id: str
    title: str
    goal: str | None = None
    timeframe: str | None = None
    tasks: list[TaskOut] = Field(default_factory=list)
    gaps: list[GapOut] = Field(default_factory=list)


class RiskOut(ApiModel):
    id: str
    description: str
    severity: Severity = "minor"
    mitigation: str | None = None
    source_message_ids: list[str] = Field(default_factory=list)
    source_excerpt: str | None = None


class StructuredPlanOut(ApiModel):
    id: UUID
    project_id: UUID
    content: dict[str, Any]
    version: int
    finalized_at: datetime | None = None
    title: str = ""
    description: str = ""
    objectives: list[str] = Field(default_factory=list)
    stakeholders: list[Stakeholder] = Field(default_factory=list)
    phases: list[PhaseOut] = Field(default_factory=list)
    global_risks: list[RiskOut] = Field(default_factory=list)


class ProposedChangeOut(ApiModel):
    id: str
    action: ChangeAction = "update"
    section: ChangeSection = "tasks"
    target_id: str | None = Field(default=None, alias="targetId", serialization_alias="targetId")
    title: str = ""
    detail: str = ""
    confidence: Confidence | None = None
    source_quote: str | None = Field(
        default=None,
        alias="sourceQuote",
        serialization_alias="sourceQuote",
    )
    state: ChangeState | None = None
    content: Any | None = None


class ProposalOut(ApiModel):
    id: UUID
    project_id: UUID
    status: ProposalStatus
    changes: list[ProposedChangeOut]
    created_at: datetime


class PlanApprove(ApiModel):
    approved_change_indexes: list[int] | None = None
    change_ids: list[str] | None = None


class PlanReject(ApiModel):
    reason: str | None = Field(default=None, max_length=1000)


class PlanMetaUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    objectives: list[str] | None = None
    stakeholders: list[Stakeholder] | None = None


class PhaseCreate(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    goal: str | None = Field(default=None, max_length=1000)
    timeframe: str | None = Field(default=None, max_length=200)


class PhaseUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    goal: str | None = Field(default=None, max_length=1000)
    timeframe: str | None = Field(default=None, max_length=200)


class TaskCreate(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    owner: str | None = Field(default=None, max_length=200)
    due: str | None = Field(default=None, max_length=200)
    priority: Priority = "medium"
    description: str | None = Field(default=None, max_length=4000)
    acceptance_criteria: list[str] = Field(default_factory=list)


class TaskUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    owner: str | None = Field(default=None, max_length=200)
    due: str | None = Field(default=None, max_length=200)
    priority: Priority | None = None
    description: str | None = Field(default=None, max_length=4000)
    acceptance_criteria: list[str] | None = None


class RiskCreate(ApiModel):
    description: str = Field(min_length=1, max_length=2000)
    severity: Severity = "minor"
    mitigation: str | None = Field(default=None, max_length=2000)


class RiskUpdate(ApiModel):
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    severity: Severity | None = None
    mitigation: str | None = Field(default=None, max_length=2000)


class TaskAttachmentCreate(ApiModel):
    uploaded_file_id: UUID


class PlanVersionOut(ApiModel):
    id: UUID
    version: int
    created_at: datetime
    status: PlanVersionStatus
