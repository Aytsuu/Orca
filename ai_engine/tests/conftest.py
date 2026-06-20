from __future__ import annotations

import math
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class FakeExecuteResult:
    def __init__(self, data: list[dict]) -> None:
        self.data = data


class FakeRpcQuery:
    def __init__(self, client: "FakeSupabase", function_name: str, payload: dict) -> None:
        self.client = client
        self.function_name = function_name
        self.payload = payload

    async def execute(self) -> FakeExecuteResult:
        if self.function_name != "match_source_transcripts":
            return FakeExecuteResult([])

        project_id = str(self.payload["p_project_id"])
        query_embedding = list(self.payload.get("query_embedding") or [])
        limit = max(int(self.payload.get("match_count", 5)), 1)
        threshold = float(self.payload.get("similarity_threshold", 0.3))

        ready_transcripts = {
            row["id"]: row
            for row in self.client.tables["source_transcript"]
            if str(row.get("project_id")) == project_id and row.get("status") == "ready"
        }
        scored_rows: list[dict] = []
        for chunk in self.client.tables["source_transcript_chunk"]:
            transcript = ready_transcripts.get(chunk.get("transcript_id"))
            embedding = chunk.get("embedding")
            if transcript is None or embedding is None:
                continue
            similarity = _cosine_similarity(query_embedding, list(embedding))
            if similarity < threshold:
                continue
            scored_rows.append(
                {
                    "chunk_id": chunk["id"],
                    "transcript_id": chunk["transcript_id"],
                    "uploaded_file_id": transcript["uploaded_file_id"],
                    "chunk_text": chunk["chunk_text"],
                    "chunk_index": chunk["chunk_index"],
                    "similarity": similarity,
                }
            )
        scored_rows.sort(key=lambda row: row["similarity"], reverse=True)
        return FakeExecuteResult(scored_rows[:limit])


class FakeTableQuery:
    def __init__(self, client: "FakeSupabase", table_name: str) -> None:
        self.client = client
        self.table_name = table_name
        self._action = "select"
        self._payload = None
        self._filters: list[tuple[str, object]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None

    def select(self, _: str = "*") -> "FakeTableQuery":
        return self

    def insert(self, payload):
        self._action = "insert"
        self._payload = payload
        return self

    def update(self, payload: dict) -> "FakeTableQuery":
        self._action = "update"
        self._payload = payload
        return self

    def delete(self) -> "FakeTableQuery":
        self._action = "delete"
        return self

    def eq(self, column: str, value: object) -> "FakeTableQuery":
        self._filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTableQuery":
        self._order = (column, desc)
        return self

    def limit(self, value: int) -> "FakeTableQuery":
        self._limit = value
        return self

    async def execute(self) -> FakeExecuteResult:
        rows = self.client.tables[self.table_name]
        if self._action == "insert":
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = [
                deepcopy(self.client.insert_row(self.table_name, payload))
                for payload in payloads
            ]
            return FakeExecuteResult(inserted)

        matched = [row for row in rows if self._matches(row)]
        if self._action == "update":
            updated = []
            for row in matched:
                row.update(deepcopy(self._payload))
                updated.append(deepcopy(row))
            return FakeExecuteResult(updated)

        if self._action == "delete":
            deleted = [deepcopy(row) for row in matched]
            self.client.tables[self.table_name] = [row for row in rows if row not in matched]
            return FakeExecuteResult(deleted)

        selected = [deepcopy(row) for row in matched]
        if self._order:
            column, desc = self._order
            selected.sort(key=lambda row: row.get(column), reverse=desc)
        if self._limit is not None:
            selected = selected[: self._limit]
        return FakeExecuteResult(selected)

    def _matches(self, row: dict) -> bool:
        return all(str(row.get(column)) == str(value) for column, value in self._filters)


class FakeSupabase:
    def __init__(self) -> None:
        self.tables = {
            "project": [],
            "project_plan": [],
            "chat_message": [],
            "uploaded_file": [],
            "source_transcript": [],
            "source_transcript_chunk": [],
            "agent_status": [],
            "project_memory": [],
            "conversation_summary": [],
            "agent_run": [],
            "agent_artifact": [],
            "plan_proposal": [],
            "project_llm_usage": [],
        }

    def table(self, table_name: str) -> FakeTableQuery:
        return FakeTableQuery(self, table_name)

    def rpc(self, function_name: str, payload: dict) -> FakeRpcQuery:
        return FakeRpcQuery(self, function_name, payload)

    def insert_row(self, table_name: str, payload: dict) -> dict:
        row = deepcopy(payload)
        row.setdefault("id", str(uuid4()))
        if table_name in {
            "project",
            "chat_message",
            "uploaded_file",
            "source_transcript",
            "source_transcript_chunk",
            "conversation_summary",
            "agent_artifact",
            "plan_proposal",
        }:
            row.setdefault("created_at", _iso_now())
        if table_name == "source_transcript":
            row.setdefault("updated_at", _iso_now())
            row.setdefault("status", "pending")
        if table_name == "project_memory":
            row.setdefault("created_at", _iso_now())
            row.setdefault("updated_at", _iso_now())
            row.setdefault("status", "active")
        if table_name == "agent_run":
            row.setdefault("created_at", _iso_now())
            row.setdefault("new_message_ids", [])
            row.setdefault("new_file_ids", [])
        if table_name == "agent_status":
            row.setdefault("updated_at", _iso_now())
        if table_name == "project_llm_usage":
            row.setdefault("call_count", 0)
        self.tables[table_name].append(row)
        return row


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    numerator = sum(a * b for a, b in zip(left, right, strict=False))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return numerator / (left_norm * right_norm)
