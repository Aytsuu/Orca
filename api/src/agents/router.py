from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from supabase import AsyncClient

from src.agents.schemas import AgentStatusOut, AgentTriggerOut
from src.agents.service import get_agent_statuses, trigger_agents
from src.models import DataEnvelope
from src.permissions import require_approver_membership
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["agents"])


@router.get("/{project_id}/agents/status", response_model=DataEnvelope[list[AgentStatusOut]])
async def get_agent_statuses_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[AgentStatusOut]]:
    statuses = await get_agent_statuses(supabase, str(project_id))
    return DataEnvelope(data=[AgentStatusOut.model_validate(row) for row in statuses])


@router.post(
    "/{project_id}/agents/trigger",
    response_model=DataEnvelope[AgentTriggerOut],
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_agents_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[AgentTriggerOut]:
    require_approver_membership(project_context["membership"])
    result = await trigger_agents(supabase, str(project_id))
    return DataEnvelope(data=AgentTriggerOut.model_validate(result))
