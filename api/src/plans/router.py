from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from src.models import DataEnvelope
from src.permissions import require_approver_membership
from src.plans.schemas import PlanApprove, PlanOut, PlanReject, ProposalOut
from src.plans.service import (
    approve_proposal,
    get_current_plan,
    get_latest_proposal,
    get_pending_proposal,
    reject_proposal,
    revert_plan,
)
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["plans"])


@router.get("/{project_id}/plan", response_model=DataEnvelope[PlanOut | None])
async def get_plan_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[PlanOut | None]:
    plan = await get_current_plan(supabase, str(project_id))
    return DataEnvelope(data=PlanOut.model_validate(plan) if plan else None)


@router.get("/{project_id}/plan/proposal", response_model=DataEnvelope[ProposalOut | None])
async def get_pending_proposal_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProposalOut | None]:
    require_approver_membership(project_context["membership"])
    proposal = await get_pending_proposal(supabase, str(project_id))
    return DataEnvelope(data=ProposalOut.model_validate(proposal) if proposal else None)


@router.get("/{project_id}/plan/proposals/latest", response_model=DataEnvelope[ProposalOut | None])
async def get_latest_proposal_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProposalOut | None]:
    proposal = await get_latest_proposal(supabase, str(project_id))
    return DataEnvelope(data=ProposalOut.model_validate(proposal) if proposal else None)


@router.post("/{project_id}/plan/approve", response_model=DataEnvelope[PlanOut])
async def approve_plan_endpoint(
    project_id: UUID,
    payload: PlanApprove,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[PlanOut]:
    require_approver_membership(project_context["membership"])
    plan = await approve_proposal(
        supabase,
        project_id=str(project_id),
        approved_change_indexes=payload.approved_change_indexes,
    )
    return DataEnvelope(data=PlanOut.model_validate(plan))


@router.post("/{project_id}/plan/reject", response_model=DataEnvelope[ProposalOut])
async def reject_plan_endpoint(
    project_id: UUID,
    payload: PlanReject,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProposalOut]:
    del payload
    require_approver_membership(project_context["membership"])
    proposal = await reject_proposal(supabase, str(project_id))
    return DataEnvelope(data=ProposalOut.model_validate(proposal))


@router.post("/{project_id}/plan/revert", response_model=DataEnvelope[PlanOut])
async def revert_plan_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[PlanOut]:
    require_approver_membership(project_context["membership"])
    plan = await revert_plan(supabase, str(project_id))
    return DataEnvelope(data=PlanOut.model_validate(plan))
