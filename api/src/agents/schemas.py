from __future__ import annotations

from datetime import datetime
from typing import Literal
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
