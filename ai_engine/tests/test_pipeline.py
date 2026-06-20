from __future__ import annotations

import pytest

from src.agents.schemas import AnalyzerOutput, MonitorOutput, QuestionAnalyzerOutput, RelevanceOutput
from src.context.builder import AssembledContext
from src.exceptions import (
    ConfigurationError,
    InvalidOutputError,
    QuotaExceededError,
    RateLimitError,
    TransportError,
)
from src.llm.fake import FakeJsonLlmClient
from src.pipelines.runner import RetryingBudgetedJsonLlmClient, run_project_pipeline


@pytest.mark.asyncio
async def test_pipeline_short_circuits_after_monitor_when_no_actionable_items(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "add QA owner"},
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
async def test_pipeline_skips_without_llm_for_obvious_filler_messages(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "the"},
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
    llm = FakeJsonLlmClient(responses=[])

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert results == []
    assert llm.calls == []
    skipped_artifacts = [row for row in fake_supabase.tables["agent_artifact"] if row["payload"].get("skipped")]
    assert len(skipped_artifacts) == 3
    assert skipped_artifacts[0]["payload"]["reason"] == "no_meaningful_messages"


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


@pytest.mark.asyncio
async def test_pipeline_repairs_single_character_planner_source_id_typo(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Create a setup guide for the technology stack",
            "id": "d5e117ff-e9ae-4152-b6f1-88e5518d5332",
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
                        "content": "Create setup guide",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Create a setup guide for the technology stack",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Setup guide missing",
                        "detail": "The project still needs a technology stack setup guide.",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-setup-guide",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Create a setup guide for the technology stack"}],
                        "justification": "Explicitly requested in the latest message.",
                        "source_message_ids": ["d5e117ff-e9ae-4152-b6f1-88e518d5332"],
                        "confidence": "high",
                    }
                ],
                "summary": "Add the setup guide task",
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
    assert fake_supabase.tables["plan_proposal"][0]["changes"][0]["source_message_ids"] == [message["id"]]
    assert fake_supabase.tables["plan_proposal"][0]["status"] == "pending"


