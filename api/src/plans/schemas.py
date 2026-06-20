from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from src.models import ApiModel

ProposalStatus = Literal["pending", "approved", "rejected", "applied", "superseded"]
ChangeAction = Literal["add", "update", "remove"]
ChangeSection = Literal[
    "title",
    "description",
    "objectives",
    "stakeholders",
    "technology_stack",
    "tasks",
    "phases",
    "gaps",
    "risks",
    "global_risks",
]
ChangeState = Literal["pending", "applied", "rejected", "stale"]
Priority = Literal["critical", "high", "medium", "low"]
Severity = Literal["critical", "major", "minor"]
Confidence = Literal["high", "medium", "low"]
PlanVersionStatus = Literal["current", "archived"]


class PhaseAssignedMember(ApiModel):
    session_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=200)
    role: Literal["APPROVER", "EDITOR", "VIEWER"] = "VIEWER"
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
    description: str | None = None
    timeframe: str | None = None
    assigned_members: list[PhaseAssignedMember] = Field(default_factory=list)
    tasks: list[TaskOut] = Field(default_factory=list)
    gaps: list[GapOut] = Field(default_factory=list)


class RiskOut(ApiModel):
    id: str
    description: str
    severity: Severity = "minor"
    mitigation: str | None = None
    source_message_ids: list[str] = Field(default_factory=list)
    source_excerpt: str | None = None


class TechnologyStackItemOut(ApiModel):
    title: str = ""
    value: str = ""


class StakeholderOut(ApiModel):
    user_id: str = Field(min_length=1, max_length=255)
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    initials: str = Field(min_length=1, max_length=10)


class StructuredPlanOut(ApiModel):
    id: UUID
    project_id: UUID
    content: dict[str, Any]
    version: int
    finalized_at: datetime | None = None
    title: str = ""
    description: str = ""
    objectives: list[str] = Field(default_factory=list)
    stakeholders: list[StakeholderOut] = Field(default_factory=list)
    technology_stack: list[TechnologyStackItemOut] = Field(default_factory=list)
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
    justification: str | None = None
    source_message_ids: list[str] = Field(default_factory=list)
    content: Any | None = None

    @model_validator(mode="before")
    @classmethod
    def _populate_display_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        normalized = cls._normalize_section_reference(dict(value))
        content = normalized.get("content")

        if not normalized.get("title"):
            normalized["title"] = cls._derive_title(
                content, normalized.get("section"), normalized.get("action")
            )

        if not normalized.get("detail"):
            normalized["detail"] = normalized.get("justification") or ""

        return normalized

    @classmethod
    def _normalize_section_reference(cls, value: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(value)
        section = str(normalized.get("section") or "")
        target_id = normalized.get("targetId") or normalized.get("target_id")
        parts = section.split(".")

        if len(parts) >= 3 and parts[0] == "phases":
            phase_id = parts[1]
            nested_section = parts[2]
            if nested_section in {"tasks", "gaps"}:
                normalized["section"] = nested_section
                if target_id is None:
                    if normalized.get("action") == "add":
                        target_id = phase_id
                    elif len(parts) >= 4:
                        target_id = parts[3]

        if target_id is not None:
            normalized["targetId"] = target_id

        return normalized

    @classmethod
    def _derive_title(cls, content: Any, section: str | None, action: str | None) -> str:
        if isinstance(content, str):
            return content

        if isinstance(content, list) and content:
            first = content[0]
            if isinstance(first, str):
                return first
            if isinstance(first, dict):
                for key in ("title", "name", "description", "detail", "value", "role"):
                    derived = first.get(key)
                    if isinstance(derived, str) and derived.strip():
                        return derived

        if isinstance(content, dict):
            for key in ("title", "name", "description", "detail", "value", "role"):
                derived = content.get(key)
                if isinstance(derived, str) and derived.strip():
                    return derived

        normalized_section = (section or "change").replace("_", " ")
        normalized_action = (action or "update").capitalize()
        return f"{normalized_action} {normalized_section}"


class ProposalOut(ApiModel):
    id: UUID
    project_id: UUID
    status: ProposalStatus
    changes: list[ProposedChangeOut]
    created_at: datetime


class PlanApprove(ApiModel):
    approved_change_indexes: list[int] | None = None
    change_ids: list[str] | None = None
    change_overrides: list["ProposalChangeOverride"] | None = None


class ProposalChangeOverride(ApiModel):
    change_id: str = Field(min_length=1)
    content: Any


class ProposalChangeAccept(ApiModel):
    content: Any | None = None


class PlanReject(ApiModel):
    reason: str | None = Field(default=None, max_length=1000)


class PlanMetaUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=4000)
    objectives: list[str] | None = None


class PhaseCreate(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    goal: str | None = Field(default=None, max_length=1000)
    description: str | None = Field(default=None, max_length=4000)
    timeframe: str | None = Field(default=None, max_length=200)
    assigned_members: list[PhaseAssignedMember] = Field(default_factory=list)


class PhaseUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    goal: str | None = Field(default=None, max_length=1000)
    description: str | None = Field(default=None, max_length=4000)
    timeframe: str | None = Field(default=None, max_length=200)
    assigned_members: list[PhaseAssignedMember] | None = None


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
