from fastapi import HTTPException, status


class AppException(HTTPException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    detail = "An unexpected error occurred."

    def __init__(self, detail: str | None = None) -> None:
        super().__init__(status_code=self.status_code, detail=detail or self.detail)


class SupabaseNotConfigured(AppException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    detail = "Supabase credentials are not configured for this environment."