@pytest.mark.asyncio
async def test_pipeline_appends_new_planner_changes_to_existing_pending_proposal(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Add a QA sign-off task",
        },
    )
    fake_supabase.insert_row(
        "plan_proposal",
        {
            "project_id": project["id"],
            "status": "pending",
            "changes": [
                {
                    "id": "chg-1",
                    "section": "tasks",
                    "action": "add",
                    "content": [{"title": "Existing task"}],
                    "justification": "Earlier approved draft work.",
                    "source_message_ids": [message["id"]],
                    "confidence": "medium",
                }
            ],
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
                        "content": "Add QA sign-off task",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add a QA sign-off task",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="requested qa sign-off task",
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "QA sign-off missing",
                        "detail": "Plan needs an explicit QA sign-off task",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-2",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "QA sign-off task"}],
                        "justification": "Supported by the latest request",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Add QA sign-off task",
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
    assert [change["id"] for change in fake_supabase.tables["plan_proposal"][0]["changes"]] == [
        "chg-1",
        "chg-2",
    ]


@pytest.mark.asyncio
async def test_pipeline_uses_relevance_gate_for_ambiguous_messages(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "可以"},
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
            RelevanceOutput(
                should_trigger=True,
                confidence="medium",
                reason="Short but meaningful confirmation tied to planning context.",
                use_with_previous_context=True,
            ),
            MonitorOutput(summary_candidate="brief summary"),
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor"]
    assert [call["schema"] for call in llm.calls] == ["RelevanceOutput", "MonitorOutput"]


@pytest.mark.asyncio
async def test_pipeline_routes_question_only_monitor_output_to_question_analyzer(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "What should the first phase of the plan focus on?",
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
                open_questions=[
                    {
                        "kind": "detail",
                        "content": "Clarify the first phase focus.",
                        "source_message_ids": [message["id"]],
                        "excerpt": "What should the first phase of the plan focus on?",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="Asked for direction on the first phase.",
            ),
            QuestionAnalyzerOutput(
                interpreted_intent="The user wants guidance on how to shape the first phase.",
                missing_information=["Success criteria for phase one are not defined."],
                clarifying_questions=["Is the first phase primarily discovery, delivery, or validation?"],
                panel_suggestions=["Review the current plan and decide whether phase one is for discovery or execution."],
                source_message_ids=[message["id"]],
            ),
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor", "analyzer"]
    assert [call["schema"] for call in llm.calls] == ["MonitorOutput", "QuestionAnalyzerOutput"]
    analyzer_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "analyzer"
    )
    assert analyzer_artifact["payload"]["mode"] == "question_analyzer"
    assert analyzer_artifact["payload"]["panel_suggestions"] == [
        "Review the current plan and decide whether phase one is for discovery or execution."
    ]
    planner_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "planner"
    )
    assert planner_artifact["payload"] == {"skipped": True, "reason": "no_actionable_input"}
    assert fake_supabase.tables["plan_proposal"] == []


@pytest.mark.asyncio
async def test_pipeline_skips_planner_when_analyzer_flags_unsupported_proposal_sections(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Add a budget section to the plan with cost ranges by phase",
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
                requirements=[
                    {
                        "kind": "requirement",
                        "content": "Add a budget section to the plan",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add a budget section to the plan",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="Requested a budget section.",
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Unsupported section type",
                        "detail": "The requested budget section is not in the allowed proposal section type list.",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ],
                panel_suggestions=[
                    "Keep this as analyzer insight until the API schema supports a budget section."
                ],
                unsupported_proposal_sections=["budget"],
            ),
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor", "analyzer"]
    assert [call["schema"] for call in llm.calls] == ["MonitorOutput", "AnalyzerOutput"]
    planner_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "planner"
    )
    assert planner_artifact["payload"] == {
        "skipped": True,
        "reason": "unsupported_proposal_section",
        "unsupported_proposal_sections": ["budget"],
    }
    assert fake_supabase.tables["plan_proposal"] == []


@pytest.mark.asyncio
async def test_pipeline_allows_analyzer_and_planner_to_cite_ids_from_supplied_context(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    prior_message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "QA ownership is still unresolved for launch",
        },
    )
    new_message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Please revisit the QA ownership gap before launch",
        },
    )
    fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "QA ownership unresolved before launch",
            "source_message_ids": [prior_message["id"]],
            "confidence": "medium",
        },
    )
    fake_supabase.insert_row(
        "conversation_summary",
        {
            "project_id": project["id"],
            "summary": "Earlier discussion flagged the unresolved QA owner",
            "source_message_ids": [prior_message["id"]],
            "last_message_created_at": prior_message["created_at"],
        },
    )
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "queued",
            "new_message_ids": [new_message["id"]],
        },
    )
    llm = FakeJsonLlmClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Revisit QA ownership gap",
                        "source_message_ids": [new_message["id"]],
                        "excerpt": "revisit the QA ownership gap",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="QA ownership needs another pass",
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "QA owner still missing",
                        "detail": "Prior evidence still shows no assigned QA owner for launch.",
                        "severity": "major",
                        "source_message_ids": [prior_message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner before launch"}],
                        "justification": "Historical conversation evidence still supports this gap.",
                        "source_message_ids": [prior_message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
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
    assert fake_supabase.tables["plan_proposal"][0]["changes"][0]["source_message_ids"] == [
        prior_message["id"]
    ]


@pytest.mark.asyncio
async def test_pipeline_sanitizes_analyzer_and_planner_prompt_payload_ids(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    prior_message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "QA ownership is still unresolved for launch",
        },
    )
    new_message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Please revisit the QA ownership gap before launch",
        },
    )
    memory_row = fake_supabase.insert_row(
        "project_memory",
        {
            "project_id": project["id"],
            "kind": "task",
            "content": "QA ownership unresolved before launch",
            "source_message_ids": [prior_message["id"]],
            "confidence": "medium",
        },
    )
    summary_row = fake_supabase.insert_row(
        "conversation_summary",
        {
            "project_id": project["id"],
            "summary": "Earlier discussion flagged the unresolved QA owner",
            "source_message_ids": [prior_message["id"]],
            "last_message_created_at": prior_message["created_at"],
        },
    )
    plan_row = fake_supabase.insert_row(
        "project_plan",
        {
            "project_id": project["id"],
            "phases": [
                {
                    "id": "phase-row-id",
                    "tasks": [
                        {
                            "id": "task-row-id",
                            "title": "Assign QA owner",
                            "source_message_ids": [prior_message["id"]],
                        }
                    ],
                }
            ],
        },
    )
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "queued",
            "new_message_ids": [new_message["id"]],
        },
    )
    llm = FakeJsonLlmClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Revisit QA ownership gap",
                        "source_message_ids": [new_message["id"]],
                        "excerpt": "revisit the QA ownership gap",
                        "confidence": "medium",
                    }
                ],
                summary_candidate="QA ownership needs another pass",
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "QA owner still missing",
                        "detail": "Prior evidence still shows no assigned QA owner for launch.",
                        "severity": "major",
                        "source_message_ids": [prior_message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner before launch"}],
                        "justification": "Historical conversation evidence still supports this gap.",
                        "source_message_ids": [prior_message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
            },
            {"safe": True, "violations": []},
        ]
    )

    await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    analyzer_prompt = next(call["prompt"] for call in llm.calls if call["schema"] == "AnalyzerOutput")
    planner_prompt = next(call["prompt"] for call in llm.calls if call["schema"] == "PlannerOutput")

    for prompt in (analyzer_prompt, planner_prompt):
        assert prior_message["id"] in prompt
        assert new_message["id"] in prompt
        assert prior_message["created_at"] not in prompt
        assert new_message["created_at"] not in prompt
        assert memory_row["id"] not in prompt
        assert summary_row["id"] not in prompt
        assert summary_row["last_message_created_at"] not in prompt
        assert plan_row["id"] not in prompt
        assert project["id"] not in prompt
        assert run["id"] not in prompt
        assert "phase-row-id" not in prompt
        assert "task-row-id" not in prompt
    assert "treat missing task descriptions and missing acceptance criteria as real planning gaps" in analyzer_prompt
    assert 'Treat task descriptions and acceptance_criteria as expected outputs' in planner_prompt
    assert 'leave those fields empty rather than inventing detail' in planner_prompt


