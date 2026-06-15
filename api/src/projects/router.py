from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from supabase import AsyncClient

from src.models import DataEnvelope
from src.projects.schemas import ProjectCreate, ProjectOut
from src.projects.service import create_project, get_project_for_session, list_projects_for_session
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
