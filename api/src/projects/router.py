from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from supabase import AsyncClient

from src.members.schemas import MemberOut
from src.models import DataEnvelope
from src.permissions import require_approver_membership
from src.projects.dependencies import get_project_context
from src.projects.schemas import ProjectCreate, ProjectOut, ProjectUpdate
from src.projects.service import (
    create_project,
    delete_project,
    get_project_for_session,
    get_project_member_count,
    list_project_members,
    list_projects_for_session,
    update_project,
)
from src.session import get_session_id
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["projects"])


@router.post("", response_model=DataEnvelope[ProjectOut], status_code=status.HTTP_201_CREATED)
async def create_project_endpoint(
    payload: ProjectCreate,
    session_id: Annotated[str, Depends(get_session_id)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProjectOut]:
    project = await create_project(
        supabase,
        session_id=session_id,
        name=payload.name,
        description=payload.description,
    )
    return DataEnvelope(data=ProjectOut.model_validate(project))


@router.get("", response_model=DataEnvelope[list[ProjectOut]])
async def list_projects_endpoint(
    session_id: Annotated[str, Depends(get_session_id)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[ProjectOut]]:
    projects = await list_projects_for_session(supabase, session_id)
    return DataEnvelope(data=[ProjectOut.model_validate(project) for project in projects])


@router.get("/{project_id}", response_model=DataEnvelope[ProjectOut])
async def get_project_endpoint(
    project_id: str,
    session_id: Annotated[str, Depends(get_session_id)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProjectOut]:
    project = await get_project_for_session(supabase, project_id=project_id, session_id=session_id)
    return DataEnvelope(data=ProjectOut.model_validate(project))


@router.patch("/{project_id}", response_model=DataEnvelope[ProjectOut])
async def update_project_endpoint(
    project_id: str,
    payload: ProjectUpdate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[ProjectOut]:
    require_approver_membership(project_context["membership"])
    project = await update_project(
        supabase,
        project_id=project_id,
        name=payload.name,
        description=payload.description,
    )
    return DataEnvelope(
        data=ProjectOut.model_validate(
            {
                **project,
                "member_count": await get_project_member_count(
                    supabase, project_id=project_context["project_id"]
                ),
                "membership": project_context["membership"],
            }
        )
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_endpoint(
    project_id: str,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> Response:
    require_approver_membership(project_context["membership"])
    await delete_project(supabase, project_id=project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{project_id}/members", response_model=DataEnvelope[list[MemberOut]])
async def list_project_members_endpoint(
    project_id: str,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[MemberOut]]:
    members = await list_project_members(supabase, project_id=project_id)
    return DataEnvelope(data=[MemberOut.model_validate(member) for member in members])
