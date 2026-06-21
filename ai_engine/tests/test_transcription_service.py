from __future__ import annotations

from datetime import datetime, timezone

import pytest

from src.config import get_settings
from src.transcription.extractor import ExtractionResult, UnsupportedMimeType
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
    def __init__(self, result: ExtractionResult | Exception) -> None:
        self._result = result

    async def extract(self, file_bytes: bytes, mime_type: str) -> ExtractionResult:
        del file_bytes, mime_type
        if isinstance(self._result, Exception):
            raise self._result
        return self._result


class FakeEmbedder:
    def __init__(self, embeddings: list[list[float]] | Exception) -> None:
        self.calls: list[list[str]] = []
        self._embeddings = embeddings

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        if isinstance(self._embeddings, Exception):
            raise self._embeddings
        return self._embeddings


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_persists_ready_transcript_and_chunks(fake_supabase) -> None:
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
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"transcript body"})
    extractor = FakeExtractor(ExtractionResult(text="alpha beta gamma delta", method="plaintext"))
    embedder = FakeEmbedder([[0.1, 0.2], [0.3, 0.4]])

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=extractor,
        embedder=embedder,
        chunk_text_fn=lambda text, max_tokens, overlap: ["alpha beta", "beta gamma delta"],
    )

    transcript = fake_supabase.tables["source_transcript"][0]
    assert transcript["project_id"] == project["id"]
    assert transcript["uploaded_file_id"] == uploaded_file["id"]
    assert transcript["status"] == "ready"
    assert transcript["extraction_method"] == "plaintext"
    assert transcript["plain_text"] == "alpha beta gamma delta"
    assert embedder.calls == [["alpha beta", "beta gamma delta"]]

    chunks = fake_supabase.tables["source_transcript_chunk"]
    assert [chunk["chunk_index"] for chunk in chunks] == [0, 1]
    assert all(chunk["project_id"] == project["id"] for chunk in chunks)
    assert all(chunk["embedding"] is not None for chunk in chunks)


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_marks_unsupported_without_creating_chunks(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    uploaded_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "payload.exe",
            "mime_type": "application/octet-stream",
            "storage_path": f"{project['id']}/alpha/source/payload.exe",
            "size_bytes": 32,
            "purpose": "source",
            "is_ai_context": True,
        },
    )
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"MZ"})
    extractor = FakeExtractor(UnsupportedMimeType("application/octet-stream"))
    embedder = FakeEmbedder([])

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=extractor,
        embedder=embedder,
        chunk_text_fn=lambda text, max_tokens, overlap: [text],
    )

    transcript = fake_supabase.tables["source_transcript"][0]
    assert transcript["status"] == "unsupported"
    assert "application/octet-stream" in transcript["error_message"]
    assert fake_supabase.tables["source_transcript_chunk"] == []
    assert embedder.calls == []


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_uses_purpose_as_eligibility_source_of_truth(
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
            "is_ai_context": False,
        },
    )
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"brief"})

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=FakeExtractor(ExtractionResult(text="Ready text.", method="plaintext")),
        embedder=FakeEmbedder([[1.0, 0.0]]),
    )

    assert fake_supabase.tables["source_transcript"][0]["status"] == "ready"


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_returns_early_when_ready_chunks_already_exist(
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
    transcript = fake_supabase.insert_row(
        "source_transcript",
        {
            "project_id": project["id"],
            "uploaded_file_id": uploaded_file["id"],
            "status": "ready",
            "plain_text": "cached text",
            "extraction_method": "plaintext",
        },
    )
    fake_supabase.insert_row(
        "source_transcript_chunk",
        {
            "transcript_id": transcript["id"],
            "project_id": project["id"],
            "chunk_index": 0,
            "chunk_text": "cached text",
            "embedding": [0.1, 0.2],
        },
    )
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"updated transcript body"})
    extractor = FakeExtractor(ExtractionResult(text="new text", method="plaintext"))
    embedder = FakeEmbedder([[0.5, 0.6]])

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=extractor,
        embedder=embedder,
        chunk_text_fn=lambda text, max_tokens, overlap: [text],
    )

    assert fake_supabase.tables["source_transcript"][0]["plain_text"] == "cached text"
    assert embedder.calls == []


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_marks_failed_when_budget_is_exhausted_for_media(
    fake_supabase,
) -> None:
    settings = get_settings()
    usage_date = datetime.now(timezone.utc).date().isoformat()
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    uploaded_file = fake_supabase.insert_row(
        "uploaded_file",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "filename": "brief.png",
            "mime_type": "image/png",
            "storage_path": f"{project['id']}/alpha/source/brief.png",
            "size_bytes": 64,
            "purpose": "source",
            "is_ai_context": True,
        },
    )
    fake_supabase.insert_row(
        "project_llm_usage",
        {
            "project_id": project["id"],
            "date": usage_date,
            "call_count": settings.daily_llm_budget_per_project,
        },
    )
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"\x89PNG"})
    extractor = FakeExtractor(ExtractionResult(text="ignored", method="gemini_vision"))
    embedder = FakeEmbedder([])

    await transcribe_uploaded_file(
        fake_supabase,
        project_id=project["id"],
        uploaded_file_id=uploaded_file["id"],
        extractor=extractor,
        embedder=embedder,
        chunk_text_fn=lambda text, max_tokens, overlap: [text],
    )

    transcript = fake_supabase.tables["source_transcript"][0]
    assert transcript["status"] == "failed"
    assert transcript["error_message"] == "Daily LLM budget reached for transcript extraction."
    assert embedder.calls == []


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_marks_failed_and_reraises_extractor_errors(
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
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"transcript body"})
    extractor = FakeExtractor(RuntimeError("extractor exploded"))
    embedder = FakeEmbedder([])

    with pytest.raises(RuntimeError, match="extractor exploded"):
        await transcribe_uploaded_file(
            fake_supabase,
            project_id=project["id"],
            uploaded_file_id=uploaded_file["id"],
            extractor=extractor,
            embedder=embedder,
            chunk_text_fn=lambda text, max_tokens, overlap: [text],
        )

    transcript = fake_supabase.tables["source_transcript"][0]
    assert transcript["status"] == "failed"
    assert transcript["error_message"] == "extractor exploded"


@pytest.mark.asyncio
async def test_transcribe_uploaded_file_marks_failed_and_reraises_embedder_errors(
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
    fake_supabase.storage = FakeStorage({uploaded_file["storage_path"]: b"transcript body"})
    extractor = FakeExtractor(ExtractionResult(text="alpha beta gamma delta", method="plaintext"))
    embedder = FakeEmbedder(RuntimeError("embedder exploded"))

    with pytest.raises(RuntimeError, match="embedder exploded"):
        await transcribe_uploaded_file(
            fake_supabase,
            project_id=project["id"],
            uploaded_file_id=uploaded_file["id"],
            extractor=extractor,
            embedder=embedder,
            chunk_text_fn=lambda text, max_tokens, overlap: [text],
        )

    transcript = fake_supabase.tables["source_transcript"][0]
    assert transcript["status"] == "failed"
    assert transcript["error_message"] == "embedder exploded"
