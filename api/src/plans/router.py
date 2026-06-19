from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from supabase import AsyncClient

from src.models import DataEnvelope, MetaEnvelope
from src.permissions import require_approver_membership, require_editor_membership
from src.plans.schemas import (
    PhaseCreate,
    PhaseOut,
    PhaseUpdate,
    PlanApprove,
    ProposalChangeAccept,
    PlanMetaUpdate,
    PlanReject,
    PlanVersionOut,
    ProposalOut,
    RiskCreate,
    RiskOut,
    RiskUpdate,
    StructuredPlanOut,
    TaskAttachmentCreate,
    TaskAttachmentOut,
    TaskCreate,
    TaskOut,
    TaskUpdate,
)
from src.plans.service import (
    accept_proposal_change,
    approve_proposal,
    create_phase,
    create_risk,
    create_task,
    create_task_attachment,
    delete_gap,
    delete_phase,
    delete_risk,
    delete_task,
    delete_task_attachment,
    get_current_plan,
    get_latest_proposal,
    get_pending_proposal,
    list_plan_versions,
    reject_proposal,
    reject_proposal_change,
    revert_plan,
    serialize_plan_row,
    update_phase,
    update_plan_meta,
    update_risk,
    update_task,
)
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["plans"])


@router.get("/{project_id}/plan", response_model=DataEnvelope[StructuredPlanOut | None])
async def get_plan_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[StructuredPlanOut | None]:
    plan = await get_current_plan(supabase, str(project_id))
    return DataEnvelope(data=StructuredPlanOut.model_validate(serialize_plan_row(plan)) if plan else None)


