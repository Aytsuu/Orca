from __future__ import annotations

import re
from dataclasses import dataclass
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
        return [row for score, row in scored if score > 0][:limit]
