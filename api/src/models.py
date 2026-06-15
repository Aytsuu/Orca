from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_serializer

DataT = TypeVar("DataT")


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    @field_serializer("*", when_used="json", check_fields=False)
    def _serialize_datetimes(self, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        return value


class ErrorBody(ApiModel):
    code: str
    message: str
    detail: Any | None = None


class ErrorEnvelope(ApiModel):
    error: ErrorBody


class DataEnvelope(ApiModel, Generic[DataT]):
    data: DataT


class MetaEnvelope(ApiModel, Generic[DataT]):
    data: DataT
    meta: dict[str, Any] = Field(default_factory=dict)
