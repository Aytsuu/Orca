from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from supabase import AsyncClient

from src.agents.queue import QueueProducer, get_queue_producer
from src.agents.service import trigger_agents
from src.chat.delete_service import delete_uploaded_file
from src.chat.relevance import classify_message_for_agent_trigger
from src.chat.schemas import (
    FileAccessUrlOut,
    MessageCreate,
    MessageOut,
    UploadedFileCreate,
    UploadedFileOut,
    UploadUrlOut,
    UploadUrlRequest,
)
from src.chat.service import (
    create_message,
    create_signed_file_access_url,
    create_signed_upload,
    create_uploaded_file,
    list_messages,
    list_uploaded_files,
    promote_uploaded_file_to_ai_context,
)
from src.models import DataEnvelope
from src.projects.dependencies import get_project_context
from src.supabase_client import get_supabase_admin
from src.transcription.queue import TranscriptQueueProducer, get_transcript_queue_producer

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
    queue_producer: Annotated[QueueProducer, Depends(get_queue_producer)],
) -> DataEnvelope[MessageOut]:
    message = await create_message(
        supabase,
        project_id=str(project_id),
        session_id=project_context["session_id"],
        content=payload.content,
        attachments=[attachment.model_dump(mode="json") for attachment in payload.attachments],
    )
    should_trigger = False
    if payload.content.strip():
        should_trigger, _reason = classify_message_for_agent_trigger(payload.content)
    if should_trigger:
        await trigger_agents(
            supabase,
            queue_producer,
            project_id=str(project_id),
            triggered_by=project_context["session_id"],
            message_ids=[message["id"]],
            debounce=True,
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
        purpose=query.purpose,
    )
    return DataEnvelope(data=upload_url)


@router.post(
    "/{project_id}/files",
    response_model=DataEnvelope[UploadedFileOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_uploaded_file_endpoint(
    project_id: UUID,
    payload: UploadedFileCreate,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
    transcript_producer: Annotated[
        TranscriptQueueProducer,
        Depends(get_transcript_queue_producer),
    ],
) -> DataEnvelope[UploadedFileOut]:
    uploaded_file = await create_uploaded_file(
        supabase,
        project_id=str(project_id),
        session_id=project_context["session_id"],
        filename=payload.filename,
        mime_type=payload.mime_type,
        storage_path=payload.storage_path,
        size_bytes=payload.size_bytes,
        purpose=payload.purpose,
    )
    if uploaded_file["is_ai_context"] and uploaded_file["purpose"] == "source":
        transcript_producer.enqueue_transcription(
            uploaded_file_id=uploaded_file["id"],
            project_id=str(project_id),
        )
    return DataEnvelope(data=UploadedFileOut.model_validate(uploaded_file))


@router.get("/{project_id}/files", response_model=DataEnvelope[list[UploadedFileOut]])
async def list_uploaded_files_endpoint(
    project_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[list[UploadedFileOut]]:
    uploaded_files = await list_uploaded_files(supabase, str(project_id))
    return DataEnvelope(
        data=[UploadedFileOut.model_validate(uploaded_file) for uploaded_file in uploaded_files]
    )


@router.get(
    "/{project_id}/files/{uploaded_file_id}/access-url",
    response_model=DataEnvelope[FileAccessUrlOut],
)
async def get_uploaded_file_access_url_endpoint(
    project_id: UUID,
    uploaded_file_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> DataEnvelope[FileAccessUrlOut]:
    access_url = await create_signed_file_access_url(
        supabase,
        project_id=str(project_id),
        uploaded_file_id=str(uploaded_file_id),
    )
    return DataEnvelope(data=access_url)


@router.post(
    "/{project_id}/files/{uploaded_file_id}/add-to-sources",
    response_model=DataEnvelope[UploadedFileOut],
)
async def promote_uploaded_file_endpoint(
    project_id: UUID,
    uploaded_file_id: UUID,
    _: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
    transcript_producer: Annotated[
        TranscriptQueueProducer,
        Depends(get_transcript_queue_producer),
    ],
) -> DataEnvelope[UploadedFileOut]:
    uploaded_file, promoted = await promote_uploaded_file_to_ai_context(
        supabase,
        project_id=str(project_id),
        uploaded_file_id=str(uploaded_file_id),
    )
    if promoted and uploaded_file["is_ai_context"] and uploaded_file["purpose"] == "source":
        transcript_producer.enqueue_transcription(
            uploaded_file_id=uploaded_file["id"],
            project_id=str(project_id),
        )
    return DataEnvelope(data=UploadedFileOut.model_validate(uploaded_file))


@router.delete(
    "/{project_id}/files/{uploaded_file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_uploaded_file_endpoint(
    project_id: UUID,
    uploaded_file_id: UUID,
    project_context: Annotated[dict, Depends(get_project_context)],
    supabase: Annotated[AsyncClient, Depends(get_supabase_admin)],
) -> Response:
    await delete_uploaded_file(
        supabase,
        project_id=str(project_id),
        uploaded_file_id=str(uploaded_file_id),
        actor_session_id=project_context["session_id"],
        actor_membership=project_context["membership"],
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
