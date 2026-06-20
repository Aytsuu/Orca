from __future__ import annotations

import pytest

from src.context.builder import ContextBuilder
from src.context.retrieval import SemanticTranscriptRetrievalStrategy
from src.transcription.extractor import ExtractionResult
from src.transcription.service import transcribe_uploaded_file


class FakeBucket:
    def __init__(self, file_bytes_by_path: dict[str, bytes]) -> None:
        self._file_bytes_by_path = file_bytes_by_path

    def download(self, storage_path: str) -> bytes:
        return self._file_bytes_by_path[storage_path]


class FakeStorage:
    def __init__(self, file_bytes_by_path: dict[str, bytes]) -> None:
        self._bucket = FakeBucket(file_bytes_by_path)

    def from_(self, _bucket_name: str) -> FakeBucket:
        return self._bucket


class FakeExtractor:
    def __init__(self, result: ExtractionResult) -> None:
        self._result = result

    async def extract(self, file_bytes: bytes, mime_type: str) -> ExtractionResult:
        del file_bytes, mime_type
        return self._result


class FakeChunkEmbedder:
    async def embed_batch(
        self,
        texts: list[str],
        *,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        assert task_type == "RETRIEVAL_DOCUMENT"
        assert texts == ["Roadmap owner is Jan Doe.", "QA sign-off belongs to Mia Ray."]
        return [[1.0, 0.0], [0.0, 1.0]]


class FakeQueryEmbedder:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def embed_batch(
        self,
        texts: list[str],
        *,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        self.calls.append({"texts": texts, "task_type": task_type})
        return [[1.0, 0.0]]


@pytest.mark.asyncio
async def test_transcript_pipeline_integration_surfaces_ready_chunks_in_context(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    uploaded_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "brief.txt",
            "mime_type": "text/plain",
            "storage_path": f"{project['id']}/alpha/source/brief.txt",
            "size_bytes": 64,
            "purpose": "source",
            "is_ai_context": True,
        },
    )
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Who owns the roadmap?",
        },
    )
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"transcript body"})

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=FakeExtractor(
            ExtractionResult(
                text="Roadmap owner is Jan Doe. QA sign-off belongs to Mia Ray.",
                method="plaintext",
            )
        ),
        embedder=FakeChunkEmbedder(),
        chunk_text_fn=lambda text, max_tokens, overlap: [
            "Roadmap owner is Jan Doe.",
            "QA sign-off belongs to Mia Ray.",
        ],
    )

    query_embedder = FakeQueryEmbedder()
    builder = ContextBuilder(
        fake_supabase,
        transcript_retrieval_strategy=SemanticTranscriptRetrievalStrategy(
            fake_supabase,
            query_embedder,
        ),
    )

    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[message["id"]],
    )

    assert query_embedder.calls == [
        {
            "texts": ["Who owns the roadmap?"],
            "task_type": "RETRIEVAL_QUERY",
        }
    ]
    assert context.transcript_chunks
    assert context.transcript_chunks[0]["chunk_text"] == "Roadmap owner is Jan Doe."
    assert fake_supabase.tables["source_transcript"][0]["status"] == "ready"


@pytest.mark.asyncio
async def test_context_builder_returns_no_transcript_chunks_without_ready_transcripts(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Who owns the roadmap?",
        },
    )
    fake_supabase.insert_row(
        "source_transcript",
        {
            "project_id": project["id"],
            "uploaded_file_id": "file-1",
            "status": "processing",
        },
    )

    builder = ContextBuilder(fake_supabase)
    context = await builder.build(
        project_id=project["id"],
        run_id="run-1",
        message_ids=[message["id"]],
    )

    assert context.transcript_chunks == []
