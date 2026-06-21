from __future__ import annotations

from inspect import isawaitable
from pathlib import PurePosixPath
from types import SimpleNamespace
from typing import Literal
from uuid import uuid4

from postgrest.exceptions import APIError
from supabase import AsyncClient

from src.chat.exceptions import UploadedFileNotFound
from src.chat.schemas import FileAccessUrlOut, UploadUrlOut
from src.exceptions import BadRequest

UPLOAD_BUCKET = "orca-uploads"


def normalize_uploaded_file_row(row: dict) -> dict:
    normalized = dict(row)
    storage_path = str(normalized.get("storage_path", "")).strip()
    normalized.setdefault("filename", storage_path.rsplit("/", 1)[-1] if storage_path else "file")
    normalized.setdefault("size_bytes", 0)
    normalized["purpose"] = infer_uploaded_file_purpose(normalized)
    normalized["is_ai_context"] = normalized["purpose"] == "source"
    return normalized


def normalize_message_row(row: dict) -> dict:
    normalized = dict(row)
    normalized["content"] = str(normalized.get("content", ""))
    normalized["attachments"] = list(normalized.get("attachments") or [])
    return normalized


def build_message_content(content: str, attachments: list[dict] | None = None) -> str:
    normalized_content = content.strip()
    if normalized_content:
        return normalized_content

    attachment_count = len(attachments or [])
    if attachment_count == 1:
        return "Shared an attachment."
    if attachment_count > 1:
        return f"Shared {attachment_count} attachments."

    return normalized_content


def infer_uploaded_file_purpose(row: dict) -> Literal["chat", "source"]:
    explicit_purpose = row.get("purpose")
    if explicit_purpose in {"chat", "source"}:
        return explicit_purpose

    storage_path = str(row.get("storage_path", "")).strip()
    parts = PurePosixPath(storage_path).parts
    if len(parts) >= 4 and parts[2] in {"chat", "source"}:
        return parts[2]

    return "source"


def is_missing_uploaded_file_column(error: APIError, column: str) -> bool:
    message = str(getattr(error, "message", "") or "")
    details = getattr(error, "details", None)
    return column in message or (isinstance(details, str) and column in details)


async def list_messages(supabase: AsyncClient, project_id: str) -> list[dict]:
    try:
        rows = (
            await supabase.table("chat_message")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        ).data
    except APIError as error:
        if not is_missing_uploaded_file_column(error, "attachments"):
            raise
        rows = (
            await supabase.table("chat_message")
            .select("id,project_id,session_id,content,created_at")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        ).data
    return [normalize_message_row(row) for row in rows]


async def create_message(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    content: str,
    attachments: list[dict] | None = None,
) -> dict:
    persisted_content = build_message_content(content, attachments)
    payload = {
        "project_id": project_id,
        "session_id": session_id,
        "content": persisted_content,
        "attachments": list(attachments or []),
    }
    try:
        result = await supabase.table("chat_message").insert(payload).execute()
        return normalize_message_row(result.data[0])
    except APIError as error:
        if not is_missing_uploaded_file_column(error, "attachments"):
            raise
        legacy_payload = {
            "project_id": project_id,
            "session_id": session_id,
            "content": persisted_content,
        }
        result = await supabase.table("chat_message").insert(legacy_payload).execute()
        message = normalize_message_row(result.data[0])
        message["attachments"] = list(attachments or [])
        return message


