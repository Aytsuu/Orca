from __future__ import annotations

import argparse
import json

from src.agents.schemas import PlannerOutput
from src.llm.gemini import GeminiJsonLlmClient


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Print the exact response schema sent to Gemini for the selected output model."
    )
    parser.add_argument(
        "--schema",
        choices=["planner"],
        default="planner",
        help="Schema preset to inspect.",
    )
    args = parser.parse_args()

    client = GeminiJsonLlmClient()

    if args.schema == "planner":
        response_schema = client._build_response_schema(PlannerOutput)
    else:  # pragma: no cover - argparse choices keep this unreachable.
        raise ValueError(f"Unsupported schema preset: {args.schema}")

    print(json.dumps(response_schema, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