@pytest.mark.asyncio
async def test_pipeline_uses_wording_neutral_safety_confidence_rubric(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Assign QA owner before launch",
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
                        "content": "Assign QA owner before launch",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Assign QA owner before launch",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "QA owner missing",
                        "detail": "Launch still needs an assigned QA owner.",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner before launch"}],
                        "justification": "This directly addresses the user's latest request.",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
            },
            {"safe": True, "violations": []},
        ]
    )

    await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    planner_prompt = next(call["prompt"] for call in llm.calls if call["schema"] == "PlannerOutput")
    safety_prompt = next(call["prompt"] for call in llm.calls if call["schema"] == "SafetyCheckOutput")
    assert "Assign confidence from the evidence structure using this rubric" in planner_prompt
    assert "single explicit and unambiguous instruction" in planner_prompt
    assert "Judge confidence from the evidence structure" in safety_prompt
    assert "Do not treat phrases such as" in safety_prompt
    assert "directly reflects" in safety_prompt
    assert "high: multiple consistent citations" in safety_prompt
    assert "medium: a single citation with reasonable support" in safety_prompt
    assert "Only mark a confidence mismatch" in safety_prompt


@pytest.mark.asyncio
async def test_pipeline_upgrades_direct_single_message_instruction_to_high_confidence(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Assign QA owner before launch",
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
                        "content": "Assign QA owner before launch",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Assign QA owner before launch",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "QA owner missing",
                        "detail": "Launch still needs an assigned QA owner.",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner before launch"}],
                        "justification": "This directly addresses the user's latest request.",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
            },
            {"safe": True, "violations": []},
        ]
    )

    await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    proposal = fake_supabase.tables["plan_proposal"][0]
    assert proposal["changes"][0]["confidence"] == "high"


