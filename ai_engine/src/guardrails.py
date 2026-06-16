from __future__ import annotations

from collections.abc import Iterable

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
