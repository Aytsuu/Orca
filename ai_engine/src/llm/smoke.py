from __future__ import annotations

import argparse
import asyncio

from pydantic import BaseModel

from src.config import get_settings
from src.exceptions import ConfigurationError
from src.llm.gemini import GeminiJsonLlmClient


class SmokeResponse(BaseModel):
    ok: bool
    msg: str


async def run_smoke_test(*, profile: str = "primary") -> SmokeResponse:
    settings = get_settings()
    api_key = None
    model = "gemini-2.5-flash-lite"
    if profile == "fallback":
        if not settings.llm_fallback_api_key:
            raise ConfigurationError("LLM_FALLBACK_API_KEY is required for fallback smoke test.")
        api_key = settings.llm_fallback_api_key
        model = settings.llm_fallback_fast_model
    elif profile != "primary":
        raise ConfigurationError(f"Unsupported smoke profile: {profile}")

    client = GeminiJsonLlmClient(api_key=api_key)
    return await client.generate_json(
        'Return a JSON object with ok=true and msg="pong".',
        SmokeResponse,
        model=model,
        temperature=0.0,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a minimal Gemini structured-output smoke test."
    )
    parser.add_argument("--profile", choices=("primary", "fallback"), default="primary")
    args = parser.parse_args()

    result = asyncio.run(run_smoke_test(profile=args.profile))
    print(result.model_dump())


if __name__ == "__main__":
    main()
