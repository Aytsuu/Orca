from __future__ import annotations

from dataclasses import asdict

from src.agents.base import AgentStep, StepResult
from src.agents.schemas import AnalyzerOutput, MonitorOutput, PlannerOutput, SafetyCheckOutput
from src.config import get_settings
from src.context.builder import AssembledContext
from src.guardrails import (
    deduplicate_changes,
    ensure_remove_actions_are_explicit,
    normalize_confidence,
    validate_source_message_ids,
)
from src.llm.client import JsonLlmClient
from src.prompts.templates import (
    ANALYZER_PROMPT,
    MONITOR_PROMPT,
    PLANNER_PROMPT,
    SAFETY_CHECK_PROMPT,
)


class MonitorStep(AgentStep):
    agent_name = "monitor"

    def __init__(self, llm_client: JsonLlmClient) -> None:
        self._llm_client = llm_client
        self._settings = get_settings()

    async def execute(
        self,
        context: AssembledContext,
        prior_results: list[StepResult],
    ) -> StepResult:
        del prior_results
        output = await self._llm_client.generate_json(
            MONITOR_PROMPT.format(context=asdict(context)),
            MonitorOutput,
            model=self._settings.llm_fast_model,
            temperature=0.0,
        )
        valid_ids = [message["id"] for message in context.new_messages]
        for collection in (
            output.decisions,
            output.tasks,
            output.requirements,
            output.risks,
            output.open_questions,
        ):
            for item in collection:
                validate_source_message_ids(valid_ids, item.source_message_ids)

        meaningful = any(
            [
                output.decisions,
                output.tasks,
                output.requirements,
                output.risks,
                output.open_questions,
            ]
        )
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=meaningful,
            artifacts=output.model_dump(mode="json"),
        )


class AnalyzerStep(AgentStep):
    agent_name = "analyzer"

    def __init__(self, llm_client: JsonLlmClient) -> None:
        self._llm_client = llm_client
        self._settings = get_settings()

    async def execute(
        self,
        context: AssembledContext,
        prior_results: list[StepResult],
    ) -> StepResult:
        monitor_output = prior_results[-1].output
        output = await self._llm_client.generate_json(
            ANALYZER_PROMPT.format(
                context={
                    "context": asdict(context),
                    "monitor": monitor_output.model_dump(mode="json"),
                }
            ),
            AnalyzerOutput,
            model=self._settings.llm_model,
            temperature=0.1,
        )
        valid_ids = [message["id"] for message in context.new_messages]
        for collection in (output.gaps, output.risks, output.conflicts):
            for item in collection:
                validate_source_message_ids(valid_ids, item.source_message_ids)

        actionable = any([output.gaps, output.risks, output.conflicts])
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=actionable,
            artifacts=output.model_dump(mode="json"),
        )


class PlannerStep(AgentStep):
    agent_name = "planner"

    def __init__(
        self,
        llm_client: JsonLlmClient,
        safety_client: JsonLlmClient | None = None,
    ) -> None:
        self._llm_client = llm_client
        self._safety_client = safety_client or llm_client
        self._settings = get_settings()

    async def execute(
        self,
        context: AssembledContext,
        prior_results: list[StepResult],
    ) -> StepResult:
        output = await self._llm_client.generate_json(
            PLANNER_PROMPT.format(
                context={
                    "context": asdict(context),
                    "monitor": prior_results[0].output.model_dump(mode="json"),
                    "analyzer": prior_results[1].output.model_dump(mode="json"),
                }
            ),
            PlannerOutput,
            model=self._settings.llm_model,
            temperature=0.2,
        )
        valid_ids = [message["id"] for message in context.new_messages]
        normalized_changes = [
            normalize_confidence(change.model_dump()) for change in output.changes
        ]
        normalized_changes = deduplicate_changes(normalized_changes)
        for change in normalized_changes:
            validate_source_message_ids(valid_ids, change["source_message_ids"])
        ensure_remove_actions_are_explicit(normalized_changes, context.new_messages)

        safety = await self._safety_client.generate_json(
            SAFETY_CHECK_PROMPT.format(context=normalized_changes),
            SafetyCheckOutput,
            model=self._settings.llm_fast_model,
            temperature=0.0,
        )
        if not safety.safe:
            raise ValueError(f"Planner output failed safety check: {safety.violations}")

        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=False,
            artifacts={
                "changes": normalized_changes,
                "summary": output.summary,
                "safety": safety.model_dump(mode="json"),
            },
        )
