class EngineError(Exception):
    error_code = "ENGINE_ERROR"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidOutputError(EngineError):
    error_code = "INVALID_OUTPUT"


class RateLimitError(EngineError):
    error_code = "RATE_LIMITED"


class QuotaExceededError(EngineError):
    error_code = "QUOTA_EXCEEDED"


class AuthenticationError(EngineError):
    error_code = "AUTHENTICATION_ERROR"


class TransportError(EngineError):
    error_code = "TRANSPORT_ERROR"


class ConfigurationError(EngineError):
    error_code = "CONFIGURATION_ERROR"
