from __future__ import annotations

from types import SimpleNamespace

import pytest

from src.transcription.embedder import GeminiEmbedder


class FakeModels:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def embed_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            embeddings=[
                SimpleNamespace(values=[float(index)] * 768)
                for index, _ in enumerate(kwargs["contents"], start=1)
            ]
        )


class FakeAioClient:
    def __init__(self) -> None:
        self.models = FakeModels()


@pytest.mark.asyncio
async def test_gemini_embedder_batches_texts_and_returns_embedding_vectors() -> None:
    fake_client = FakeAioClient()
    embedder = GeminiEmbedder(
        api_key="test-key",
        model="models/text-embedding-004",
        async_client=fake_client,
    )

    embeddings = await embedder.embed_batch(["first chunk", "second chunk"])

    assert len(embeddings) == 2
    assert len(embeddings[0]) == 768
    assert fake_client.models.calls == [
        {
            "model": "models/text-embedding-004",
            "contents": ["first chunk", "second chunk"],
            "config": {"task_type": "RETRIEVAL_DOCUMENT"},
        }
    ]


@pytest.mark.asyncio
async def test_gemini_embedder_allows_overriding_task_type() -> None:
    fake_client = FakeAioClient()
    embedder = GeminiEmbedder(
        api_key="test-key",
        model="models/text-embedding-004",
        async_client=fake_client,
    )

    await embedder.embed_batch(["search text"], task_type="RETRIEVAL_QUERY")

    assert fake_client.models.calls == [
        {
            "model": "models/text-embedding-004",
            "contents": ["search text"],
            "config": {"task_type": "RETRIEVAL_QUERY"},
        }
    ]
