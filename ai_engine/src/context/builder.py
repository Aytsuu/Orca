from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from supabase import AsyncClient

from src.config import get_settings
from src.context.retrieval import KeywordRetrievalStrategy, RetrievalStrategy


@dataclass
class AssembledContext:
    project_id: str
    run_id: str
    current_plan: dict[str, Any] | None
    new_messages: list[dict[str, Any]]
    memory: list[dict[str, Any]]
    summaries: list[dict[str, Any]]
    files: list[dict[str, Any]]
    token_estimate: int
    warnings: list[str]


class ContextBuilder:
    def __init__(
        self,
        supabase: AsyncClient,
        retrieval_strategy: RetrievalStrategy | None = None,
    ) -> None:
        self._supabase = supabase
        self._retrieval_strategy = retrieval_strategy or KeywordRetrievalStrategy(supabase)
        self._settings = get_settings()

    async def build(
        self,
        *,
        project_id: str,
        run_id: str,
        message_ids: list[str],
        file_ids: list[str] | None = None,
    ) -> AssembledContext:
        current_plan = await self._get_current_plan(project_id)
        new_messages = await self._get_messages(project_id, message_ids)
        memory = await self._retrieval_strategy.retrieve(project_id, new_messages, limit=20)
        summaries = await self._get_summaries(project_id, limit=10)
        files = await self._get_files(project_id, file_ids or [])

        assembled = {
            "plan": current_plan or {},
            "messages": new_messages,
            "memory": memory,
            "summaries": summaries,
            "files": files,
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
            files=files,
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

    async def _get_files(self, project_id: str, file_ids: list[str]) -> list[dict[str, Any]]:
        if not file_ids:
            return []
        rows = (
            await self._supabase.table("uploaded_file")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .execute()
        ).data
        requested_ids = set(file_ids)
        filtered = [row for row in rows if row["id"] in requested_ids]
        return [
            {
                "id": row["id"],
                "storage_path": row["storage_path"],
                "mime_type": row["mime_type"],
            }
            for row in filtered
        ]
