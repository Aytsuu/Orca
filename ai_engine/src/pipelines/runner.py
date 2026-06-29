from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from functools import lru_cache
from typing import Callable

from src.agents.base import StepResult
from src.agents.schemas import RelevanceOutput
from src.agents.steps import (
    AnalyzerStep,
    MonitorStep,
    PlannerStep,
    QuestionAnalyzerStep,
    analyzer_reports_unsupported_proposal_sections,
    is_question_only_monitor_output,
)
from src.config import get_settings
from src.context.builder import ContextBuilder
from src.exceptions import (
    AuthenticationError,
    ConfigurationError,
    EngineError,
    InvalidOutputError,
    QuotaExceededError,
    RateLimitError,
    TransportError,
)
from src.llm.client import JsonLlmClient
from src.llm.fake import FakeJsonLlmClient
from src.llm.gemini import GeminiJsonLlmClient
from src.llm.rate_limiter import RateLimiter
from src.message_relevance import build_relevance_prompt_context, split_messages_by_signal
from src.pipelines.locks import ProjectLockManager
from src.prompts.templates import RELEVANCE_PROMPT
from src.repository import (
    claim_agent_run,
    create_agent_artifact,
    create_conversation_summary,
    create_memory_items,
    create_plan_proposal,
    update_project_ai_cursor,
    get_agent_run,
    get_llm_usage,
    increment_llm_usage,
    set_agent_status,
    set_run_status,
)


async def _skip_pipeline_as_non_meaningful(
    supabase,
    *,
    run_id: str,
    project_id: str,
    reason: str,
    last_processed_message_at: str | None = None,
    extra_payload: dict[str, object] | None = None,
) -> list[StepResult]:
    payload: dict[str, object] = {"skipped": True, "reason": reason}
    if extra_payload:
        payload.update(extra_payload)
    for agent_name in ("monitor", "analyzer", "planner"):
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent=agent_name,
            payload=payload,
        )
        await set_agent_status(
            supabase,
            project_id=project_id,
            agent=agent_name,
            status="completed",
        )
    await _persist_project_ai_cursor_if_possible(
        supabase,
        run_id=run_id,
        project_id=project_id,
        agent="monitor",
        last_processed_message_at=last_processed_message_at,
    )
    await set_run_status(supabase, run_id, status="completed")
    return []


async def _persist_project_ai_cursor_if_possible(
    supabase,
    *,
    run_id: str,
    project_id: str,
    agent: str,
    last_processed_message_at: str | None,
) -> None:
    if not last_processed_message_at:
        return
    try:
        await update_project_ai_cursor(
            supabase,
            project_id=project_id,
            last_processed_message_at=last_processed_message_at,
        )
    except Exception as exc:
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent=agent,
            payload={
                "warning": "project_ai_cursor_update_failed",
                "detail": str(exc),
            },
        )


@lru_cache
def build_default_llm_client() -> JsonLlmClient:
    settings = get_settings()
    if settings.llm_provider == "fake":
        return FakeJsonLlmClient()
    return GeminiJsonLlmClient()


@lru_cache
def build_default_fallback_llm_client() -> JsonLlmClient | None:
    settings = get_settings()
    if not settings.llm_fallback_enabled or not settings.llm_fallback_api_key:
        return None
    if settings.llm_fallback_provider == "gemini":
        return GeminiJsonLlmClient(
            api_key=settings.llm_fallback_api_key,
            rate_limiter=RateLimiter(settings.llm_rate_limit_rpm),
        )
    if settings.llm_fallback_provider == "fake":
        return FakeJsonLlmClient()
    raise ConfigurationError(f"Unsupported fallback LLM provider: {settings.llm_fallback_provider}")


