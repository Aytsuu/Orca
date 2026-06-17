from __future__ import annotations

from src.agents.schemas import (
    AnalyzerOutput,
    MonitorOutput,
    PlannerOutput,
    SafetyCheckOutput,
)


def _find_unconstrained_schema_paths(schema: object, path: str = "$") -> list[str]:
    if isinstance(schema, dict):
        problems: list[str] = []
        if schema == {}:
            problems.append(path)
        if schema.get("additionalProperties") is True:
            problems.append(f"{path}.additionalProperties")
        for key, value in schema.items():
            problems.extend(_find_unconstrained_schema_paths(value, f"{path}.{key}"))
        return problems
    if isinstance(schema, list):
        problems = []
        for index, value in enumerate(schema):
            problems.extend(_find_unconstrained_schema_paths(value, f"{path}[{index}]"))
        return problems
    return []


def test_agent_output_schemas_do_not_expose_unconstrained_json_shapes() -> None:
    schemas = [MonitorOutput, AnalyzerOutput, PlannerOutput, SafetyCheckOutput]

    problems = {
        schema.__name__: _find_unconstrained_schema_paths(schema.model_json_schema())
        for schema in schemas
    }

    assert problems == {
        "MonitorOutput": [],
        "AnalyzerOutput": [],
        "PlannerOutput": [],
        "SafetyCheckOutput": [],
    }


def test_planner_output_accepts_flat_content_and_excludes_none_fields() -> None:
    output = PlannerOutput.model_validate(
        {
            "changes": [
                {
                    "id": "chg-1",
                    "section": "tasks",
                    "action": "add",
                    "content": [{"title": "Assign QA owner", "owner": None}],
                    "justification": "Supported by the latest request",
                    "source_message_ids": ["msg-1"],
                    "confidence": "medium",
                }
            ],
            "summary": "Assign QA owner",
        }
    )

    dumped = output.model_dump(mode="json", exclude_none=True)

    assert dumped["changes"][0]["content"] == [{"title": "Assign QA owner"}]
