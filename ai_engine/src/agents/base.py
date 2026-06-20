from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StepResult:
    agent: str
    output: Any
    should_continue: bool
    artifacts: dict[str, Any]
    skipped: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


class AgentStep(ABC):
    agent_name: str

    @abstractmethod
    async def execute(self, context: Any, prior_results: list[StepResult]) -> StepResult: ...