@pytest.mark.asyncio
async def test_pipeline_skips_planner_at_soft_budget(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Add QA owner"},
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
    fake_supabase.insert_row(
        "project_llm_usage",
        {"project_id": project["id"], "date": "2099-01-01", "call_count": 80},
    )
    llm = FakeJsonLlmClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Add QA owner",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add QA owner",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
        usage_date="2099-01-01",
    )

    assert [result.agent for result in results] == ["monitor", "analyzer"]
    assert fake_supabase.tables["plan_proposal"] == []
    planner_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "planner"
    )
    assert planner_artifact["payload"] == {
        "skipped": True,
        "reason": "daily_llm_budget_soft_cap",
    }


class FlakyRateLimitedClient(FakeJsonLlmClient):
    def __init__(self, responses):
        super().__init__(responses)
        self._raised = False

    async def generate_json(self, prompt, schema, *, model, temperature):
        if schema.__name__ == "AnalyzerOutput" and not self._raised:
            self._raised = True
            self.calls.append(
                {
                    "prompt": prompt,
                    "schema": schema.__name__,
                    "model": model,
                    "temperature": temperature,
                }
            )
            raise RateLimitError("rate limited")
        return await super().generate_json(prompt, schema, model=model, temperature=temperature)


class FlakyTransportClient(FakeJsonLlmClient):
    def __init__(self, responses):
        super().__init__(responses)
        self._raised = False

    async def generate_json(self, prompt, schema, *, model, temperature):
        if schema.__name__ == "AnalyzerOutput" and not self._raised:
            self._raised = True
            self.calls.append(
                {
                    "prompt": prompt,
                    "schema": schema.__name__,
                    "model": model,
                    "temperature": temperature,
                }
            )
            raise TransportError("temporary network failure")
        return await super().generate_json(prompt, schema, model=model, temperature=temperature)


class ScriptedClient:
    def __init__(self, script):
        self._script = list(script)
        self.calls = []

    async def generate_json(self, prompt, schema, *, model, temperature):
        self.calls.append(
            {
                "prompt": prompt,
                "schema": schema.__name__,
                "model": model,
                "temperature": temperature,
            }
        )
        response = self._script.pop(0)
        if isinstance(response, Exception):
            raise response
        return schema.model_validate(response)


async def _no_sleep(_: float) -> None:
    return None


@pytest.mark.asyncio
async def test_llm_wrapper_uses_fallback_profile_after_primary_quota_failure(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    primary = ScriptedClient([QuotaExceededError("primary quota exhausted")])
    fallback = ScriptedClient(
        [
            {
                "gaps": [
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": ["msg-1"],
                    }
                ]
            }
        ]
    )
    wrapper = RetryingBudgetedJsonLlmClient(
        primary,
        fallback_client=fallback,
        supabase=fake_supabase,
        project_id=project["id"],
        usage_date="2099-01-01",
        sleep=_no_sleep,
    )

    result = await wrapper.generate_json(
        "analyze",
        AnalyzerOutput,
        model="gemini-2.5-flash",
        temperature=0.1,
    )

    assert result.gaps[0].title == "Missing owner"
    assert [call["model"] for call in primary.calls] == ["gemini-2.5-flash"]
    assert [call["model"] for call in fallback.calls] == ["gemini-2.5-flash"]
    assert fake_supabase.tables["project_llm_usage"][0]["call_count"] == 1
    assert wrapper.last_metadata == {
        "provider_profile": "fallback",
        "model": "gemini-2.5-flash",
        "fallback_used": True,
        "attempt_count": 2,
    }


