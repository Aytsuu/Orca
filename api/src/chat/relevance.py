from __future__ import annotations

import re
import unicodedata

HARD_SKIP_REASON_EMPTY = "empty"
HARD_SKIP_REASON_SYMBOLS_ONLY = "symbols_only"
HARD_SKIP_REASON_REPEATED_CHARACTER = "repeated_character"
HARD_SKIP_REASON_FILLER = "filler"
HARD_SKIP_REASON_MEANINGFUL = "meaningful"

_SAFE_FILLER_MESSAGES = {
    "a",
    "an",
    "the",
    "ok",
    "okay",
    "k",
    "kk",
    "thanks",
    "thank you",
    "thx",
    "ty",
    "hello",
    "hi",
    "test",
}

_MULTISPACE_RE = re.compile(r"\s+")
_REPEATED_CHARACTER_RE = re.compile(r"^(.)\1{3,}$")


def normalize_message_text(content: str) -> str:
    normalized = unicodedata.normalize("NFKC", content or "")
    collapsed = _MULTISPACE_RE.sub(" ", normalized).strip()
    return collapsed


def has_textual_signal(content: str) -> bool:
    return any(character.isalnum() for character in content)


def classify_message_for_agent_trigger(content: str) -> tuple[bool, str]:
    normalized = normalize_message_text(content)
    lowered = normalized.casefold()

    if not normalized:
        return False, HARD_SKIP_REASON_EMPTY
    if not has_textual_signal(normalized):
        return False, HARD_SKIP_REASON_SYMBOLS_ONLY
    if _REPEATED_CHARACTER_RE.fullmatch(lowered):
        return False, HARD_SKIP_REASON_REPEATED_CHARACTER
    if lowered in _SAFE_FILLER_MESSAGES:
        return False, HARD_SKIP_REASON_FILLER
    return True, HARD_SKIP_REASON_MEANINGFUL
