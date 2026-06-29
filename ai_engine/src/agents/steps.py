from __future__ import annotations

from typing import Any

from src.agents.base import AgentStep, StepResult
from src.agents.schemas import (
    AnalyzerOutput,
    MonitorOutput,
    PlannerOutput,
    QuestionAnalyzerOutput,
    SafetyCheckOutput,
)
from src.config import get_settings
from src.context.builder import AssembledContext
from src.guardrails import (
    calibrate_confidence_from_messages,
    canonicalize_source_message_ids,
    collect_context_source_message_ids,
    deduplicate_changes,
    ensure_remove_actions_are_explicit,
    partition_safety_violations,
    validate_source_message_ids,
)
from src.llm.client import JsonLlmClient
from src.prompts.templates import (
    ANALYZER_PROMPT,
    MONITOR_PROMPT,
    PLANNER_PROMPT,
    QUESTION_ANALYZER_PROMPT,
    SAFETY_CHECK_PROMPT,
)


def _llm_metadata(client: JsonLlmClient) -> dict | None:
    metadata = getattr(client, "last_metadata", None)
    return dict(metadata) if isinstance(metadata, dict) else None


def _serialize_prompt_messages(messages: list[dict]) -> list[dict]:
    serialized: list[dict] = []
    for message in messages:
        item = {
            "id": message["id"],
            "content": message["content"],
        }
        if message.get("role"):
            item["role"] = message["role"]
        serialized.append(item)
    return serialized


def _strip_non_citation_ids(payload):
    if isinstance(payload, dict):
        sanitized = {}
        for key, value in payload.items():
            if key in {"source_message_ids", "sourceMessageIds"}:
                sanitized[key] = value
                continue
            if (
                key == "id"
                or key.endswith("_id")
                or key.endswith("_ids")
                or key.endswith("_at")
            ):
                continue
            sanitized[key] = _strip_non_citation_ids(value)
        return sanitized
    if isinstance(payload, list):
        return [_strip_non_citation_ids(item) for item in payload]
    return payload


def _build_reasoning_context(
    context: AssembledContext,
    *,
    monitor_output: MonitorOutput | None = None,
    analyzer_output: Any | None = None,
    include_messages: bool = True,
) -> dict:
    prompt_context = {
        "current_plan": _strip_non_citation_ids(context.current_plan),
        "memory": _strip_non_citation_ids(context.memory),
        "summaries": _strip_non_citation_ids(context.summaries),
        "files": _strip_non_citation_ids(context.files),
        "warnings": list(context.warnings),
    }
    if include_messages:
        prompt_context["new_messages"] = _serialize_prompt_messages(context.new_messages)
    payload = {"context": prompt_context}
    if monitor_output is not None:
        payload["monitor"] = monitor_output.model_dump(mode="json")
    if analyzer_output is not None and hasattr(analyzer_output, "model_dump"):
        payload["analyzer"] = analyzer_output.model_dump(mode="json")
    return payload


def _build_monitor_context(context: AssembledContext) -> dict[str, Any]:
    current_plan = None
    if context.current_plan:
        current_plan = _strip_non_citation_ids(
            {
                "title": context.current_plan.get("title"),
                "description": context.current_plan.get("description"),
                "phases": context.current_plan.get("phases", []),
            }
        )
    return {
        "current_plan": current_plan,
        "new_messages": _serialize_prompt_messages(context.new_messages),
        "memory": _strip_non_citation_ids(context.memory),
        "summaries": _strip_non_citation_ids(context.summaries),
    }


def is_question_only_monitor_output(output: MonitorOutput) -> bool:
    has_questions = bool(output.open_questions)
    has_concrete_items = any(
        [
            output.decisions,
            output.tasks,
            output.requirements,
            output.risks,
        ]
    )
    return has_questions and not has_concrete_items