@pytest.mark.asyncio
async def test_llm_wrapper_uses_fallback_fast_model_after_fallback_rate_limit(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    primary = ScriptedClient([TransportError("primary timeout")])
    fallback = ScriptedClient(
        [
            RateLimitError("fallback rate limited"),
            {
                "gaps": [
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": ["msg-1"],
                    }
                ]
            },
        ]
    )
    wrapper = RetryingBudgetedJsonLlmClient(
        primary,
        fallback_client=fallback,
        supabase=fake_supabase,
        project_id=project["id"],
        usage_date="2099-01-01",
        sleep=_no_sleep,
    )

    await wrapper.generate_json(
        "analyze",
        AnalyzerOutput,
        model="gemini-2.5-flash",
        temperature=0.1,
    )

    assert [call["model"] for call in fallback.calls] == [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]
    assert wrapper.last_metadata["provider_profile"] == "fallback"
    assert wrapper.last_metadata["model"] == "gemini-2.5-flash-lite"


@pytest.mark.asyncio
async def test_llm_wrapper_does_not_fallback_or_count_usage_for_configuration_errors(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    primary = ScriptedClient([ConfigurationError("schema transformation failed")])
    fallback = ScriptedClient([{"gaps": []}])
    wrapper = RetryingBudgetedJsonLlmClient(
        primary,
        fallback_client=fallback,
        supabase=fake_supabase,
        project_id=project["id"],
        usage_date="2099-01-01",
        sleep=_no_sleep,
    )

    with pytest.raises(ConfigurationError):
        await wrapper.generate_json(
            "analyze",
            AnalyzerOutput,
            model="gemini-2.5-flash",
            temperature=0.1,
        )

    assert fallback.calls == []
    assert fake_supabase.tables["project_llm_usage"] == []
    assert wrapper.last_metadata == {
        "provider_profile": "primary",
        "model": "gemini-2.5-flash",
        "fallback_used": False,
        "attempt_count": 1,
        "error_code": "CONFIGURATION_ERROR",
    }


@pytest.mark.asyncio
async def test_pipeline_retries_rate_limit_with_fast_model_fallback(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Add QA owner"},
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
    llm = FlakyRateLimitedClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Add QA owner",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add QA owner",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner"}],
                        "justification": "Supported by latest task",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
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
    analyzer_calls = [call for call in llm.calls if call["schema"] == "AnalyzerOutput"]
    assert [call["model"] for call in analyzer_calls] == [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]


@pytest.mark.asyncio
async def test_pipeline_retries_transport_error_with_same_model(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Add QA owner"},
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
    llm = FlakyTransportClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Add QA owner",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add QA owner",
                        "confidence": "medium",
                    }
                ]
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner"}],
                        "justification": "Supported by latest task",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
            },
            {"safe": True, "violations": []},
        ]
    )

    await run_project_pipeline(fake_supabase, run["id"], llm_client=llm, safety_client=llm)

    analyzer_calls = [call for call in llm.calls if call["schema"] == "AnalyzerOutput"]
    assert [call["model"] for call in analyzer_calls] == [
        "gemini-2.5-flash",
        "gemini-2.5-flash",
    ]


