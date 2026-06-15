from __future__ import annotations

from pathlib import PurePosixPath
from uuid import uuid4

from supabase import AsyncClient

from src.chat.schemas import UploadUrlOut

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
