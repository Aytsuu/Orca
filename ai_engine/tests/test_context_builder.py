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


@pytest.mark.asyncio
async def test_context_builder_populates_transcript_chunks_from_query_driven_retrieval(
    fake_supabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Find the roadmap owner in the uploaded source.",
        },
    )
    builder = ContextBuilder(fake_supabase)

    async def _fake_get_transcript_chunks(
        project_id: str,
        query_messages: list[dict],
    ) -> list[dict]:
        assert project_id == project["id"]
        assert [item["id"] for item in query_messages] == [message["id"]]
        return [
            {
                "chunk_text": "Roadmap owner: Jan Doe.",
                "uploaded_file_id": "file-1",
                "chunk_index": 0,
                "similarity": 0.92,
            }
        ]

    monkeypatch.setattr(
        builder,
        "_get_transcript_chunks",
        _fake_get_transcript_chunks,
        raising=False,
    )

    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[message["id"]],
    )

    assert context.transcript_chunks == [
        {
            "chunk_text": "Roadmap owner: Jan Doe.",
            "uploaded_file_id": "file-1",
            "chunk_index": 0,
            "similarity": 0.92,
        }
    ]
