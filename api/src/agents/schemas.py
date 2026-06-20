from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from src.models import ApiModel

AgentName = Literal["monitor", "analyzer", "planner", "updater"]
AgentState = Literal["idle", "queued", "running", "completed", "failed"]


class AgentStatusOut(ApiModel):
    id: UUID
    project_id: UUID
    agent: AgentName
    status: AgentState
    updated_at: datetime


class AgentTriggerOut(ApiModel):
    run_id: UUID
    project_id: UUID
    status: str
    reused_active_run: bool = False


class AgentArtifactOut(ApiModel):
    id: UUID
    run_id: UUID
    project_id: UUID
    agent: AgentName
    payload: dict
    created_at: datetime


ActivityKind = Literal["proposal_change", "gap", "risk", "insight"]


class AgentActivityItemOut(ApiModel):
    id: str
    artifact_id: UUID
    agent: AgentName
    kind: ActivityKind
    title: str
    detail: str = ""
    actionable: bool = False
    proposal_change: dict[str, Any] | None = None
    created_at: datetime


class AgentActivityPromoteOut(ApiModel):
    proposal_id: UUID
    change_ids: list[str]
