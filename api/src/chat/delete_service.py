from __future__ import annotations

from copy import deepcopy
from inspect import isawaitable
from typing import Any

from supabase import AsyncClient

from src.chat.exceptions import UploadedFileNotFound
from src.chat.service import UPLOAD_BUCKET, is_missing_uploaded_file_column, normalize_uploaded_file_row
from src.exceptions import Forbidden
from postgrest.exceptions import APIError


def _chunked(values: list[str], size: int) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


async def _remove_storage_paths(supabase: AsyncClient, storage_paths: list[str]) -> None:
    unique_paths = [path for path in dict.fromkeys(path.strip() for path in storage_paths if path.strip())]
    if not unique_paths:
        return

    bucket = supabase.storage.from_(UPLOAD_BUCKET)
    for chunk in _chunked(unique_paths, 1000):
        response = bucket.remove(chunk)
        if isawaitable(response):
            await response


async def _scrub_chat_message_attachments(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> None:
    try:
        rows = (
            await supabase.table("chat_message")
            .select("*")
            .eq("project_id", project_id)
            .execute()
        ).data
    except APIError as error:
        if not is_missing_uploaded_file_column(error, "attachments"):
            raise
        return

    for row in rows:
        attachments = list(row.get("attachments") or [])
        next_attachments = [
            attachment
            for attachment in attachments
            if str(attachment.get("uploaded_file_id")) != uploaded_file_id
        ]
        if len(next_attachments) == len(attachments):
            continue
        await supabase.table("chat_message").update({"attachments": next_attachments}).eq(
            "id", row["id"]
        ).execute()


async def _scrub_plan_attachments(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> None:
    from src.plans.service import _mutate_plan, _normalize_attachment

    def _mutate(content: dict[str, Any]) -> None:
        for phase in content["phases"]:
            for task in phase["tasks"]:
                task["attachments"] = [
                    _normalize_attachment(attachment)
                    for attachment in task["attachments"]
                    if str(attachment.get("uploaded_file_id")) != uploaded_file_id
                ]

    await _mutate_plan(supabase, project_id=project_id, mutate=_mutate)


async def delete_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
    actor_session_id: str,
    actor_membership: dict[str, Any],
) -> dict[str, Any]:
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
    can_remove = (
        uploaded_file["session_id"] == actor_session_id
        or actor_membership.get("can_approve")
        or actor_membership.get("role") == "creator"
    )
    if not can_remove:
        raise Forbidden("You can only remove your own files unless you can approve project changes.")

    await _remove_storage_paths(supabase, [uploaded_file["storage_path"]])
    await _scrub_chat_message_attachments(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )
    await _scrub_plan_attachments(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )
    await supabase.table("uploaded_file").delete().eq("project_id", project_id).eq(
        "id", uploaded_file_id
    ).execute()
    return deepcopy(uploaded_file)


async def delete_project_storage_objects(supabase: AsyncClient, *, project_id: str) -> None:
    rows = (
        await supabase.table("uploaded_file")
        .select("storage_path")
        .eq("project_id", project_id)
        .execute()
    ).data
    await _remove_storage_paths(
        supabase,
        [str(row.get("storage_path", "")).strip() for row in rows],
    )
