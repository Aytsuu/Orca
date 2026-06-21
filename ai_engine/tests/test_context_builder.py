from __future__ import annotations

import pytest

from src.agents.steps import _build_reasoning_context
from src.context.builder import AssembledContext, ContextBuilder


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


@pytest.mark.asyncio
async def test_context_builder_includes_all_ready_sources_in_manifest(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    first_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "requirements.pdf",
        },
    )
    second_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "notes.md",
        },
    )
    pending_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "pending.txt",
        },
    )
    first_transcript = fake_supabase.insert_row(
        "source_transcript",
        {
            "project_id": project["id"],
            "uploaded_file_id": first_file["id"],
            "status": "ready",
            "extraction_method": "pdf",
            "plain_text": "A" * 250,
        },
    )
    fake_supabase.insert_row(
        "source_transcript",
        {
            "project_id": project["id"],
            "uploaded_file_id": second_file["id"],
            "status": "ready",
            "extraction_method": "plaintext",
            "plain_text": "Short notes.",
        },
    )
    fake_supabase.insert_row(
        "source_transcript",
        {
            "project_id": project["id"],
            "uploaded_file_id": pending_file["id"],
            "status": "processing",
            "plain_text": "Not ready.",
        },
    )
    for chunk_index in range(2):
        fake_supabase.insert_row(
            "source_transcript_chunk",
            {
                "transcript_id": first_transcript["id"],
                "project_id": project["id"],
                "chunk_index": chunk_index,
                "chunk_text": f"Chunk {chunk_index}",
            },
        )

    context = await ContextBuilder(fake_supabase).build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[],
    )

    assert [source["filename"] for source in context.source_manifest] == [
        "requirements.pdf",
        "notes.md",
    ]
    assert context.source_manifest[0] == {
        "uploaded_file_id": first_file["id"],
        "filename": "requirements.pdf",
        "extraction_method": "pdf",
        "preview": "A" * 200,
        "uploaded_at": first_transcript["created_at"],
        "chunks_available": 2,
    }


def test_reasoning_context_includes_source_manifest_and_retrieval_counts() -> None:
    context = AssembledContext(
        project_id="project-1",
        run_id="run-1",
        current_plan=None,
        new_messages=[],
        memory=[],
        summaries=[],
        transcript_chunks=[
            {"chunk_text": "Relevant text", "uploaded_file_id": "file-1"},
        ],
        source_manifest=[
            {
                "uploaded_file_id": "file-1",
                "filename": "requirements.pdf",
                "preview": "Requirements preview",
                "extraction_method": "pdf",
                "uploaded_at": "2026-06-21T04:00:00Z",
                "chunks_available": 12,
            },
            {
                "uploaded_file_id": "file-2",
                "filename": "architecture.md",
                "preview": "Architecture preview",
                "extraction_method": "plaintext",
                "uploaded_at": "2026-06-21T05:00:00Z",
                "chunks_available": 3,
            },
        ],
        token_estimate=20,
        warnings=[],
    )

    payload = _build_reasoning_context(context)["context"]

    assert payload["available_sources"] == [
        {
            "filename": "requirements.pdf",
            "preview": "Requirements preview",
            "extraction_method": "pdf",
            "chunks_retrieved": 1,
        },
        {
            "filename": "architecture.md",
            "preview": "Architecture preview",
            "extraction_method": "plaintext",
            "chunks_retrieved": 0,
        },
    ]
