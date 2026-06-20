from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

SchemaT = TypeVar("SchemaT", bound=BaseModel)


class JsonLlmClient(Protocol):
    async def generate_json(
        self,
        prompt: str,
        schema: type[SchemaT],
        *,
        model: str,
        temperature: float,
    ) -> SchemaT: ...
