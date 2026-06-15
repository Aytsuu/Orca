from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Depends
from supabase import AsyncClient

from src.projects import service as project_service
from src.session import get_session_id
from src.supabase_client import get_supabase_admin


async def get_project_context(
    project_id: UUID,
    session_id: Annotated[str, Depends(get_session_id)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> dict:
    project = await project_service.get_project_for_session(
        supabase,
        project_id=project_id,
        session_id=session_id,
    )
    return {
        "project": project,
        "membership": project["membership"],
        "session_id": session_id,
        "project_id": project_id,
    }