class RetryingBudgetedJsonLlmClient:
    def __init__(
        self,
        wrapped: JsonLlmClient,
        *,
        fallback_client: JsonLlmClient | None = None,
        supabase,
        project_id: str,
        usage_date: str,
        sleep: Callable[[float], object] | None = None,
    ) -> None:
        self._wrapped = wrapped
        self._fallback = fallback_client
        self._supabase = supabase
        self._project_id = project_id
        self._usage_date = usage_date
        self._settings = get_settings()
        self._sleep = sleep or asyncio.sleep
        self.last_metadata: dict[str, object] | None = None

    async def generate_json(self, prompt, schema, *, model: str, temperature: float):
        attempt_count = 0
        last_error: EngineError | None = None

        async def attempt(client: JsonLlmClient, provider_profile: str, attempt_model: str):
            nonlocal attempt_count
            attempt_count += 1
            self.last_metadata = {
                "provider_profile": provider_profile,
                "model": attempt_model,
                "fallback_used": provider_profile == "fallback",
                "attempt_count": attempt_count,
            }
            try:
                result = await client.generate_json(
                    prompt,
                    schema,
                    model=attempt_model,
                    temperature=temperature,
                )
            except EngineError as exc:
                self.last_metadata = {
                    **self.last_metadata,
                    "error_code": exc.error_code,
                }
                raise
            await increment_llm_usage(
                self._supabase,
                project_id=self._project_id,
                date=self._usage_date,
            )
            return result

        primary_fast_model = self._settings.llm_fast_model
        fallback_model = self._settings.llm_fallback_model or model
        fallback_fast_model = self._settings.llm_fallback_fast_model or primary_fast_model

        try:
            return await attempt(self._wrapped, "primary", model)
        except ConfigurationError:
            raise
        except RateLimitError as exc:
            last_error = exc
            if model != primary_fast_model:
                try:
                    return await attempt(self._wrapped, "primary", primary_fast_model)
                except ConfigurationError:
                    raise
                except (
                    RateLimitError,
                    QuotaExceededError,
                    TransportError,
                    AuthenticationError,
                    InvalidOutputError,
                ) as retry_exc:
                    last_error = retry_exc
            elif not self._fallback:
                pass
        except (QuotaExceededError, TransportError, AuthenticationError, InvalidOutputError) as exc:
            last_error = exc

        if self._fallback:
            try:
                return await attempt(self._fallback, "fallback", fallback_model)
            except ConfigurationError:
                raise
            except RateLimitError as exc:
                last_error = exc
                if fallback_model != fallback_fast_model:
                    try:
                        return await attempt(self._fallback, "fallback", fallback_fast_model)
                    except ConfigurationError:
                        raise
                    except (
                        RateLimitError,
                        QuotaExceededError,
                        TransportError,
                        AuthenticationError,
                        InvalidOutputError,
                    ) as retry_exc:
                        last_error = retry_exc
            except (
                QuotaExceededError,
                TransportError,
                AuthenticationError,
                InvalidOutputError,
            ) as exc:
                last_error = exc

        if self._fallback:
            if last_error:
                raise last_error
            raise RuntimeError("LLM fallback loop exited without a result.")

        attempt_model = primary_fast_model if isinstance(last_error, RateLimitError) else model
        last_error: EngineError | None = None
        for index in range(3):
            try:
                result = await self._wrapped.generate_json(
                    prompt,
                    schema,
                    model=attempt_model,
                    temperature=temperature,
                )
                await increment_llm_usage(
                    self._supabase,
                    project_id=self._project_id,
                    date=self._usage_date,
                )
                self.last_metadata = {
                    "provider_profile": "primary",
                    "model": attempt_model,
                    "fallback_used": False,
                    "attempt_count": attempt_count + index + 1,
                }
                return result
            except RateLimitError as exc:
                last_error = exc
                if index == 2:
                    break
                await self._sleep(min(2**index, 4) * 0.1)
            except TransportError as exc:
                last_error = exc
                if index == 2:
                    break
                await self._sleep(min(2**index, 4) * 0.1)
            except (
                ConfigurationError,
                QuotaExceededError,
                AuthenticationError,
                InvalidOutputError,
            ) as exc:
                self.last_metadata = {
                    "provider_profile": "primary",
                    "model": attempt_model,
                    "fallback_used": False,
                    "attempt_count": attempt_count + index + 1,
                    "error_code": exc.error_code,
                }
                raise

        if last_error:
            raise last_error
        raise RuntimeError("LLM retry loop exited without a result.")


