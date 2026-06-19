from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator, model_validator

from src.models import EngineModel

Confidence = Literal["low", "medium", "high"]
PlannerAction = Literal["add", "update", "remove"]
MemoryKind = Literal["decision", "task", "risk", "requirement", "summary", "detail"]
Severity = Literal["critical", "major", "minor"]


class ExtractedItem(EngineModel):
    kind: MemoryKind
    content: str = Field(min_length=1)
    source_message_ids: list[str] = Field(min_length=1)
    excerpt: str = Field(min_length=1)
    confidence: Confidence


class MonitorOutput(EngineModel):
    decisions: list[ExtractedItem] = Field(default_factory=list)
    tasks: list[ExtractedItem] = Field(default_factory=list)
    requirements: list[ExtractedItem] = Field(default_factory=list)
    risks: list[ExtractedItem] = Field(default_factory=list)
    open_questions: list[ExtractedItem] = Field(default_factory=list)
    summary_candidate: str | None = None


class AnalyzerItem(EngineModel):
    title: str = Field(min_length=1)
    detail: str = Field(min_length=1)
    severity: Severity
    source_message_ids: list[str] = Field(min_length=1)


class AnalyzerOutput(EngineModel):
    gaps: list[AnalyzerItem] = Field(default_factory=list)
    risks: list[AnalyzerItem] = Field(default_factory=list)
    conflicts: list[AnalyzerItem] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    panel_suggestions: list[str] = Field(default_factory=list)


class RelevanceOutput(EngineModel):
    should_trigger: bool
    confidence: Confidence
    reason: str = Field(min_length=1)
    use_with_previous_context: bool = False


class PlannerContentItem(EngineModel):
    title: str | None = None
    detail: str | None = None
    owner: str | None = None
    status: str | None = None
    priority: str | None = None
    due_date: str | None = None
    notes: str | None = None
    value: str | None = None


class PlannerChange(EngineModel):
    id: str = Field(min_length=1)
    section: str = Field(min_length=1)
    action: PlannerAction
    content: list[PlannerContentItem] | list[str] | str
    justification: str = Field(min_length=1)
    source_message_ids: list[str] = Field(min_length=1)
    confidence: Confidence
    approved: bool | None = None

    @field_validator("source_message_ids")
    @classmethod
    def _require_citations(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("source_message_ids are required")
        return value


class PlannerOutput(EngineModel):
    changes: list[PlannerChange] = Field(default_factory=list)
    summary: str | None = None

    @model_validator(mode="after")
    def _validate_changes(self) -> "PlannerOutput":
        supported = {"add", "update", "remove"}
        for change in self.changes:
            if change.action not in supported:
                raise ValueError(f"Unsupported planner action: {change.action}")
        return self


class SafetyCheckOutput(EngineModel):
    safe: bool
    violations: list[str] = Field(default_factory=list)


class SummaryOutput(EngineModel):
    summary: str = Field(min_length=1)
    source_message_ids: list[str] = Field(min_length=1)
