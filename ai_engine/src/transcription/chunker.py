from __future__ import annotations

import math
import re

TOKEN_ESTIMATE_CHARS = 4
SENTENCE_BOUNDARY_PATTERN = re.compile(r"(?<=[.!?])\s+")


def chunk_text(text: str, max_tokens: int = 400, overlap: int = 50) -> list[str]:
    if max_tokens <= 0:
        raise ValueError("max_tokens must be greater than zero.")
    if overlap < 0 or overlap >= max_tokens:
        raise ValueError("overlap must be non-negative and smaller than max_tokens.")

    normalized = " ".join(str(text or "").split())
    if not normalized:
        return []

    chunks: list[str] = []
    current_words: list[str] = []
    current_tokens = 0

    for sentence in _split_sentences(normalized):
        sentence_words = sentence.split()
        sentence_tokens = _estimate_word_tokens(sentence_words)
        if sentence_tokens > max_tokens:
            if current_words:
                chunks.append(" ".join(current_words))
                current_words = []
                current_tokens = 0
            oversized_chunks = _chunk_words(sentence_words, max_tokens, overlap)
            chunks.extend(oversized_chunks[:-1])
            current_words = oversized_chunks[-1].split() if oversized_chunks else []
            current_tokens = _estimate_word_tokens(current_words)
            continue
        if not current_words:
            current_words = sentence_words
            current_tokens = sentence_tokens
            continue

        if current_tokens + sentence_tokens <= max_tokens:
            current_words.extend(sentence_words)
            current_tokens += sentence_tokens
            continue

        chunks.append(" ".join(current_words))
        overlap_words = _tail_words_within_token_budget(current_words, overlap)
        current_words = overlap_words + sentence_words
        while current_words and _estimate_word_tokens(current_words) > max_tokens:
            current_words.pop(0)
        current_tokens = _estimate_word_tokens(current_words)

    if current_words:
        chunks.append(" ".join(current_words))
    return chunks


def _split_sentences(text: str) -> list[str]:
    return [
        sentence.strip()
        for sentence in SENTENCE_BOUNDARY_PATTERN.split(text)
        if sentence.strip()
    ]


def _chunk_words(words: list[str], max_tokens: int, overlap: int) -> list[str]:
    if not words:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(words):
        end = _max_window_end(words, start, max_tokens)
        window = words[start:end]
        chunks.append(" ".join(window))
        if end >= len(words):
            break
        overlap_words = _tail_words_within_token_budget(window, overlap)
        start = end - len(overlap_words) if overlap_words else end
    return chunks


def _max_window_end(words: list[str], start: int, max_tokens: int) -> int:
    total = 0
    end = start
    while end < len(words):
        word_tokens = _estimate_tokens(words[end])
        if end > start and total + word_tokens > max_tokens:
            break
        total += word_tokens
        end += 1
        if total >= max_tokens:
            break
    return end


def _tail_words_within_token_budget(words: list[str], token_budget: int) -> list[str]:
    if token_budget <= 0 or not words:
        return []

    selected: list[str] = []
    total = 0
    for word in reversed(words):
        word_tokens = _estimate_tokens(word)
        if selected and total + word_tokens > token_budget:
            break
        if not selected and word_tokens > token_budget:
            return [word]
        selected.append(word)
        total += word_tokens
    selected.reverse()
    return selected


def _estimate_word_tokens(words: list[str]) -> int:
    return sum(_estimate_tokens(word) for word in words)


def _estimate_tokens(text: str) -> int:
    normalized = str(text or "").strip()
    if not normalized:
        return 0
    return max(1, math.ceil(len(normalized) / TOKEN_ESTIMATE_CHARS))
