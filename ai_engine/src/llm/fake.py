from __future__ import annotations

from collections import deque
from typing import Any

from pydantic import BaseModel, ValidationError

from src.exceptions import InvalidOutputError
from src.llm.client import SchemaT


class FakeJsonLlmClient:
    def __init__(self, responses: list[Any] | None = None) -> None:
        self._responses = deque(responses or [])
        self.calls: list[dict[str, Any]] = []

    async def generate_json(
        self,
        prompt: str,
        schema: type[SchemaT],
        *,
        model: str,
        temperature: float,
    ) -> SchemaT:
        self.calls.append(
            {
                "prompt": prompt,
                "schema": schema.__name__,
                "model": model,
                "temperature": temperature,
            }
        )
        if not self._responses:
            raise InvalidOutputError("No fake LLM response was configured.")

        response = self._responses.popleft()
        if isinstance(response, BaseModel):
            if not isinstance(response, schema):
                raise InvalidOutputError("Fake LLM response schema mismatch.")
            return response
        try:
            return schema.model_validate(response)
        except ValidationError as exc:
            raise InvalidOutputError(str(exc)) from exc
