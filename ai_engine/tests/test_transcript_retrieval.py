from __future__ import annotations

import pytest

from src.context.retrieval import SemanticTranscriptRetrievalStrategy


class FakeEmbedder:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

    async def embed_batch(
        self,
        texts: list[str],
        *,
        task_type: str = "RETRIEVAL_DOCUMENT",
    ) -> list[list[float]]:
        self.calls.append({"texts": texts, "task_type": task_type})
        return [[0.1, 0.2, 0.3]]


class FakeRpcResponse:
    def __init__(self, data: list[dict]) -> None:
        self.data = data


class FakeRpcCall:
    def __init__(self, data: list[dict]) -> None:
        self._data = data

    async def execute(self) -> FakeRpcResponse:
        return FakeRpcResponse(self._data)


class FakeSupabase:
    def __init__(self, rpc_rows: list[dict]) -> None:
        self.rpc_calls: list[dict] = []
        self._rpc_rows = rpc_rows

    def rpc(self, function_name: str, payload: dict) -> FakeRpcCall:
        self.rpc_calls.append({"function_name": function_name, "payload": payload})
        return FakeRpcCall(self._rpc_rows)


@pytest.mark.asyncio
async def test_semantic_transcript_retrieval_uses_query_embedding_and_rpc_results() -> None:
    supabase = FakeSupabase(
        [
            {
                "chunk_id": "chunk-2",
                "transcript_id": "transcript-1",
                "uploaded_file_id": "file-2",
                "chunk_text": "Roadmap owner is Jan.",
                "chunk_index": 1,
                "similarity": 0.91,
            },
            {
                "chunk_id": "chunk-1",
                "transcript_id": "transcript-1",
                "uploaded_file_id": "file-1",
                "chunk_text": "QA sign-off is required.",
                "chunk_index": 0,
                "similarity": 0.62,
            },
        ]
    )
    embedder = FakeEmbedder()
    strategy = SemanticTranscriptRetrievalStrategy(supabase, embedder)

    results = await strategy.retrieve(
        "project-1",
        [{"content": "Who owns the roadmap and QA sign-off?"}],
        limit=2,
        similarity_threshold=0.5,
    )

    assert embedder.calls == [
        {
            "texts": ["Who owns the roadmap and QA sign-off?"],
            "task_type": "RETRIEVAL_QUERY",
        }
    ]
    assert supabase.rpc_calls == [
        {
            "function_name": "match_source_transcripts",
            "payload": {
                "p_project_id": "project-1",
                "query_embedding": [0.1, 0.2, 0.3],
                "match_count": 2,
                "similarity_threshold": 0.5,
            },
        }
    ]
    assert [item["uploaded_file_id"] for item in results] == ["file-2", "file-1"]
