from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field, model_validator

from src.models import ApiModel


class MessageCreate(ApiModel):
    content: str = Field(default="", max_length=4000)
    attachments: list["ChatAttachment"] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_payload(self) -> "MessageCreate":
        if not self.content.strip() and not self.attachments:
            raise ValueError("Message content or attachments are required.")
        return self


class ChatAttachment(ApiModel):
    uploaded_file_id: UUID
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=1024)
    size_bytes: int = Field(ge=0)


class MessageOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    content: str
    attachments: list[ChatAttachment] = Field(default_factory=list)
    created_at: datetime


class UploadUrlOut(ApiModel):
    bucket: str
    storage_path: str
    token: str
    signed_url: str | None = None


class FileAccessUrlOut(ApiModel):
    signed_url: str


class UploadUrlRequest(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    purpose: Literal["chat", "source"] = "source"


class UploadedFileCreate(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=1024)
    size_bytes: int = Field(gt=0)
    purpose: Literal["chat", "source"] = "source"


class UploadedFileOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    filename: str
    mime_type: str
    storage_path: str
    size_bytes: int
    purpose: Literal["chat", "source"] = "source"
    is_ai_context: bool = True
    created_at: datetime
