from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from supabase import AsyncClient

from src.agents.queue import QueueProducer, get_queue_producer
from src.agents.schemas import (
    AgentActivityItemOut,
    AgentActivityPromoteOut,
    AgentArtifactOut,
    AgentStatusOut,
    AgentTriggerOut,
)
from src.agents.service import (
    get_agent_activity,
    get_agent_statuses,
    get_latest_run_artifacts,
    promote_activity_item,
    promote_all_actionable_activity,
    trigger_agents,
)
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


@router.get(
    "/{project_id}/agents/artifacts/latest",
    response_model=DataEnvelope[list[AgentArtifactOut]],
)
async def get_latest_agent_artifacts_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[AgentArtifactOut]]:
    artifacts = await get_latest_run_artifacts(supabase, str(project_id))
    return DataEnvelope(data=[AgentArtifactOut.model_validate(row) for row in artifacts])


@router.get(
    "/{project_id}/agents/activity",
    response_model=DataEnvelope[list[AgentActivityItemOut]],
)
async def get_agent_activity_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[AgentActivityItemOut]]:
    items = await get_agent_activity(supabase, str(project_id))
    return DataEnvelope(data=[AgentActivityItemOut.model_validate(item) for item in items])


@router.post(
    "/{project_id}/agents/activity/{item_id}/promote",
    response_model=DataEnvelope[AgentActivityPromoteOut],
)
async def promote_agent_activity_item_endpoint(
    project_id: UUID,
    item_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[AgentActivityPromoteOut]:
    require_approver_membership(project_context["membership"])
    result = await promote_activity_item(supabase, project_id=str(project_id), item_id=item_id)
    return DataEnvelope(data=AgentActivityPromoteOut.model_validate(result))


@router.post(
    "/{project_id}/agents/activity/promote-all",
    response_model=DataEnvelope[AgentActivityPromoteOut],
)
async def promote_all_agent_activity_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[AgentActivityPromoteOut]:
    require_approver_membership(project_context["membership"])
    result = await promote_all_actionable_activity(supabase, project_id=str(project_id))
    return DataEnvelope(data=AgentActivityPromoteOut.model_validate(result))


@router.post(
    "/{project_id}/agents/trigger",
    response_model=DataEnvelope[AgentTriggerOut],
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_agents_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
    queue_producer: Annotated[QueueProducer, Depends(get_queue_producer)],
) -> DataEnvelope[AgentTriggerOut]:
    require_approver_membership(project_context["membership"])
    result = await trigger_agents(
        supabase,
        queue_producer,
        project_id=str(project_id),
        triggered_by=project_context["session_id"],
    )
    return DataEnvelope(data=AgentTriggerOut.model_validate(result))
