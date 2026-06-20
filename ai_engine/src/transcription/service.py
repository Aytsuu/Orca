from __future__ import annotations

import logging
from datetime import datetime, timezone
from inspect import isawaitable
from typing import Callable

from supabase import AsyncClient

from src.config import get_settings
from src.repository import get_llm_usage, increment_llm_usage
from src.transcription.chunker import chunk_text
from src.transcription.embedder import DailyLlmBudgetExceededError, GeminiEmbedder
from src.transcription.extractor import TranscriptExtractor, UnsupportedMimeType, VideoTooLong

UPLOAD_BUCKET = "orca-uploads"
logger = logging.getLogger(__name__)


async def transcribe_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
    extractor: TranscriptExtractor | None = None,
    embedder: GeminiEmbedder | None = None,
    chunk_text_fn: Callable[[str, int, int], list[str]] = chunk_text,
) -> None:
    settings = get_settings()
    uploaded_file = await _get_uploaded_file(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )
    if not uploaded_file:
        raise ValueError(
            f"Uploaded file {uploaded_file_id} was not found for project {project_id}."
        )
    if not _is_transcript_eligible(uploaded_file):
        logger.info(
            "transcript_skipped project_id=%s uploaded_file_id=%s "
            "reason=ineligible purpose=%s is_ai_context=%s",
            project_id,
            uploaded_file_id,
            uploaded_file.get("purpose"),
            uploaded_file.get("is_ai_context"),
        )
        return

    transcript = await _get_or_create_transcript(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )
    if transcript["status"] == "ready" and await _has_chunks(supabase, transcript["id"]):
        logger.info(
            "transcript_skipped project_id=%s uploaded_file_id=%s "
            "transcript_id=%s reason=already_ready",
            project_id,
            uploaded_file_id,
            transcript["id"],
        )
        return

    transcript = await _update_transcript(
        supabase,
        transcript["id"],
        {
            "status": "processing",
            "extraction_method": None,
            "plain_text": None,
            "total_tokens_estimate": None,
            "error_message": None,
            "updated_at": _utc_now(),
        },
    )

    usage_date = datetime.now(timezone.utc).date().isoformat()
    extractor = extractor or TranscriptExtractor()
    embedder = embedder or GeminiEmbedder(
        supabase=supabase,
        project_id=project_id,
        usage_date=usage_date,
    )
    try:
        logger.info(
            "transcript_processing_started project_id=%s uploaded_file_id=%s "
            "transcript_id=%s mime_type=%s",
            project_id,
            uploaded_file_id,
            transcript["id"],
            uploaded_file.get("mime_type"),
        )
        file_bytes = await _download_file_bytes(uploaded_file["storage_path"], supabase=supabase)
        if _mime_requires_llm(uploaded_file["mime_type"]):
            # Media extraction and chunk embedding are separate LLM calls and intentionally
            # consume the shared project budget independently.
            await _consume_llm_budget(supabase, project_id=project_id, usage_date=usage_date)
        extraction = await extractor.extract(file_bytes, uploaded_file["mime_type"])
        if _mime_requires_llm(uploaded_file["mime_type"]):
            await increment_llm_usage(supabase, project_id=project_id, date=usage_date)

        chunks = chunk_text_fn(
            extraction.text,
            settings.transcript_chunk_max_tokens,
            settings.transcript_chunk_overlap_tokens,
        )
        embeddings = await embedder.embed_batch(chunks) if chunks else []
        if len(embeddings) != len(chunks):
            raise ValueError("Chunk embedding count did not match the chunk count.")

        if chunks:
            await _replace_chunks(
                supabase,
                project_id=project_id,
                transcript_id=transcript["id"],
                chunks=chunks,
                embeddings=embeddings,
            )
        await _update_transcript(
            supabase,
            transcript["id"],
            {
                "status": "ready",
                "extraction_method": extraction.method,
                "plain_text": extraction.text,
                "total_tokens_estimate": max(1, int(len(extraction.text) / 4))
                if extraction.text
                else 0,
                "error_message": None,
                "updated_at": _utc_now(),
            },
        )
        logger.info(
            "transcript_ready project_id=%s uploaded_file_id=%s transcript_id=%s "
            "extraction_method=%s chunk_count=%s embedding_count=%s",
            project_id,
            uploaded_file_id,
            transcript["id"],
            extraction.method,
            len(chunks),
            len(embeddings),
        )
    except (UnsupportedMimeType, VideoTooLong) as exc:
        await _update_transcript(
            supabase,
            transcript["id"],
            {
                "status": "unsupported",
                "error_message": str(exc),
                "updated_at": _utc_now(),
            },
        )
        logger.warning(
            "transcript_unsupported project_id=%s uploaded_file_id=%s transcript_id=%s reason=%s",
            project_id,
            uploaded_file_id,
            transcript["id"],
            str(exc),
        )
    except DailyLlmBudgetExceededError as exc:
        await _update_transcript(
            supabase,
            transcript["id"],
            {
                "status": "failed",
                "error_message": str(exc),
                "updated_at": _utc_now(),
            },
        )
        logger.warning(
            "transcript_failed project_id=%s uploaded_file_id=%s transcript_id=%s "
            "reason=budget_exhausted detail=%s",
            project_id,
            uploaded_file_id,
            transcript["id"],
            str(exc),
        )
    except Exception as exc:
        await _update_transcript(
            supabase,
            transcript["id"],
            {
                "status": "failed",
                "error_message": str(exc),
                "updated_at": _utc_now(),
            },
        )
        logger.exception(
            "transcript_failed project_id=%s uploaded_file_id=%s transcript_id=%s "
            "reason=exception detail=%s",
            project_id,
            uploaded_file_id,
            transcript["id"],
            str(exc),
        )
        raise


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_transcript_eligible(uploaded_file: dict) -> bool:
    return bool(uploaded_file.get("is_ai_context")) and uploaded_file.get("purpose") == "source"