@pytest.mark.asyncio
async def test_pipeline_persists_safe_fallback_metadata(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Add QA owner"},
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
    primary = ScriptedClient(
        [
            {
                "tasks": [
                    {
                        "kind": "task",
                        "content": "Add QA owner",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add QA owner",
                        "confidence": "medium",
                    }
                ]
            },
            QuotaExceededError("primary quota exhausted"),
            {
                "changes": [
                    {
                        "id": "chg-1",
                        "section": "tasks",
                        "action": "add",
                        "content": [{"title": "Assign QA owner"}],
                        "justification": "Supported by latest task",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    }
                ],
                "summary": "Assign QA owner",
            },
            {"safe": True, "violations": []},
        ]
    )
    fallback = ScriptedClient(
        [
            {
                "gaps": [
                    {
                        "title": "Missing owner",
                        "detail": "QA needs an owner",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            }
        ]
    )

    await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=primary,
        fallback_llm_client=fallback,
        safety_client=primary,
        usage_date="2099-01-01",
    )

    analyzer_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "analyzer"
    )
    assert analyzer_artifact["payload"]["llm"] == {
        "provider_profile": "fallback",
        "model": "gemini-2.5-flash",
        "fallback_used": True,
        "attempt_count": 2,
    }
    assert "key" not in str(analyzer_artifact["payload"]).lower()


@pytest.mark.asyncio
async def test_pipeline_ignores_confidence_wording_only_safety_false_positive(
    fake_supabase,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {
            "project_id": project["id"],
            "session_id": "alpha",
            "content": "Add a project description and split the work into phases for setup, rollout, and validation.",
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
                requirements=[
                    {
                        "kind": "requirement",
                        "content": "Add a project description",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add a project description",
                        "confidence": "medium",
                    }
                ],
                tasks=[
                    {
                        "kind": "task",
                        "content": "Split the work into phases for setup, rollout, and validation",
                        "source_message_ids": [message["id"]],
                        "excerpt": "split the work into phases for setup, rollout, and validation",
                        "confidence": "medium",
                    }
                ],
            ),
            AnalyzerOutput(
                gaps=[
                    {
                        "title": "Description missing",
                        "detail": "The plan still needs a description.",
                        "severity": "major",
                        "source_message_ids": [message["id"]],
                    }
                ]
            ),
            {
                "changes": [
                    {
                        "id": "chg-description",
                        "section": "description",
                        "action": "update",
                        "content": "Project delivery plan for setup, rollout, and validation.",
                        "justification": "The user's message provides a clear concept for the description update.",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    },
                    {
                        "id": "chg-phases",
                        "section": "phases",
                        "action": "add",
                        "content": [
                            {
                                "title": "Setup",
                                "description": "Prepare the baseline project setup.",
                            },
                            {
                                "title": "Rollout",
                                "description": "Execute the implementation rollout.",
                            },
                            {
                                "title": "Validation",
                                "description": "Validate the delivered work.",
                            },
                        ],
                        "justification": "The requirements imply significant development work across setup, rollout, and validation.",
                        "source_message_ids": [message["id"]],
                        "confidence": "medium",
                    },
                ],
                "summary": "Add plan description and phases.",
            },
            {
                "safe": False,
                "violations": [
                    "The confidence level for the 'description' update is 'medium', but the justification suggests a 'high' confidence level by stating the user's message provides a 'clear concept'. The evidence cited does not fully support the 'high' confidence level.",
                    "The confidence level for the 'phases' addition is 'medium', but the justification states the requirements 'imply significant development work' which suggests a higher degree of certainty. The evidence cited does not fully support the 'medium' confidence level.",
                ],
            },
        ]
    )

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor", "analyzer", "planner"]
    proposal = fake_supabase.tables["plan_proposal"][0]
    assert proposal["status"] == "pending"
    planner_artifact = next(
        row for row in fake_supabase.tables["agent_artifact"] if row["agent"] == "planner"
    )
    assert planner_artifact["payload"]["safety"]["effective_safe"] is True
    assert len(planner_artifact["payload"]["safety"]["ignored_violations"]) == 2


@pytest.mark.asyncio
async def test_pipeline_updates_agent_statuses(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    for agent in ("monitor", "analyzer", "planner", "updater"):
        fake_supabase.insert_row(
            "agent_status",
            {"project_id": project["id"], "agent": agent, "status": "queued"},
        )
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
    llm = FakeJsonLlmClient(responses=[MonitorOutput(summary_candidate="brief")])

    await run_project_pipeline(fake_supabase, run["id"], llm_client=llm, safety_client=llm)

    statuses = {
        row["agent"]: row["status"]
        for row in fake_supabase.tables["agent_status"]
        if row["project_id"] == project["id"]
    }
    assert statuses["monitor"] == "completed"
    assert statuses["analyzer"] == "completed"
    assert statuses["planner"] == "completed"
    assert statuses["updater"] == "queued"


class BusyLockManager:
    async def acquire(self, project_id: str):
        del project_id
        return None


@pytest.mark.asyncio
async def test_pipeline_defers_when_project_lock_is_busy(fake_supabase) -> None:
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
    llm = FakeJsonLlmClient(responses=[MonitorOutput(summary_candidate="brief")])

    requeued = []

    async def requeue_run(run_id: str, *, delay_seconds: int) -> None:
        requeued.append({"run_id": run_id, "delay_seconds": delay_seconds})

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
        lock_manager=BusyLockManager(),
        requeue_run=requeue_run,
    )

    assert results == []
    assert llm.calls == []
    run_row = fake_supabase.tables["agent_run"][0]
    assert run_row["status"] == "queued"
    assert fake_supabase.tables["agent_artifact"] == []
    assert requeued == [{"run_id": run["id"], "delay_seconds": 5}]


