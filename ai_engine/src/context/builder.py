from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient

from src.config import get_settings
from src.context.retrieval import (
    KeywordRetrievalStrategy,
    RetrievalStrategy,
    SemanticTranscriptRetrievalStrategy,
)
from src.transcription.embedder import GeminiEmbedder


@dataclass
class AssembledContext:
    project_id: str
    run_id: str
    current_plan: dict[str, Any] | None
    new_messages: list[dict[str, Any]]
    memory: list[dict[str, Any]]
    summaries: list[dict[str, Any]]
    transcript_chunks: list[dict[str, Any]]
    source_manifest: list[dict[str, Any]]
    token_estimate: int
    warnings: list[str]


class ContextBuilder:
    def __init__(
        self,
        supabase: AsyncClient,
        retrieval_strategy: RetrievalStrategy | None = None,
        transcript_retrieval_strategy: SemanticTranscriptRetrievalStrategy | None = None,
    ) -> None:
        self._supabase = supabase
        self._retrieval_strategy = retrieval_strategy or KeywordRetrievalStrategy(supabase)
        self._transcript_retrieval_strategy = transcript_retrieval_strategy
        self._settings = get_settings()

    async def build(
        self,
        *,
        project_id: str,
        run_id: str,
        message_ids: list[str],
    ) -> AssembledContext:
        current_plan = await self._get_current_plan(project_id)
        new_messages = await self._get_messages(project_id, message_ids)
        memory = await self._retrieval_strategy.retrieve(project_id, new_messages, limit=20)
        summaries = await self._get_summaries(project_id, limit=10)
        transcript_chunks = await self._get_transcript_chunks(project_id, new_messages)
        source_manifest = await self._get_source_manifest(project_id)

        assembled = {
            "plan": current_plan or {},
            "messages": new_messages,
            "memory": memory,
            "summaries": summaries,
            "transcript_chunks": transcript_chunks,
            "source_manifest": source_manifest,
        }
        token_estimate = int(len(str(assembled)) / 4)
        warnings: list[str] = []
        if token_estimate > self._settings.context_warning_tokens:
            warnings.append("Context assembly exceeded the warning token threshold.")

        return AssembledContext(
            project_id=project_id,
            run_id=run_id,
            current_plan=current_plan,
            new_messages=new_messages,
            memory=memory,
            summaries=summaries,
            transcript_chunks=transcript_chunks,
            source_manifest=source_manifest,
            token_estimate=token_estimate,
            warnings=warnings,
        )

    async def _get_current_plan(self, project_id: str) -> dict[str, Any] | None:
        rows = (
            await self._supabase.table("project_plan")
            .select("*")
            .eq("project_id", project_id)
            .limit(1)
            .execute()
        ).data
        return rows[0] if rows else None

    async def _get_messages(self, project_id: str, message_ids: list[str]) -> list[dict[str, Any]]:
        rows = (
            await self._supabase.table("chat_message")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        ).data
        requested_ids = set(message_ids)
        filtered = [row for row in rows if row["id"] in requested_ids]
        return filtered[-50:]

    async def _get_summaries(self, project_id: str, limit: int) -> list[dict[str, Any]]:
        rows = (
            await self._supabase.table("conversation_summary")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data
        return rows

    async def _get_transcript_chunks(
        self,
        project_id: str,
        query_messages: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if not query_messages:
            return []
        ready_rows = (
            await self._supabase.table("source_transcript")
            .select("id")
            .eq("project_id", project_id)
            .eq("status", "ready")
            .limit(1)
            .execute()
        ).data
        if not ready_rows:
            return []
        usage_date = datetime.now(timezone.utc).date().isoformat()
        strategy = self._transcript_retrieval_strategy or SemanticTranscriptRetrievalStrategy(
            self._supabase,
            GeminiEmbedder(
                supabase=self._supabase,
                project_id=project_id,
                usage_date=usage_date,
            ),
        )
        return await strategy.retrieve(
            project_id,
            query_messages,
            limit=self._settings.transcript_top_k,
            similarity_threshold=self._settings.transcript_similarity_threshold,
        )

    async def _get_source_manifest(self, project_id: str) -> list[dict[str, Any]]:
        rows = (
            await self._supabase.table("source_transcript")
            .select(
                "uploaded_file_id,extraction_method,plain_text,created_at,"
                "uploaded_file(filename),source_transcript_chunk(count)"
            )
            .eq("project_id", project_id)
            .eq("status", "ready")
            .order("created_at")
            .execute()
        ).data

        manifest: list[dict[str, Any]] = []
        for row in rows:
            uploaded_file = row.get("uploaded_file") or {}
            if isinstance(uploaded_file, list):
                uploaded_file = uploaded_file[0] if uploaded_file else {}
            chunk_count_rows = row.get("source_transcript_chunk") or []
            chunk_count = 0
            if isinstance(chunk_count_rows, list) and chunk_count_rows:
                chunk_count = int(chunk_count_rows[0].get("count") or 0)
            elif isinstance(chunk_count_rows, dict):
                chunk_count = int(chunk_count_rows.get("count") or 0)

            manifest.append(
                {
                    "uploaded_file_id": row.get("uploaded_file_id"),
                    "filename": str(uploaded_file.get("filename") or "file"),
                    "extraction_method": row.get("extraction_method"),
                    "preview": str(row.get("plain_text") or "").strip()[:200],
                    "uploaded_at": row.get("created_at"),
                    "chunks_available": chunk_count,
                }
            )
        return manifest