def analyzer_reports_unsupported_proposal_sections(output: Any) -> bool:
    return bool(getattr(output, "unsupported_proposal_sections", []))


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
            MONITOR_PROMPT.format(context=_build_monitor_context(context)),
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
        artifacts = output.model_dump(mode="json")
        metadata = _llm_metadata(self._llm_client)
        if metadata:
            artifacts["llm"] = metadata
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=meaningful,
            artifacts=artifacts,
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
                context=_build_reasoning_context(
                    context,
                    monitor_output=monitor_output,
                    include_messages=False,
                )
            ),
            AnalyzerOutput,
            model=self._settings.llm_model,
            temperature=0.1,
        )
        valid_ids = collect_context_source_message_ids(
            messages=context.new_messages,
            memory=context.memory,
            summaries=context.summaries,
            current_plan=context.current_plan,
        )
        for collection in (output.gaps, output.risks, output.conflicts):
            for item in collection:
                validate_source_message_ids(valid_ids, item.source_message_ids)

        actionable = any([output.gaps, output.risks, output.conflicts])
        artifacts = output.model_dump(mode="json")
        metadata = _llm_metadata(self._llm_client)
        if metadata:
            artifacts["llm"] = metadata
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=actionable,
            artifacts=artifacts,
        )


class QuestionAnalyzerStep(AgentStep):
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
            QUESTION_ANALYZER_PROMPT.format(
                context=_build_reasoning_context(
                    context,
                    monitor_output=monitor_output,
                )
            ),
            QuestionAnalyzerOutput,
            model=self._settings.llm_model,
            temperature=0.1,
        )
        valid_ids = collect_context_source_message_ids(
            messages=context.new_messages,
            memory=context.memory,
            summaries=context.summaries,
            current_plan=context.current_plan,
        )
        validate_source_message_ids(valid_ids, output.source_message_ids)

        artifacts = output.model_dump(mode="json")
        artifacts["mode"] = "question_analyzer"
        metadata = _llm_metadata(self._llm_client)
        if metadata:
            artifacts["llm"] = metadata
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=False,
            artifacts=artifacts,
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
                context=_build_reasoning_context(
                    context,
                    monitor_output=prior_results[0].output,
                    analyzer_output=prior_results[1].output,
                    include_messages=False,
                )
            ),
            PlannerOutput,
            model=self._settings.llm_model,
            temperature=0.2,
        )
        valid_ids = collect_context_source_message_ids(
            messages=context.new_messages,
            memory=context.memory,
            summaries=context.summaries,
            current_plan=context.current_plan,
        )
        source_messages = {
            str(message["id"]): message["content"]
            for message in context.new_messages
            if message.get("id") and message.get("content")
        }
        normalized_changes = [
            calibrate_confidence_from_messages(
                change.model_dump(mode="json", exclude_none=True),
                source_messages=source_messages,
            )
            for change in output.changes
        ]
        normalized_changes = deduplicate_changes(normalized_changes)
        for change in normalized_changes:
            change["source_message_ids"] = canonicalize_source_message_ids(
                valid_ids,
                change["source_message_ids"],
            )
            validate_source_message_ids(valid_ids, change["source_message_ids"])
        ensure_remove_actions_are_explicit(normalized_changes, context.new_messages)

        planner_metadata = _llm_metadata(self._llm_client)
        safety = await self._safety_client.generate_json(
            SAFETY_CHECK_PROMPT.format(context=normalized_changes),
            SafetyCheckOutput,
            model=self._settings.llm_fast_model,
            temperature=0.0,
        )
        safety_metadata = _llm_metadata(self._safety_client)
        ignored_safety_violations, blocking_safety_violations = partition_safety_violations(
            safety.violations
        )
        if not safety.safe and blocking_safety_violations:
            raise ValueError(
                f"Planner output failed safety check: {blocking_safety_violations}"
            )

        artifacts = {
            "changes": normalized_changes,
            "summary": output.summary,
            "safety": {
                **safety.model_dump(mode="json"),
                "effective_safe": not blocking_safety_violations,
                "ignored_violations": ignored_safety_violations,
            },
        }
        if planner_metadata:
            artifacts["llm"] = planner_metadata
        if safety_metadata:
            artifacts["safety_llm"] = safety_metadata
        return StepResult(
            agent=self.agent_name,
            output=output,
            should_continue=False,
            artifacts=artifacts,
        )
