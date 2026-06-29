from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable

from supabase import AsyncClient

from src.agents.queue import QueueProducer
from src.agents.schemas import AgentStatusOut, AgentTriggerOut
from src.agents.service import get_agent_statuses, trigger_agents


@dataclass(frozen=True)
class SlashCommandDefinition:
    name: str
    description: str
    usage: str
    handler: Callable[..., Awaitable[dict]]


def parse_slash_command(content: str) -> tuple[str, str] | None:
    normalized = content.strip()
    if not normalized.startswith("/") or len(normalized) == 1:
        return None

    body = normalized[1:]
    command_name, _, remainder = body.partition(" ")
    if not command_name:
        return None
    return command_name.lower(), remainder.strip()


async def handle_analyze_command(
    *,
    supabase: AsyncClient,
    queue_producer: QueueProducer,
    project_id: str,
    session_id: str,
    args: str,
) -> dict:
    run = await trigger_agents(
        supabase,
        queue_producer,
        project_id=project_id,
        triggered_by=session_id,
    )
    return {
        "command": "analyze",
        "args": args,
        "ephemeral": True,
        "message": "Pipeline run queued for this project.",
        "result": {"run": AgentTriggerOut.model_validate(run).model_dump(mode="json")},
    }


async def handle_status_command(
    *,
    supabase: AsyncClient,
    queue_producer: QueueProducer,
    project_id: str,
    session_id: str,
    args: str,
) -> dict:
    del queue_producer, session_id, args
    statuses = await get_agent_statuses(supabase, project_id)
    normalized_statuses = [
        AgentStatusOut.model_validate(status).model_dump(mode="json") for status in statuses
    ]
    status_summary = ", ".join(
        f'{item["agent"]}: {item["status"]}' for item in normalized_statuses
    )
    return {
        "command": "status",
        "args": "",
        "ephemeral": True,
        "message": f"Only visible to you. Current agent statuses: {status_summary}.",
        "result": {"statuses": normalized_statuses},
    }


SLASH_COMMANDS: dict[str, SlashCommandDefinition] = {
    "analyze": SlashCommandDefinition(
        name="analyze",
        description="Run the AI pipeline for this project.",
        usage="/analyze [optional note]",
        handler=handle_analyze_command,
    ),
    "status": SlashCommandDefinition(
        name="status",
        description="Show the current Orca agent statuses.",
        usage="/status",
        handler=handle_status_command,
    ),
}
