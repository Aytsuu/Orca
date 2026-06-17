from __future__ import annotations

import pytest

from src.agents.schemas import AnalyzerOutput, MonitorOutput
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
