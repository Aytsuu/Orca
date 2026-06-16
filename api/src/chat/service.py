from __future__ import annotations

from pathlib import PurePosixPath
from uuid import uuid4

from supabase import AsyncClient

from src.chat.schemas import UploadUrlOut
from src.exceptions import BadRequest

UPLOAD_BUCKET = "orca-uploads"


async def list_messages(supabase: AsyncClient, project_id: str) -> list[dict]:
    rows = (
        await supabase.table("chat_message")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    ).data
    return rows


async def create_message(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    content: str,
) -> dict:
    result = (
        await supabase.table("chat_message")
        .insert(
            {
                "project_id": project_id,
                "session_id": session_id,
                "content": content.strip(),
            }
        )
        .execute()
    )
    return result.data[0]


def build_storage_path(project_id: str, session_id: str, filename: str) -> str:
    safe_filename = filename.replace("\\", "-").replace("/", "-").strip()
    return str(PurePosixPath(project_id) / session_id / f"{uuid4()}-{safe_filename}")


async def create_signed_upload(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    filename: str,
) -> UploadUrlOut:
    storage_path = build_storage_path(project_id, session_id, filename)
    response = supabase.storage.from_(UPLOAD_BUCKET).create_signed_upload_url(
        storage_path,
        options={"upsert": "true"},
    )
    return UploadUrlOut(
        bucket=UPLOAD_BUCKET,
        storage_path=storage_path,
        token=response["token"] if isinstance(response, dict) else response.token,
        signed_url=(
            response.get("signed_url")
            if isinstance(response, dict)
            else getattr(response, "signed_url", None)
        ),
    )


def validate_storage_path_scope(*, project_id: str, session_id: str, storage_path: str) -> None:
    parts = PurePosixPath(storage_path).parts
    if len(parts) < 3 or parts[0] != project_id or parts[1] != session_id:
        raise BadRequest("Storage path must stay within the current project/session scope.")


async def finalize_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    filename: str,
    mime_type: str,
    storage_path: str,
    size_bytes: int,
) -> dict:
    validate_storage_path_scope(
        project_id=project_id,
        session_id=session_id,
        storage_path=storage_path,
    )
    result = (
        await supabase.table("uploaded_file")
        .insert(
            {
                "project_id": project_id,
                "session_id": session_id,
                "filename": filename.strip(),
                "mime_type": mime_type.strip(),
                "storage_path": storage_path,
                "size_bytes": size_bytes,
            }
        )
        .execute()
    )
    return result.data[0]


async def list_uploaded_files(supabase: AsyncClient, project_id: str) -> list[dict]:
    rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    return rows
