from __future__ import annotations

from functools import lru_cache
from datetime import datetime, timezone

from src.agents.base import StepResult
from src.agents.steps import AnalyzerStep, MonitorStep, PlannerStep
from src.config import get_settings
from src.context.builder import ContextBuilder
from src.exceptions import EngineError
from src.llm.client import JsonLlmClient
from src.llm.fake import FakeJsonLlmClient
from src.llm.gemini import GeminiJsonLlmClient
from src.repository import (
    create_agent_artifact,
    create_conversation_summary,
    create_memory_items,
    create_plan_proposal,
    get_agent_run,
    get_llm_usage,
    increment_llm_usage,
    set_run_status,
)


@lru_cache
def build_default_llm_client() -> JsonLlmClient:
    settings = get_settings()
    if settings.llm_provider == "fake":
        return FakeJsonLlmClient()
    return GeminiJsonLlmClient()


async def run_project_pipeline(
    supabase,
    run_id: str,
    *,
    llm_client: JsonLlmClient | None = None,
    safety_client: JsonLlmClient | None = None,
) -> list[StepResult]:
    settings = get_settings()
    llm = llm_client or build_default_llm_client()
    safety = safety_client or llm
    run = await get_agent_run(supabase, run_id)
    project_id = run["project_id"]

    usage_date = datetime.now(timezone.utc).date().isoformat()
    usage = await get_llm_usage(supabase, project_id=project_id, date=usage_date)
    if usage and usage["call_count"] >= settings.daily_llm_budget_per_project:
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent="planner",
            payload={"warning": "Daily LLM budget reached. Pipeline skipped."},
        )
        await set_run_status(supabase, run_id, status="completed")
        return []

    await set_run_status(supabase, run_id, status="running")
    builder = ContextBuilder(supabase)
    context = await builder.build(
        project_id=project_id,
        run_id=run_id,
        message_ids=run.get("new_message_ids", []),
        file_ids=run.get("new_file_ids", []),
    )

    steps = [
        MonitorStep(llm),
        AnalyzerStep(llm),
        PlannerStep(llm, safety),
    ]
    results: list[StepResult] = []

    try:
        for step in steps:
            await increment_llm_usage(supabase, project_id=project_id, date=usage_date)
            result = await step.execute(context, results)
            results.append(result)
            await create_agent_artifact(
                supabase,
                run_id=run_id,
                project_id=project_id,
                agent=result.agent,
                payload=result.artifacts,
            )
            if result.agent == "monitor":
                monitor_output = result.output
                memory_items = [
                    item.model_dump(mode="json")
                    for collection in (
                        monitor_output.decisions,
                        monitor_output.tasks,
                        monitor_output.requirements,
                        monitor_output.risks,
                    )
                    for item in collection
                ]
                await create_memory_items(supabase, project_id=project_id, items=memory_items)
                if monitor_output.summary_candidate and context.new_messages:
                    await create_conversation_summary(
                        supabase,
                        project_id=project_id,
                        summary=monitor_output.summary_candidate,
                        source_message_ids=[message["id"] for message in context.new_messages],
                        last_message_created_at=context.new_messages[-1]["created_at"],
                    )

            if not result.should_continue:
                remaining_steps = steps[len(results) :]
                for pending_step in remaining_steps:
                    skipped_payload = {"skipped": True, "reason": "no_actionable_input"}
                    await create_agent_artifact(
                        supabase,
                        run_id=run_id,
                        project_id=project_id,
                        agent=pending_step.agent_name,
                        payload=skipped_payload,
                    )
                break

        planner_result = next((result for result in results if result.agent == "planner"), None)
        if planner_result:
            await create_plan_proposal(
                supabase,
                project_id=project_id,
                changes=planner_result.artifacts["changes"],
            )
        await set_run_status(supabase, run_id, status="completed")
        return results
    except EngineError as exc:
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent="planner",
            payload={"error_code": exc.error_code, "error_message": exc.message},
        )
        await set_run_status(
            supabase,
            run_id,
            status="failed",
            error_code=exc.error_code,
            error_message=exc.message,
        )
        raise
    except Exception as exc:
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent="planner",
            payload={"error_code": "PIPELINE_ERROR", "error_message": str(exc)},
        )
        await set_run_status(
            supabase,
            run_id,
            status="failed",
            error_code="PIPELINE_ERROR",
            error_message=str(exc),
        )
        raise
