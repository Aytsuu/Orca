from __future__ import annotations

from inspect import isawaitable
from pathlib import PurePosixPath
from types import SimpleNamespace
from uuid import uuid4

from postgrest.exceptions import APIError
from supabase import AsyncClient

from src.chat.schemas import UploadUrlOut
from src.exceptions import BadRequest

UPLOAD_BUCKET = "orca-uploads"


def normalize_uploaded_file_row(row: dict) -> dict:
    normalized = dict(row)
    storage_path = str(normalized.get("storage_path", "")).strip()
    normalized.setdefault("filename", storage_path.rsplit("/", 1)[-1] if storage_path else "file")
    normalized.setdefault("size_bytes", 0)
    return normalized


def is_missing_uploaded_file_column(error: APIError, column: str) -> bool:
    message = str(getattr(error, "message", "") or "")
    details = getattr(error, "details", None)
    return column in message or (isinstance(details, str) and column in details)


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


async def list_uploaded_files(supabase: AsyncClient, project_id: str) -> list[dict]:
    rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    ).data
    return [normalize_uploaded_file_row(row) for row in rows]


def ensure_storage_path_scope(project_id: str, session_id: str, storage_path: str) -> None:
    normalized = PurePosixPath(storage_path.strip())
    parts = normalized.parts
    if len(parts) < 3 or parts[0] != project_id or parts[1] != session_id:
        raise BadRequest(message="Storage path must stay within the project member scope.")


async def create_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    filename: str,
    mime_type: str,
    storage_path: str,
    size_bytes: int,
) -> dict:
    ensure_storage_path_scope(project_id, session_id, storage_path)
    payload = {
        "project_id": project_id,
        "session_id": session_id,
        "filename": filename.strip(),
        "mime_type": mime_type.strip(),
        "storage_path": storage_path.strip(),
        "size_bytes": size_bytes,
    }
    try:
        result = await supabase.table("uploaded_file").insert(payload).execute()
    except APIError as error:
        if not (
            is_missing_uploaded_file_column(error, "filename")
            or is_missing_uploaded_file_column(error, "size_bytes")
        ):
            raise

        legacy_payload = {
            "project_id": project_id,
            "session_id": session_id,
            "mime_type": mime_type.strip(),
            "storage_path": storage_path.strip(),
        }
        result = await supabase.table("uploaded_file").insert(legacy_payload).execute()
        legacy_row = normalize_uploaded_file_row(result.data[0])
        legacy_row["filename"] = filename.strip()
        legacy_row["size_bytes"] = size_bytes
        return legacy_row

    return normalize_uploaded_file_row(result.data[0])


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
    create_signed_upload_url = supabase.storage.from_(UPLOAD_BUCKET).create_signed_upload_url
    try:
        response = create_signed_upload_url(
            storage_path,
            options=SimpleNamespace(upsert="true"),
        )
    except TypeError:
        response = create_signed_upload_url(storage_path)
    if isawaitable(response):
        response = await response
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
