from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status


class AppException(HTTPException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    message = "An unexpected error occurred."
    error_code = "APP_ERROR"

    def __init__(self, message: str | None = None, detail: Any | None = None) -> None:
        super().__init__(status_code=self.status_code, detail=message or self.message)
        self.message = message or self.message
        self.extra_detail = detail


class BadRequest(AppException):
    status_code = status.HTTP_400_BAD_REQUEST
    message = "The request is invalid."
    error_code = "BAD_REQUEST"


class Unauthorized(AppException):
    status_code = status.HTTP_401_UNAUTHORIZED
    message = "Authentication is required."
    error_code = "UNAUTHORIZED"


class Forbidden(AppException):
    status_code = status.HTTP_403_FORBIDDEN
    message = "You do not have permission to perform this action."
    error_code = "FORBIDDEN"


class NotFound(AppException):
    status_code = status.HTTP_404_NOT_FOUND
    message = "The requested resource was not found."
    error_code = "NOT_FOUND"


class Conflict(AppException):
    status_code = status.HTTP_409_CONFLICT
    message = "The requested change conflicts with the current state."
    error_code = "CONFLICT"


class SupabaseNotConfigured(AppException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    message = "Supabase credentials are not configured for this environment."
    error_code = "SUPABASE_NOT_CONFIGURED"
