from __future__ import annotations

import re
import unicodedata
from typing import Any

from src.context.builder import AssembledContext

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
_ACTION_HINTS = {
    "add",
    "remove",
    "update",
    "change",
    "need",
    "ship",
    "assign",
    "owner",
    "deadline",
    "risk",
    "phase",
    "task",
    "objective",
    "approve",
    "reject",
}
_MULTISPACE_RE = re.compile(r"\s+")
_REPEATED_CHARACTER_RE = re.compile(r"^(.)\1{3,}$")
_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def normalize_message_text(content: str) -> str:
    normalized = unicodedata.normalize("NFKC", content or "")
    return _MULTISPACE_RE.sub(" ", normalized).strip()


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


def is_obviously_actionable(content: str) -> bool:
    normalized = normalize_message_text(content)
    lowered = normalized.casefold()
    token_count = len(_TOKEN_RE.findall(lowered))
    if token_count >= 4:
        return True
    if any(hint in lowered for hint in _ACTION_HINTS):
        return True
    if "?" in normalized and token_count >= 2:
        return True
    return False


def split_messages_by_signal(messages: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    meaningful: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    for message in messages:
        should_consider, _reason = classify_message_for_agent_trigger(str(message.get("content") or ""))
        if not should_consider:
            continue
        if is_obviously_actionable(str(message.get("content") or "")):
            meaningful.append(message)
            continue
        ambiguous.append(message)
    return meaningful, ambiguous


def build_relevance_prompt_context(context: AssembledContext) -> dict[str, Any]:
    return {
        "project_id": context.project_id,
        "new_messages": [
            {
                "id": message["id"],
                "content": normalize_message_text(str(message.get("content") or "")),
            }
            for message in context.new_messages
        ],
        "memory": [
            {
                "kind": item.get("kind"),
                "content": item.get("content"),
                "source_message_ids": list(item.get("source_message_ids") or []),
            }
            for item in context.memory[:5]
        ],
        "current_plan_summary": {
            "title": (context.current_plan or {}).get("title"),
            "description": (context.current_plan or {}).get("description"),
        },
    }
