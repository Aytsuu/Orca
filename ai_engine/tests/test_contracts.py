from __future__ import annotations

import pytest
from pydantic import ValidationError

from src.agents.schemas import PlannerOutput
from src.exceptions import InvalidOutputError
from src.guardrails import (
    collect_context_source_message_ids,
    ensure_remove_actions_are_explicit,
    validate_source_message_ids,
)


def test_planner_contract_rejects_missing_citations() -> None:
    with pytest.raises(ValidationError):
        PlannerOutput.model_validate(
            {
                "changes": [
                    {
                        "id": "c1",
                        "section": "tasks",
                        "action": "add",
                        "content": {"title": "Ship"},
                        "justification": "Needed",
                        "source_message_ids": [],
                        "confidence": "medium",
                    }
                ]
            }
        )


def test_validate_source_message_ids_rejects_fabricated_ids() -> None:
    with pytest.raises(InvalidOutputError):
        validate_source_message_ids(["m1"], ["m1", "m2"])


def test_collect_context_source_message_ids_includes_nested_context_citations() -> None:
    valid_ids = collect_context_source_message_ids(
        messages=[{"id": "m-new", "content": "latest"}],
        memory=[{"source_message_ids": ["m-old"]}],
        summaries=[{"source_message_ids": ["m-summary"]}],
        current_plan={
            "phases": [
                {
                    "tasks": [
                        {"source_message_ids": ["m-task"]},
                        {"sourceMessageIds": ["m-task-camel"]},
                    ],
                    "gaps": [{"source_message_ids": ["m-gap"]}],
                }
            ],
            "global_risks": [{"source_message_ids": ["m-risk"]}],
        },
    )

    assert valid_ids == {
        "m-new",
        "m-old",
        "m-summary",
        "m-task",
        "m-task-camel",
        "m-gap",
        "m-risk",
    }


def test_guardrail_rejects_unsupported_remove_without_explicit_request() -> None:
    with pytest.raises(InvalidOutputError):
        ensure_remove_actions_are_explicit(
            [{"section": "tasks", "action": "remove", "content": ["old"]}],
            [{"id": "m1", "content": "please update the schedule"}],
        )