async def list_uploaded_files(supabase: AsyncClient, project_id: str) -> list[dict]:
    try:
        rows = (
            await supabase.table("uploaded_file")
            .select("*")
            .eq("project_id", project_id)
            .eq("purpose", "source")
            .order("created_at", desc=True)
            .execute()
        ).data
    except APIError as error:
        if not is_missing_uploaded_file_column(error, "purpose"):
            raise
        try:
            rows = (
                await supabase.table("uploaded_file")
                .select("*")
                .eq("project_id", project_id)
                .eq("is_ai_context", True)
                .order("created_at", desc=True)
                .execute()
            ).data
        except APIError as legacy_error:
            if not is_missing_uploaded_file_column(legacy_error, "is_ai_context"):
                raise
            rows = (
                await supabase.table("uploaded_file")
                .select("*")
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .execute()
            ).data
    normalized_rows = [normalize_uploaded_file_row(row) for row in rows]
    return [row for row in normalized_rows if row["purpose"] == "source"]


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
    purpose: Literal["chat", "source"] = "source",
) -> dict:
    ensure_storage_path_scope(project_id, session_id, storage_path)
    is_ai_context = purpose == "source"
    payload = {
        "project_id": project_id,
        "session_id": session_id,
        "filename": filename.strip(),
        "mime_type": mime_type.strip(),
        "storage_path": storage_path.strip(),
        "size_bytes": size_bytes,
        "purpose": purpose,
        "is_ai_context": is_ai_context,
    }
    try:
        result = await supabase.table("uploaded_file").insert(payload).execute()
    except APIError as error:
        missing_filename = is_missing_uploaded_file_column(error, "filename")
        missing_size_bytes = is_missing_uploaded_file_column(error, "size_bytes")
        missing_purpose = is_missing_uploaded_file_column(error, "purpose")
        missing_is_ai_context = is_missing_uploaded_file_column(error, "is_ai_context")

        if not (missing_filename or missing_size_bytes or missing_purpose or missing_is_ai_context):
            raise

        fallback_payload = {
            "project_id": project_id,
            "session_id": session_id,
            "filename": filename.strip(),
            "mime_type": mime_type.strip(),
            "storage_path": storage_path.strip(),
            "size_bytes": size_bytes,
        }

        if not missing_filename and not missing_size_bytes:
            try:
                result = await supabase.table("uploaded_file").insert(fallback_payload).execute()
                legacy_row = normalize_uploaded_file_row(result.data[0])
                legacy_row["purpose"] = purpose
                legacy_row["is_ai_context"] = is_ai_context
                return legacy_row
            except APIError as retry_error:
                if not (
                    is_missing_uploaded_file_column(retry_error, "filename")
                    or is_missing_uploaded_file_column(retry_error, "size_bytes")
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
        legacy_row["purpose"] = purpose
        legacy_row["is_ai_context"] = is_ai_context
        return legacy_row

    return normalize_uploaded_file_row(result.data[0])


async def promote_uploaded_file_to_ai_context(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> tuple[dict, bool]:
    rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", uploaded_file_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise UploadedFileNotFound()

    uploaded_file = normalize_uploaded_file_row(rows[0])
    if uploaded_file["is_ai_context"]:
        return uploaded_file, False

    try:
        updated = (
            await supabase.table("uploaded_file")
            .update({"purpose": "source", "is_ai_context": True})
            .eq("project_id", project_id)
            .eq("id", uploaded_file_id)
            .execute()
        ).data
        return normalize_uploaded_file_row(updated[0]), True
    except APIError as error:
        if not (
            is_missing_uploaded_file_column(error, "purpose")
            or is_missing_uploaded_file_column(error, "is_ai_context")
        ):
            raise
        raise BadRequest(
            message="Adding chat attachments to Sources requires the latest database migration."
        ) from error


def build_storage_path(project_id: str, session_id: str, filename: str) -> str:
    return build_storage_path_for_purpose(project_id, session_id, filename, "source")


def build_storage_path_for_purpose(
    project_id: str,
    session_id: str,
    filename: str,
    purpose: Literal["chat", "source"],
) -> str:
    safe_filename = filename.replace("\\", "-").replace("/", "-").strip()
    return str(PurePosixPath(project_id) / session_id / purpose / f"{uuid4()}-{safe_filename}")


async def create_signed_upload(
    supabase: AsyncClient,
    *,
    project_id: str,
    session_id: str,
    filename: str,
    purpose: Literal["chat", "source"] = "source",
) -> UploadUrlOut:
    storage_path = build_storage_path_for_purpose(project_id, session_id, filename, purpose)
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


async def create_signed_file_access_url(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
    expires_in: int = 3600,
) -> FileAccessUrlOut:
    rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", uploaded_file_id)
        .limit(1)
        .execute()
    ).data
    if not rows:
        raise UploadedFileNotFound()

    uploaded_file = normalize_uploaded_file_row(rows[0])
    response = supabase.storage.from_(UPLOAD_BUCKET).create_signed_url(
        uploaded_file["storage_path"], expires_in
    )
    if isawaitable(response):
        response = await response

    signed_url = None
    if isinstance(response, dict):
        signed_url = response.get("signedURL") or response.get("signed_url")
    else:
        signed_url = getattr(response, "signedURL", None) or getattr(response, "signed_url", None)

    if not signed_url:
        raise BadRequest(message="Unable to generate a signed access URL for this file.")

    return FileAccessUrlOut(signed_url=signed_url)
