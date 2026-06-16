from __future__ import annotations

import asyncio

from src.config import get_settings
from src.pipelines.runner import run_project_pipeline
from src.supabase_client import get_supabase_admin


async def _run(run_id: str) -> None:
    supabase = await get_supabase_admin()
    await run_project_pipeline(supabase, run_id)


def run_project_pipeline_job(run_id: str) -> None:
    asyncio.run(_run(run_id))


def main() -> None:
    settings = get_settings()
    from redis import Redis
    from rq import Connection, Worker

    redis = Redis.from_url(settings.redis_url)
    with Connection(redis):
        worker = Worker([settings.agent_queue_name])
        worker.work()


if __name__ == "__main__":
    main()
