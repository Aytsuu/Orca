from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from supabase import AsyncClient

from src.chat.schemas import MessageCreate, MessageOut, UploadUrlOut, UploadUrlRequest
from src.chat.service import create_message, create_signed_upload, list_messages
from src.models import DataEnvelope
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin

router = APIRouter(tags=["chat"])


UploadUrlRequestDep = Annotated[UploadUrlRequest, Depends()]


@router.post(
    "/{project_id}/messages",
    response_model=DataEnvelope[MessageOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_message_endpoint(
    project_id: UUID,
    payload: MessageCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[MessageOut]:
    message = await create_message(
        supabase,
        project_id=str(project_id),
        session_id=project_context["session_id"],
        content=payload.content,
    )
    return DataEnvelope(data=MessageOut.model_validate(message))


@router.get("/{project_id}/messages", response_model=DataEnvelope[list[MessageOut]])
async def list_messages_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[MessageOut]]:
    messages = await list_messages(supabase, str(project_id))
    return DataEnvelope(data=[MessageOut.model_validate(message) for message in messages])


@router.get("/{project_id}/files/upload-url", response_model=DataEnvelope[UploadUrlOut])
async def get_upload_url_endpoint(
    project_id: UUID,
    query: UploadUrlRequestDep,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[UploadUrlOut]:
    upload_url = await create_signed_upload(
        supabase,
        project_id=str(project_id),
        session_id=project_context["session_id"],
        filename=query.filename,
    )
    return DataEnvelope(data=upload_url)
