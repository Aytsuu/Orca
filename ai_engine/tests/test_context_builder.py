from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.context.builder import ContextBuilder
from src.context.retrieval import KeywordRetrievalStrategy


@pytest.mark.asyncio
async def test_context_builder_only_loads_requested_messages(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    first = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "old"},
    )
    second = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "new"},
    )
    fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "frontend QA owner missing",
            "source_message_ids": [second["id"]],
            "confidence": "medium",
        },
    )

    builder = ContextBuilder(fake_supabase)
    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[second["id"]],
    )

    assert [message["id"] for message in context.new_messages] == [second["id"]]
    assert first["id"] not in [message["id"] for message in context.new_messages]
    chat_message_queries = [
        query for query in fake_supabase.query_history if query["table_name"] == "chat_message"
    ]
    assert ("id", ("in", [second["id"]])) in chat_message_queries[-1]["filters"]


@pytest.mark.asyncio
async def test_context_builder_caps_requested_messages_to_latest_fifty(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    requested_ids: list[str] = []

    for index in range(55):
        message = fake_supabase.insert_row(
            "chat_message",
            {
                "project_id": project["id"],
                "session_id": "alpha",
                "content": f"message-{index}",
                "created_at": f"2026-06-30T00:00:{index:02d}+00:00",
            },
        )
        requested_ids.append(message["id"])

    builder = ContextBuilder(fake_supabase)
    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=requested_ids,
    )

    assert len(context.new_messages) == 50
    assert [message["content"] for message in context.new_messages] == [
        f"message-{index}" for index in range(5, 55)
    ]


class RecordingRetrievalStrategy:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows
        self.calls: list[dict] = []

    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int,
    ) -> list[dict]:
        self.calls.append(
            {
                "project_id": project_id,
                "query_messages": query_messages,
                "limit": limit,
            }
        )
        return self.rows[:limit]


@pytest.mark.asyncio
async def test_context_builder_uses_configured_memory_and_summary_limits(
    fake_supabase,
    monkeypatch,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Need launch QA owner"},
    )
    retrieval_rows = [{"content": f"memory-{index}"} for index in range(12)]
    retrieval_strategy = RecordingRetrievalStrategy(retrieval_rows)
    for index in range(7):
        fake_supabase.insert_row(
            "conversation_summary",
            {
                "project_id": project["id"],
                "summary": f"summary-{index}",
                "source_message_ids": [message["id"]],
            },
        )

    monkeypatch.setattr(
        "src.context.builder.get_settings",
        lambda: SimpleNamespace(
            context_warning_tokens=100000,
            context_memory_limit=3,
            context_summary_limit=2,
        ),
    )

    builder = ContextBuilder(fake_supabase, retrieval_strategy=retrieval_strategy)
    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[message["id"]],
    )

    assert retrieval_strategy.calls[0]["limit"] == 3
    assert len(context.memory) == 3
    assert len(context.summaries) == 2


@pytest.mark.asyncio
async def test_keyword_retrieval_returns_only_positive_overlap_rows(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    matching_memory = fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "Need QA owner before launch",
            "source_message_ids": ["msg-1"],
            "confidence": "medium",
            "updated_at": "2026-06-30T01:00:00+00:00",
        },
    )
    fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "Backlog grooming roadmap items",
            "source_message_ids": ["msg-2"],
            "confidence": "medium",
            "updated_at": "2026-06-30T02:00:00+00:00",
        },
    )

    strategy = KeywordRetrievalStrategy(fake_supabase)
    rows = await strategy.retrieve(
        project["id"],
        [{"id": "msg-3", "content": "Assign QA owner for launch readiness"}],
        limit=10,
    )

    assert rows == [matching_memory]


@pytest.mark.asyncio
async def test_keyword_retrieval_returns_empty_when_no_overlap(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "Backlog grooming roadmap items",
            "source_message_ids": ["msg-1"],
            "confidence": "medium",
            "updated_at": "2026-06-30T02:00:00+00:00",
        },
    )

    strategy = KeywordRetrievalStrategy(fake_supabase)
    rows = await strategy.retrieve(
        project["id"],
        [{"id": "msg-2", "content": "Assign QA owner for launch readiness"}],
        limit=10,
    )

    assert rows == []
