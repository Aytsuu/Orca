from __future__ import annotations

from dataclasses import asdict

import pytest

from src.agents.schemas import MonitorOutput
from src.agents.steps import MonitorStep
from src.context.builder import AssembledContext
from src.llm.fake import FakeJsonLlmClient
from src.prompts.templates import MONITOR_PROMPT


@pytest.mark.asyncio
async def test_monitor_step_uses_slim_serialization_for_prompt_context() -> None:
    context = AssembledContext(
        project_id="project-row-id",
        run_id="run-row-id",
        current_plan={
            "id": "plan-row-id",
            "project_id": "project-row-id",
            "title": "Launch plan",
            "description": "Coordinate release readiness.",
            "objectives": ["This should not be serialized to the monitor prompt."],
            "phases": [
                {
                    "id": "phase-row-id",
                    "title": "Preparation",
                    "description": "Lock launch dependencies.",
                    "created_at": "2026-06-29T10:00:00+00:00",
                    "tasks": [
                        {
                            "id": "task-row-id",
                            "title": "Assign QA owner",
                            "source_message_ids": ["message-prior"],
                        }
                    ],
                }
            ],
            "created_at": "2026-06-29T09:00:00+00:00",
        },
        new_messages=[
            {
                "id": "message-new",
                "content": "Please revisit the QA ownership gap before launch",
                "role": "user",
                "created_at": "2026-06-29T11:00:00+00:00",
                "session_id": "alpha",
            }
        ],
        memory=[
            {
                "id": "memory-row-id",
                "project_id": "project-row-id",
                "kind": "task",
                "content": "QA ownership unresolved before launch",
                "source_message_ids": ["message-prior"],
                "created_at": "2026-06-29T08:00:00+00:00",
                "updated_at": "2026-06-29T08:30:00+00:00",
            }
        ],
        summaries=[
            {
                "id": "summary-row-id",
                "project_id": "project-row-id",
                "summary": "Earlier discussion flagged the unresolved QA owner.",
                "source_message_ids": ["message-prior"],
                "created_at": "2026-06-29T08:45:00+00:00",
                "last_message_created_at": "2026-06-29T08:40:00+00:00",
            }
        ],
        files=[
            {
                "id": "file-row-id",
                "storage_path": "projects/alpha/brief.txt",
                "mime_type": "text/plain",
            }
        ],
        token_estimate=999,
        warnings=["Context assembly exceeded the warning token threshold."],
    )
    expected_output = MonitorOutput(
        tasks=[
            {
                "kind": "task",
                "content": "Revisit QA ownership gap",
                "source_message_ids": ["message-new"],
                "excerpt": "revisit the QA ownership gap",
                "confidence": "medium",
            }
        ],
        summary_candidate="QA ownership needs another pass",
    )
    llm = FakeJsonLlmClient(responses=[expected_output])
    step = MonitorStep(llm)

    result = await step.execute(context, [])

    prompt = llm.calls[0]["prompt"]
    previous_baseline_prompt = MONITOR_PROMPT.format(context=asdict(context))

    assert result.output.model_dump(mode="json") == expected_output.model_dump(mode="json")
    assert result.should_continue is True
    assert len(prompt) < len(previous_baseline_prompt)
    assert "Launch plan" in prompt
    assert "Coordinate release readiness." in prompt
    assert "Preparation" in prompt
    assert "Please revisit the QA ownership gap before launch" in prompt
    assert "'role': 'user'" in prompt
    assert "QA ownership unresolved before launch" in prompt
    assert "Earlier discussion flagged the unresolved QA owner." in prompt
    assert "project-row-id" not in prompt
    assert "run-row-id" not in prompt
    assert "plan-row-id" not in prompt
    assert "phase-row-id" not in prompt
    assert "task-row-id" not in prompt
    assert "memory-row-id" not in prompt
    assert "summary-row-id" not in prompt
    assert "file-row-id" not in prompt
    assert "storage_path" not in prompt
    assert "token_estimate" not in prompt
    assert "warnings" not in prompt
    assert "created_at" not in prompt
    assert "updated_at" not in prompt
    assert "last_message_created_at" not in prompt
    assert "objectives" not in prompt
