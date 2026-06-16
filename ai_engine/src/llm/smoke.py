from __future__ import annotations

import asyncio

from pydantic import BaseModel

from src.llm.gemini import GeminiJsonLlmClient


class SmokeResponse(BaseModel):
    ok: bool
    msg: str


async def run_smoke_test() -> SmokeResponse:
    client = GeminiJsonLlmClient()
    return await client.generate_json(
        'Return a JSON object with ok=true and msg="pong".',
        SmokeResponse,
        model="gemini-2.5-flash-lite",
        temperature=0.0,
    )


def main() -> None:
    result = asyncio.run(run_smoke_test())
    print(result.model_dump())


if __name__ == "__main__":
    main()
