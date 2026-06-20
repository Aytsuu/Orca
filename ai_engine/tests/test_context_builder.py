from __future__ import annotations

import pytest

from src.context.builder import ContextBuilder


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
