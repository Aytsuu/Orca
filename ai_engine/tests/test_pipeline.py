from __future__ import annotations

import pytest

from src.agents.schemas import AnalyzerOutput, MonitorOutput
from src.llm.fake import FakeJsonLlmClient
from src.pipelines.runner import run_project_pipeline


@pytest.mark.asyncio
async def test_pipeline_short_circuits_after_monitor_when_no_actionable_items(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "hello"},
    )
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "queued",
            "new_message_ids": [message["id"]],
        },
    )
    llm = FakeJsonLlmClient(
        responses=[
            MonitorOutput(summary_candidate="brief summary"),
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert len(results) == 1
    assert results[0].agent == "monitor"
    skipped = [
        row
        for row in fake_supabase.tables["agent_artifact"]
        if row["payload"].get("skipped")
    ]
    assert len(skipped) == 2


@pytest.mark.asyncio
async def test_pipeline_persists_planner_proposal(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Remove the obsolete milestone from the plan",
        },
    )
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "queued",
            "new_message_ids": [message["id"]],
        },
    )
    llm = FakeJsonLlmClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Remove obsolete milestone",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Remove the obsolete milestone",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="requested removal",
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Plan out of date",
                        "detail": "Milestone is obsolete",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "milestones",
                        "action": "remove",
                        "content": ["obsolete"],
                        "justification": "Supported by the latest request",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Remove obsolete milestone",
            },
            {"safe": True, "violations": []},
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor", "analyzer", "planner"]
    assert len(fake_supabase.tables["plan_proposal"]) == 1
    assert fake_supabase.tables["plan_proposal"][0]["status"] == "pending"