async def run_project_pipeline(
    supabase,
    run_id: str,
    *,
    llm_client: JsonLlmClient | None = None,
    fallback_llm_client: JsonLlmClient | None = None,
    safety_client: JsonLlmClient | None = None,
    fallback_safety_client: JsonLlmClient | None = None,
    lock_manager: ProjectLockManager | None = None,
    requeue_run: Callable[..., object] | None = None,
    usage_date: str | None = None,
) -> list[StepResult]:
    settings = get_settings()
    run = await get_agent_run(supabase, run_id)
    if run["status"] != "queued":
        return []
    project_id = run["project_id"]

    lock = await lock_manager.acquire(project_id) if lock_manager else None
    if lock_manager and lock is None:
        if requeue_run:
            maybe_awaitable = requeue_run(run_id, delay_seconds=5)
            if hasattr(maybe_awaitable, "__await__"):
                await maybe_awaitable
        return []

    claimed_run = await claim_agent_run(supabase, run_id)
    if not claimed_run:
        if lock:
            await lock.release()
        return []
    run = claimed_run

    usage_date = usage_date or datetime.now(timezone.utc).date().isoformat()
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
        if lock:
            await lock.release()
        return []

    raw_llm = llm_client or build_default_llm_client()
    raw_fallback_llm = fallback_llm_client
    if raw_fallback_llm is None and llm_client is None:
        raw_fallback_llm = build_default_fallback_llm_client()
    llm = RetryingBudgetedJsonLlmClient(
        raw_llm,
        fallback_client=raw_fallback_llm,
        supabase=supabase,
        project_id=project_id,
        usage_date=usage_date,
    )
    raw_safety = safety_client or raw_llm
    raw_fallback_safety = fallback_safety_client
    if raw_fallback_safety is None:
        raw_fallback_safety = raw_fallback_llm
    safety = RetryingBudgetedJsonLlmClient(
        raw_safety,
        fallback_client=raw_fallback_safety,
        supabase=supabase,
        project_id=project_id,
        usage_date=usage_date,
    )
    soft_budget_reached = bool(
        usage
        and usage["call_count"]
        >= int(settings.daily_llm_budget_per_project * settings.llm_budget_warning_threshold)
    )

    results: list[StepResult] = []
    active_agent = "monitor"
    try:
        builder = ContextBuilder(supabase)
        context = await builder.build(
            project_id=project_id,
            run_id=run_id,
            message_ids=run.get("new_message_ids", []),
            file_ids=run.get("new_file_ids", []),
        )
        meaningful_messages, ambiguous_messages = split_messages_by_signal(context.new_messages)
        if not meaningful_messages and not ambiguous_messages and not context.files:
            return await _skip_pipeline_as_non_meaningful(
                supabase,
                run_id=run_id,
                project_id=project_id,
                reason="no_meaningful_messages",
                last_processed_message_at=(
                    context.new_messages[-1]["created_at"] if context.new_messages else None
                ),
                extra_payload={"message_count": len(context.new_messages)},
            )
        if not meaningful_messages and ambiguous_messages:
            relevance = await llm.generate_json(
                RELEVANCE_PROMPT.format(context=build_relevance_prompt_context(context)),
                RelevanceOutput,
                model=settings.llm_fast_model,
                temperature=0.0,
            )
            if not relevance.should_trigger:
                return await _skip_pipeline_as_non_meaningful(
                    supabase,
                    run_id=run_id,
                    project_id=project_id,
                    reason="relevance_gate_filtered_messages",
                    last_processed_message_at=(
                        context.new_messages[-1]["created_at"] if context.new_messages else None
                    ),
                    extra_payload={"relevance_gate": relevance.model_dump(mode="json")},
                )

        steps = [MonitorStep(llm)]
        for step in steps:
            active_agent = step.agent_name
            await set_agent_status(
                supabase,
                project_id=project_id,
                agent=step.agent_name,
                status="running",
            )
            result = await step.execute(context, results)
            results.append(result)
            await create_agent_artifact(
                supabase,
                run_id=run_id,
                project_id=project_id,
                agent=result.agent,
                payload=result.artifacts,
            )
            await set_agent_status(
                supabase,
                project_id=project_id,
                agent=result.agent,
                status="completed",
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
                if result.should_continue:
                    if is_question_only_monitor_output(monitor_output):
                        steps.append(QuestionAnalyzerStep(llm))
                        steps.append(PlannerStep(llm, safety))
                    else:
                        steps.append(AnalyzerStep(llm))
                        if not soft_budget_reached:
                            steps.append(PlannerStep(llm, safety))
            if result.agent == "analyzer" and analyzer_reports_unsupported_proposal_sections(
                result.output
            ):
                steps = [step for step in steps if step.agent_name != "planner"]
                skipped_payload = {
                    "skipped": True,
                    "reason": "unsupported_proposal_section",
                    "unsupported_proposal_sections": list(
                        result.output.unsupported_proposal_sections
                    ),
                }
                await create_agent_artifact(
                    supabase,
                    run_id=run_id,
                    project_id=project_id,
                    agent="planner",
                    payload=skipped_payload,
                )
                await set_agent_status(
                    supabase,
                    project_id=project_id,
                    agent="planner",
                    status="completed",
                )
                break

            if not result.should_continue:
                remaining_steps = steps[len(results) :]
                if not remaining_steps and result.agent == "monitor":
                    remaining_steps = [
                        AnalyzerStep(llm),
                        PlannerStep(llm, safety),
                    ]
                for pending_step in remaining_steps:
                    skipped_payload = {"skipped": True, "reason": "no_actionable_input"}
                    await create_agent_artifact(
                        supabase,
                        run_id=run_id,
                        project_id=project_id,
                        agent=pending_step.agent_name,
                        payload=skipped_payload,
                    )
                    await set_agent_status(
                        supabase,
                        project_id=project_id,
                        agent=pending_step.agent_name,
                        status="completed",
                    )
                break

        if soft_budget_reached and len(results) == 2 and results[-1].should_continue:
            skipped_payload = {"skipped": True, "reason": "daily_llm_budget_soft_cap"}
            await create_agent_artifact(
                supabase,
                run_id=run_id,
                project_id=project_id,
                agent="planner",
                payload=skipped_payload,
            )
            await set_agent_status(
                supabase,
                project_id=project_id,
                agent="planner",
                status="completed",
            )

        planner_result = next((result for result in results if result.agent == "planner"), None)
        if planner_result:
            await create_plan_proposal(
                supabase,
                project_id=project_id,
                changes=planner_result.artifacts["changes"],
            )
        await _persist_project_ai_cursor_if_possible(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent=results[-1].agent if results else "monitor",
            last_processed_message_at=(
                context.new_messages[-1]["created_at"] if context.new_messages else None
            ),
        )
        await set_run_status(supabase, run_id, status="completed")
        return results
    except EngineError as exc:
        failing_agent = active_agent
        await set_agent_status(
            supabase,
            project_id=project_id,
            agent=failing_agent,
            status="failed",
        )
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent=failing_agent,
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
        failing_agent = active_agent
        await set_agent_status(
            supabase,
            project_id=project_id,
            agent=failing_agent,
            status="failed",
        )
        await create_agent_artifact(
            supabase,
            run_id=run_id,
            project_id=project_id,
            agent=failing_agent,
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
    finally:
        if lock:
            await lock.release()
