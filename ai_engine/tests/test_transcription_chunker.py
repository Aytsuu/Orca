from __future__ import annotations

from src.transcription.chunker import chunk_text


def _make_text(word_count: int) -> str:
    return " ".join(f"w{i}" for i in range(word_count))


def _estimate_chunk_tokens(chunk: str) -> int:
    return sum(max(1, (len(word) + 3) // 4) for word in chunk.split())


def test_chunk_text_respects_max_tokens_boundary() -> None:
    text = _make_text(1000)

    chunks = chunk_text(text, max_tokens=50, overlap=10)

    assert len(chunks) > 1
    assert all(chunk.strip() for chunk in chunks)
    assert all(_estimate_chunk_tokens(chunk) <= 50 for chunk in chunks)


def test_chunk_text_preserves_overlap_between_adjacent_chunks() -> None:
    text = _make_text(180)

    chunks = chunk_text(text, max_tokens=40, overlap=8)

    assert len(chunks) > 1
    for previous, current in zip(chunks, chunks[1:], strict=False):
        assert previous.split()[-8:] == current.split()[:8]


def test_chunk_text_returns_empty_list_for_whitespace_only_input() -> None:
    assert chunk_text("   \n\t  ", max_tokens=40, overlap=8) == []


def test_chunk_text_prefers_sentence_boundaries_when_possible() -> None:
    text = "Alpha owns setup. Beta owns QA. Gamma owns launch."

    chunks = chunk_text(text, max_tokens=10, overlap=2)

    assert len(chunks) == 2
    assert chunks[0].endswith("QA.")
    assert chunks[1].endswith("launch.")
