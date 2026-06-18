from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from src.exceptions import InvalidOutputError


def sanitize_messages(
    messages: list[dict],
    *,
    max_chars: int = 10000,
    max_messages: int = 50,
) -> list[dict]:
    sanitized = []
    for message in messages[-max_messages:]:
        content = message["content"]
        if len(content) > max_chars:
            content = f"{content[:max_chars]}[truncated]"
        sanitized.append({**message, "content": content})
    return sanitized


def validate_source_message_ids(valid_ids: Iterable[str], cited_ids: Iterable[str]) -> None:
    valid = set(valid_ids)
    invalid = [message_id for message_id in cited_ids if message_id not in valid]
    if invalid:
        raise InvalidOutputError(f"Output cited unknown source_message_ids: {invalid}")


def collect_context_source_message_ids(
    *,
    messages: list[dict[str, Any]],
    memory: list[dict[str, Any]],
    summaries: list[dict[str, Any]],
    current_plan: dict[str, Any] | None,
) -> set[str]:
    valid_ids = {str(message["id"]) for message in messages if message.get("id")}
    valid_ids.update(_extract_source_message_ids(memory))
    valid_ids.update(_extract_source_message_ids(summaries))
    valid_ids.update(_extract_source_message_ids(current_plan))
    return valid_ids


def _extract_source_message_ids(payload: Any) -> set[str]:
    collected: set[str] = set()

    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in {"source_message_ids", "sourceMessageIds"} and isinstance(value, list):
                collected.update(str(item) for item in value if item)
                continue
            collected.update(_extract_source_message_ids(value))
        return collected

    if isinstance(payload, list):
        for item in payload:
            collected.update(_extract_source_message_ids(item))

    return collected


def ensure_remove_actions_are_explicit(changes: list[dict], messages: list[dict]) -> None:
    lowered_messages = " ".join(message["content"].lower() for message in messages)
    for change in changes:
        if (
            change["action"] == "remove"
            and "remove" not in lowered_messages
            and "delete" not in lowered_messages
        ):
            raise InvalidOutputError("Remove actions require explicit conversation evidence.")


def normalize_confidence(change: dict) -> dict:
    if change.get("confidence") == "high" and len(change.get("source_message_ids", [])) <= 1:
        return {**change, "confidence": "medium"}
    return change


def deduplicate_changes(changes: list[dict]) -> list[dict]:
    deduplicated: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for change in changes:
        key = (
            change.get("section", ""),
            change.get("action", ""),
            str(change.get("content")),
        )
        if key in seen:
            continue
        seen.add(key)
        deduplicated.append(change)
    return deduplicated