class AnalyzerFailureClient(FakeJsonLlmClient):
    async def generate_json(self, prompt, schema, *, model, temperature):
        if schema.__name__ == "AnalyzerOutput":
            self.calls.append(
                {
                    "prompt": prompt,
                    "schema": schema.__name__,
                    "model": model,
                    "temperature": temperature,
                }
            )
            raise InvalidOutputError("bad analyzer output")
        return await super().generate_json(prompt, schema, model=model, temperature=temperature)


@pytest.mark.asyncio
async def test_pipeline_records_failure_on_active_agent(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "Add QA owner"},
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
    llm = AnalyzerFailureClient(
        responses=[
            MonitorOutput(
                tasks=[
                    {
                        "kind": "task",
                        "content": "Add QA owner",
                        "source_message_ids": [message["id"]],
                        "excerpt": "Add QA owner",
                        "confidence": "medium",
                    }
                ]
            )
        ]
    )

    with pytest.raises(InvalidOutputError):
        await run_project_pipeline(fake_supabase, run["id"], llm_client=llm)

    statuses = {
        row["agent"]: row["status"]
        for row in fake_supabase.tables["agent_status"]
        if row["project_id"] == project["id"]
    }
    assert statuses["analyzer"] == "failed"
    error_artifact = fake_supabase.tables["agent_artifact"][-1]
    assert error_artifact["agent"] == "analyzer"
    assert error_artifact["payload"]["error_code"] == "INVALID_OUTPUT"


@pytest.mark.asyncio
async def test_pipeline_ignores_duplicate_jobs_for_completed_runs(fake_supabase) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "completed",
        },
    )
    llm = FakeJsonLlmClient(responses=[MonitorOutput(summary_candidate="brief")])

    results = await run_project_pipeline(fake_supabase, run["id"], llm_client=llm)

    assert results == []
    assert llm.calls == []


@pytest.mark.asyncio
async def test_pipeline_uses_transcript_chunks_for_no_message_gate(
    fake_supabase,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project = fake_supabase.insert_row("project", {"name": "Alpha"})
    message = fake_supabase.insert_row(
        "chat_message",
        {"project_id": project["id"], "session_id": "alpha", "content": "ok"},
    )
    run = fake_supabase.insert_row(
        "agent_run",
        {
            "project_id": project["id"],
            "triggered_by": "alpha",
            "status": "queued",
            "new_message_ids": [message["id"]],
            "new_file_ids": ["audit-file-id"],
        },
    )

    class FakeBuilder:
        def __init__(self, _supabase) -> None:
            pass

        async def build(self, *, project_id: str, run_id: str, message_ids: list[str]):
            assert project_id == project["id"]
            assert run_id == run["id"]
            assert message_ids == [message["id"]]
            return AssembledContext(
                project_id=project["id"],
                run_id=run["id"],
                current_plan=None,
                new_messages=[message],
                memory=[],
                summaries=[],
                transcript_chunks=[
                    {
                        "chunk_text": "The roadmap owner is Jan Doe.",
                        "uploaded_file_id": "file-1",
                        "chunk_index": 0,
                        "similarity": 0.88,
                    }
                ],
                token_estimate=12,
                warnings=[],
            )

    llm = FakeJsonLlmClient(responses=[MonitorOutput(summary_candidate="brief summary")])
    monkeypatch.setattr("src.pipelines.runner.ContextBuilder", FakeBuilder)

    results = await run_project_pipeline(
        fake_supabase,
        run["id"],
        llm_client=llm,
        safety_client=llm,
    )

    assert [result.agent for result in results] == ["monitor"]
    assert [call["schema"] for call in llm.calls] == ["MonitorOutput"]
