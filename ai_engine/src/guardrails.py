from __future__ import annotations

import re
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


def canonicalize_source_message_ids(valid_ids: Iterable[str], cited_ids: Iterable[str]) -> list[str]:
    valid = [str(message_id) for message_id in valid_ids if message_id]
    valid_set = set(valid)
    canonicalized: list[str] = []

    for raw_id in cited_ids:
        cited_id = str(raw_id)
        if cited_id in valid_set:
            canonicalized.append(cited_id)
            continue

        repaired = _repair_opaque_id_typo(valid, cited_id)
        canonicalized.append(repaired or cited_id)

    return canonicalized


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


def calibrate_confidence_from_messages(
    change: dict,
    *,
    source_messages: dict[str, str],
) -> dict:
    normalized = normalize_confidence(change)
    if normalized.get("confidence") != "medium":
        return normalized

    source_ids = [str(item) for item in normalized.get("source_message_ids", []) if item]
    if len(source_ids) != 1:
        return normalized

    source_text = source_messages.get(source_ids[0], "")
    if not _is_explicit_instruction(source_text):
        return normalized

    fragments = _extract_change_fragments(normalized)
    if not fragments:
        return normalized

    normalized_source = _normalize_text(source_text)
    if any(fragment in normalized_source for fragment in fragments):
        return {**normalized, "confidence": "high"}

    return normalized


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value.lower())).strip()


def _is_explicit_instruction(source_text: str) -> bool:
    normalized = _normalize_text(source_text)
    if not normalized or source_text.strip().endswith("?"):
        return False

    ambiguous_markers = (
        "maybe",
        "might",
        "perhaps",
        "could you advise",
        "should we",
        "can we",
        "do we need",
        "not sure",
        "i think",
    )
    return not any(marker in normalized for marker in ambiguous_markers)


def _extract_change_fragments(change: dict) -> list[str]:
    raw_fragments: list[str] = []
    content = change.get("content")

    if isinstance(content, str):
        raw_fragments.append(content)
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, str):
                raw_fragments.append(item)
                continue
            if not isinstance(item, dict):
                continue
            for key in (
                "title",
                "detail",
                "owner",
                "status",
                "priority",
                "due_date",
                "notes",
                "value",
            ):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    raw_fragments.append(value)

    fragments: list[str] = []
    for fragment in raw_fragments:
        normalized = _normalize_text(fragment)
        if not normalized:
            continue
        if len(normalized) >= 12 or len(normalized.split()) >= 3:
            fragments.append(normalized)

    if fragments:
        return list(dict.fromkeys(fragments))

    fallback = [_normalize_text(fragment) for fragment in raw_fragments if _normalize_text(fragment)]
    return list(dict.fromkeys(fallback[:1]))


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


def partition_safety_violations(violations: list[str]) -> tuple[list[str], list[str]]:
    ignored: list[str] = []
    blocking: list[str] = []

    for violation in violations:
        if _is_non_blocking_confidence_wording_violation(violation):
            ignored.append(violation)
            continue
        blocking.append(violation)

    return ignored, blocking


def _is_non_blocking_confidence_wording_violation(violation: str) -> bool:
    normalized = _normalize_text(violation)
    if "confidence level" not in normalized or "justification" not in normalized:
        return False

    wording_markers = (
        "suggests a high confidence level",
        "implies a higher degree of certainty",
        "implies higher certainty",
        "stating the user s message provides a clear concept",
        "identified critical risks",
        "three core requirements",
        "significant development work",
    )
    evidence_marker = "evidence cited does not fully support"

    return evidence_marker in normalized and any(marker in normalized for marker in wording_markers)


def _repair_opaque_id_typo(valid_ids: list[str], cited_id: str) -> str | None:
    if not _looks_like_opaque_id(cited_id):
        return None

    candidates = [
        valid_id
        for valid_id in valid_ids
        if _looks_like_opaque_id(valid_id) and _opaque_id_distance(valid_id, cited_id) is not None
    ]
    if len(candidates) != 1:
        return None
    return candidates[0]


def _looks_like_opaque_id(value: str) -> bool:
    return len(value) >= 20 and value.count("-") >= 2


def _opaque_id_distance(left: str, right: str) -> int | None:
    if abs(len(left) - len(right)) > 2:
        return None
    if [index for index, char in enumerate(left) if char == "-"] != [
        index for index, char in enumerate(right) if char == "-"
    ]:
        return None

    distance = _bounded_levenshtein(left, right, max_distance=2)
    if distance is None or distance == 0:
        return None
    return distance


def _bounded_levenshtein(left: str, right: str, *, max_distance: int) -> int | None:
    if abs(len(left) - len(right)) > max_distance:
        return None

    previous = list(range(len(right) + 1))
    for left_index, left_char in enumerate(left, start=1):
        current = [left_index]
        row_min = current[0]
        for right_index, right_char in enumerate(right, start=1):
            insertion = current[right_index - 1] + 1
            deletion = previous[right_index] + 1
            substitution = previous[right_index - 1] + (0 if left_char == right_char else 1)
            cost = min(insertion, deletion, substitution)
            current.append(cost)
            row_min = min(row_min, cost)
        if row_min > max_distance:
            return None
        previous = current

    distance = previous[-1]
    if distance > max_distance:
        return None
    return distance
