from __future__ import annotations

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

    def in_(self, column: str, values: list[object]) -> "FakeTableQuery":
        self._filters.append((column, ("in", [str(value) for value in values])))
        return self

    def gt(self, column: str, value: object) -> "FakeTableQuery":
        self._filters.append((column, ("gt", value)))
        return self

    def order(self, column: str, desc: bool = False) -> "FakeTableQuery":
        self._order = (column, desc)
        return self

    def limit(self, value: int) -> "FakeTableQuery":
        self._limit = value
        return self

    async def execute(self) -> FakeExecuteResult:
        self.client.query_history.append(
            {
                "table_name": self.table_name,
                "action": self._action,
                "filters": deepcopy(self._filters),
                "order": self._order,
                "limit": self._limit,
            }
        )
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
        for column, value in self._filters:
            row_value = row.get(column)
            if isinstance(value, tuple) and value[0] == "gt":
                if row_value is None or str(row_value) <= str(value[1]):
                    return False
                continue
            if isinstance(value, tuple) and value[0] == "in":
                if str(row_value) not in value[1]:
                    return False
                continue
            if str(row_value) != str(value):
                return False
        return True


class FakeSupabase:
    def __init__(self) -> None:
        self.query_history: list[dict] = []
        self.tables = {
            "project": [],
            "project_plan": [],
            "chat_message": [],
            "uploaded_file": [],
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

    def insert_row(self, table_name: str, payload: dict) -> dict:
        row = deepcopy(payload)
        row.setdefault("id", str(uuid4()))
        if table_name in {
            "project",
            "chat_message",
            "uploaded_file",
            "conversation_summary",
            "agent_artifact",
            "plan_proposal",
        }:
            row.setdefault("created_at", _iso_now())
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
