from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from src.models import ApiModel


class MessageCreate(ApiModel):
    content: str = Field(min_length=1, max_length=4000)


class MessageOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    content: str
    created_at: datetime


class UploadUrlOut(ApiModel):
    bucket: str
    storage_path: str
    token: str
    signed_url: str | None = None


class UploadUrlRequest(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)


class UploadedFileCreate(ApiModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=1024)
    size_bytes: int = Field(ge=0)


class UploadedFileOut(ApiModel):
    id: UUID
    project_id: UUID
    session_id: str
    filename: str
    mime_type: str
    storage_path: str
    size_bytes: int
    created_at: datetime
