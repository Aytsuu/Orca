from __future__ import annotations

import re
from dataclasses import dataclass
from inspect import isawaitable
from typing import Protocol

from supabase import AsyncClient


class RetrievalStrategy(Protocol):
    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int,
    ) -> list[dict]:
        ...


class TranscriptEmbedder(Protocol):
    async def embed_batch(
        self,
        texts: list[str],
        *,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        ...


def _keywords(text: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9]{3,}", text.lower())}


@dataclass
class KeywordRetrievalStrategy:
    supabase: AsyncClient

    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int,
    ) -> list[dict]:
        rows = (
            await self.supabase.table("project_memory")
            .select("*")
            .eq("project_id", project_id)
            .eq("status", "active")
            .order("updated_at", desc=True)
            .execute()
        ).data
        if not rows:
            return []

        query_terms = _keywords(" ".join(message["content"] for message in query_messages))
        scored: list[tuple[int, dict]] = []
        for row in rows:
            overlap = len(query_terms & _keywords(row.get("content", "")))
            scored.append((overlap, row))
        scored.sort(key=lambda item: (item[0], item[1].get("updated_at", "")), reverse=True)
        return [row for score, row in scored if score > 0][:limit] or rows[:limit]


@dataclass
class SemanticTranscriptRetrievalStrategy:
    supabase: AsyncClient
    embedder: TranscriptEmbedder

    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int = 5,
        similarity_threshold: float = 0.3,
    ) -> list[dict]:
        query_text = " ".join(
            str(message.get("content") or "").strip()
            for message in query_messages
            if str(message.get("content") or "").strip()
        ).strip()
        if not query_text:
            return []

        embeddings = await self.embedder.embed_batch(
            [query_text],
            task_type="RETRIEVAL_QUERY",
        )
        if not embeddings:
            return []

        response = self.supabase.rpc(
            "match_source_transcripts",
            {
                "p_project_id": project_id,
                "query_embedding": embeddings[0],
                "match_count": limit,
                "similarity_threshold": similarity_threshold,
            },
        )
        if isawaitable(response):
            response = await response
        execute_result = response.execute()
        if isawaitable(execute_result):
            execute_result = await execute_result
        return list(getattr(execute_result, "data", None) or [])