def _mime_requires_llm(mime_type: str) -> bool:
    normalized = str(mime_type or "").lower()
    return normalized.startswith(("audio/", "video/", "image/"))


async def _consume_llm_budget(supabase: AsyncClient, *, project_id: str, usage_date: str) -> None:
    settings = get_settings()
    usage = await get_llm_usage(supabase, project_id=project_id, date=usage_date)
    if usage and usage["call_count"] >= settings.daily_llm_budget_per_project:
        raise DailyLlmBudgetExceededError("Daily LLM budget reached for transcript extraction.")


async def _download_file_bytes(storage_path: str, *, supabase: AsyncClient) -> bytes:
    response = supabase.storage.from_(UPLOAD_BUCKET).download(storage_path)
    if isawaitable(response):
        response = await response
    if isinstance(response, bytes):
        return response
    data = getattr(response, "data", None)
    if isinstance(data, bytes):
        return data
    raise ValueError("Storage download did not return bytes.")


async def _get_uploaded_file(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> dict | None:
    rows = (
        await supabase.table("uploaded_file")
        .select("*")
        .eq("project_id", project_id)
        .eq("id", uploaded_file_id)
        .limit(1)
        .execute()
    ).data
    return rows[0] if rows else None


async def _get_or_create_transcript(
    supabase: AsyncClient,
    *,
    project_id: str,
    uploaded_file_id: str,
) -> dict:
    rows = (
        await supabase.table("source_transcript")
        .select("*")
        .eq("project_id", project_id)
        .eq("uploaded_file_id", uploaded_file_id)
        .limit(1)
        .execute()
    ).data
    if rows:
        return rows[0]
    created = (
        await supabase.table("source_transcript")
        .insert(
            {
                "project_id": project_id,
                "uploaded_file_id": uploaded_file_id,
                "status": "pending",
            }
        )
        .execute()
    ).data[0]
    return created


async def _update_transcript(supabase: AsyncClient, transcript_id: str, payload: dict) -> dict:
    updated = (
        await supabase.table("source_transcript").update(payload).eq("id", transcript_id).execute()
    ).data
    return updated[0]


async def _has_chunks(supabase: AsyncClient, transcript_id: str) -> bool:
    rows = (
        await supabase.table("source_transcript_chunk")
        .select("id")
        .eq("transcript_id", transcript_id)
        .limit(1)
        .execute()
    ).data
    return bool(rows)


async def _replace_chunks(
    supabase: AsyncClient,
    *,
    project_id: str,
    transcript_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
) -> None:
    await (
        supabase.table("source_transcript_chunk")
        .delete()
        .eq(
            "transcript_id",
            transcript_id,
        )
        .execute()
    )
    payload = [
        {
            "transcript_id": transcript_id,
            "project_id": project_id,
            "chunk_index": index,
            "chunk_text": chunk,
            "embedding": embeddings[index],
        }
        for index, chunk in enumerate(chunks)
    ]
    await supabase.table("source_transcript_chunk").insert(payload).execute()