@router.patch("/{project_id}/plan", response_model=MetaEnvelope[StructuredPlanOut])
async def update_plan_endpoint(
    project_id: UUID,
    payload: PlanMetaUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[StructuredPlanOut]:
    require_editor_membership(project_context["membership"])
    plan, conflicts = await update_plan_meta(
        supabase,
        project_id=str(project_id),
        title=payload.title,
        description=payload.description,
        objectives=payload.objectives,
        stakeholders=[item.model_dump(mode="python") for item in payload.stakeholders]
        if payload.stakeholders is not None
        else None,
    )
    return MetaEnvelope(data=StructuredPlanOut.model_validate(plan), meta={"conflicts": conflicts})


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


@router.patch(
    "/{project_id}/plan/proposal/changes/{change_id}/accept",
    response_model=DataEnvelope[StructuredPlanOut],
)
async def accept_plan_change_endpoint(
    project_id: UUID,
    change_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
    payload: ProposalChangeAccept | None = None,
) -> DataEnvelope[StructuredPlanOut]:
    require_approver_membership(project_context["membership"])
    plan = await accept_proposal_change(
        supabase,
        project_id=str(project_id),
        change_id=change_id,
        content_override=payload.content if payload else None,
    )
    return DataEnvelope(data=StructuredPlanOut.model_validate(plan))


@router.patch(
    "/{project_id}/plan/proposal/changes/{change_id}/reject",
    response_model=DataEnvelope[ProposalOut],
)
async def reject_plan_change_endpoint(
    project_id: UUID,
    change_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProposalOut]:
    require_approver_membership(project_context["membership"])
    proposal = await reject_proposal_change(supabase, project_id=str(project_id), change_id=change_id)
    return DataEnvelope(data=ProposalOut.model_validate(proposal))


@router.post("/{project_id}/plan/approve", response_model=DataEnvelope[StructuredPlanOut])
async def approve_plan_endpoint(
    project_id: UUID,
    payload: PlanApprove,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[StructuredPlanOut]:
    require_approver_membership(project_context["membership"])
    plan = await approve_proposal(
        supabase,
        project_id=str(project_id),
        approved_change_indexes=payload.approved_change_indexes,
        change_ids=payload.change_ids,
        change_overrides=payload.change_overrides,
    )
    return DataEnvelope(data=StructuredPlanOut.model_validate(plan))


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


@router.post("/{project_id}/plan/revert", response_model=DataEnvelope[StructuredPlanOut])
async def revert_plan_endpoint(
    project_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[StructuredPlanOut]:
    require_approver_membership(project_context["membership"])
    plan = await revert_plan(supabase, str(project_id))
    return DataEnvelope(data=StructuredPlanOut.model_validate(plan))


@router.get("/{project_id}/plan/versions", response_model=DataEnvelope[list[PlanVersionOut]])
async def list_plan_versions_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[PlanVersionOut]]:
    versions = await list_plan_versions(supabase, str(project_id))
    return DataEnvelope(data=[PlanVersionOut.model_validate(item) for item in versions])


@router.post(
    "/{project_id}/plan/phases",
    response_model=MetaEnvelope[PhaseOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_phase_endpoint(
    project_id: UUID,
    payload: PhaseCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[PhaseOut]:
    require_editor_membership(project_context["membership"])
    phase, conflicts = await create_phase(
        supabase,
        project_id=str(project_id),
        title=payload.title,
        goal=payload.goal,
        timeframe=payload.timeframe,
    )
    return MetaEnvelope(data=PhaseOut.model_validate(phase), meta={"conflicts": conflicts})


@router.patch("/{project_id}/plan/phases/{phase_id}", response_model=MetaEnvelope[PhaseOut])
async def update_phase_endpoint(
    project_id: UUID,
    phase_id: str,
    payload: PhaseUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[PhaseOut]:
    require_editor_membership(project_context["membership"])
    phase, conflicts = await update_phase(
        supabase,
        project_id=str(project_id),
        phase_id=phase_id,
        title=payload.title,
        goal=payload.goal,
        timeframe=payload.timeframe,
    )
    return MetaEnvelope(data=PhaseOut.model_validate(phase), meta={"conflicts": conflicts})


@router.delete("/{project_id}/plan/phases/{phase_id}", response_model=DataEnvelope[PhaseOut])
async def delete_phase_endpoint(
    project_id: UUID,
    phase_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
    force: bool = Query(default=False),
) -> DataEnvelope[PhaseOut]:
    require_editor_membership(project_context["membership"])
    phase = await delete_phase(supabase, project_id=str(project_id), phase_id=phase_id, force=force)
    return DataEnvelope(data=PhaseOut.model_validate(phase))


@router.post(
    "/{project_id}/plan/phases/{phase_id}/tasks",
    response_model=MetaEnvelope[TaskOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_task_endpoint(
    project_id: UUID,
    phase_id: str,
    payload: TaskCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[TaskOut]:
    require_editor_membership(project_context["membership"])
    task, conflicts = await create_task(
        supabase,
        project_id=str(project_id),
        phase_id=phase_id,
        title=payload.title,
        owner=payload.owner,
        due=payload.due,
        priority=payload.priority,
        description=payload.description,
        acceptance_criteria=payload.acceptance_criteria,
    )
    return MetaEnvelope(data=TaskOut.model_validate(task), meta={"conflicts": conflicts})


@router.patch(
    "/{project_id}/plan/phases/{phase_id}/tasks/{task_id}",
    response_model=MetaEnvelope[TaskOut],
)
async def update_task_endpoint(
    project_id: UUID,
    phase_id: str,
    task_id: str,
    payload: TaskUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[TaskOut]:
    del phase_id
    require_editor_membership(project_context["membership"])
    task, conflicts = await update_task(
        supabase,
        project_id=str(project_id),
        task_id=task_id,
        title=payload.title,
        owner=payload.owner,
        due=payload.due,
        priority=payload.priority,
        description=payload.description,
        acceptance_criteria=payload.acceptance_criteria,
    )
    return MetaEnvelope(data=TaskOut.model_validate(task), meta={"conflicts": conflicts})


@router.delete("/{project_id}/plan/phases/{phase_id}/tasks/{task_id}", response_model=DataEnvelope[TaskOut])
async def delete_task_endpoint(
    project_id: UUID,
    phase_id: str,
    task_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[TaskOut]:
    del phase_id
    require_editor_membership(project_context["membership"])
    task = await delete_task(supabase, project_id=str(project_id), task_id=task_id)
    return DataEnvelope(data=TaskOut.model_validate(task))


@router.delete("/{project_id}/plan/phases/{phase_id}/gaps/{gap_id}", response_model=MetaEnvelope[dict])
async def delete_gap_endpoint(
    project_id: UUID,
    phase_id: str,
    gap_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[dict]:
    del phase_id
    require_approver_membership(project_context["membership"])
    gap, conflicts = await delete_gap(supabase, project_id=str(project_id), gap_id=gap_id)
    return MetaEnvelope(data=gap, meta={"conflicts": conflicts})


@router.post(
    "/{project_id}/plan/risks",
    response_model=MetaEnvelope[RiskOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_risk_endpoint(
    project_id: UUID,
    payload: RiskCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[RiskOut]:
    require_editor_membership(project_context["membership"])
    risk, conflicts = await create_risk(
        supabase,
        project_id=str(project_id),
        description=payload.description,
        severity=payload.severity,
        mitigation=payload.mitigation,
    )
    return MetaEnvelope(data=RiskOut.model_validate(risk), meta={"conflicts": conflicts})


@router.patch("/{project_id}/plan/risks/{risk_id}", response_model=MetaEnvelope[RiskOut])
async def update_risk_endpoint(
    project_id: UUID,
    risk_id: str,
    payload: RiskUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> MetaEnvelope[RiskOut]:
    require_editor_membership(project_context["membership"])
    risk, conflicts = await update_risk(
        supabase,
        project_id=str(project_id),
        risk_id=risk_id,
        description=payload.description,
        severity=payload.severity,
        mitigation=payload.mitigation,
    )
    return MetaEnvelope(data=RiskOut.model_validate(risk), meta={"conflicts": conflicts})


@router.delete("/{project_id}/plan/risks/{risk_id}", response_model=DataEnvelope[RiskOut])
async def delete_risk_endpoint(
    project_id: UUID,
    risk_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[RiskOut]:
    require_editor_membership(project_context["membership"])
    risk = await delete_risk(supabase, project_id=str(project_id), risk_id=risk_id)
    return DataEnvelope(data=RiskOut.model_validate(risk))


@router.post(
    "/{project_id}/plan/phases/{phase_id}/tasks/{task_id}/attachments",
    response_model=DataEnvelope[TaskAttachmentOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_task_attachment_endpoint(
    project_id: UUID,
    phase_id: str,
    task_id: str,
    payload: TaskAttachmentCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[TaskAttachmentOut]:
    del phase_id
    require_editor_membership(project_context["membership"])
    attachment = await create_task_attachment(
        supabase,
        project_id=str(project_id),
        task_id=task_id,
        uploaded_file_id=str(payload.uploaded_file_id),
    )
    return DataEnvelope(data=TaskAttachmentOut.model_validate(attachment))


@router.delete(
    "/{project_id}/plan/phases/{phase_id}/tasks/{task_id}/attachments/{attachment_id}",
    response_model=DataEnvelope[TaskAttachmentOut],
)
async def delete_task_attachment_endpoint(
    project_id: UUID,
    phase_id: str,
    task_id: str,
    attachment_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[TaskAttachmentOut]:
    del phase_id
    require_editor_membership(project_context["membership"])
    attachment = await delete_task_attachment(
        supabase,
        project_id=str(project_id),
        task_id=task_id,
        attachment_id=attachment_id,
    )
    return DataEnvelope(data=TaskAttachmentOut.model_validate(attachment))
