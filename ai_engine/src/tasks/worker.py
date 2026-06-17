from __future__ import annotations

import asyncio
import os
import signal
from datetime import timedelta

from src.config import get_settings
from src.pipelines.locks import RedisProjectLockManager
from src.pipelines.runner import run_project_pipeline
from src.supabase_client import get_supabase_admin


def build_retry_job_id(run_id: str) -> str:
    return f"agent-run:{run_id}:retry"


def build_requeue_run(settings):
    def _requeue_run(run_id: str, *, delay_seconds: int = 5) -> str:
        from redis import Redis
        from rq import Queue

        queue = Queue(
            name=settings.agent_queue_name,
            connection=Redis.from_url(settings.redis_url),
        )
        job = queue.enqueue_in(
            timedelta(seconds=delay_seconds),
            "src.tasks.worker.run_project_pipeline_job",
            run_id,
            job_timeout=settings.agent_queue_timeout_seconds,
            job_id=build_retry_job_id(run_id),
        )
        return job.id

    return _requeue_run


async def _run(run_id: str) -> None:
    settings = get_settings()
    supabase = await get_supabase_admin()
    lock_manager = RedisProjectLockManager(settings.redis_url, ttl_seconds=300)
    await run_project_pipeline(
        supabase,
        run_id,
        lock_manager=lock_manager,
        requeue_run=build_requeue_run(settings),
    )


def run_project_pipeline_job(run_id: str) -> None:
    asyncio.run(_run(run_id))


def select_worker_class():
    from rq import SimpleWorker, Worker

    if not hasattr(os, "fork"):
        return SimpleWorker
    return Worker


def select_death_penalty_class():
    from rq.timeouts import TimerDeathPenalty, UnixSignalDeathPenalty

    if not hasattr(signal, "SIGALRM"):
        return TimerDeathPenalty
    return UnixSignalDeathPenalty


def build_worker_class(base_worker_class, death_penalty_class):
    return type(
        f"Configured{base_worker_class.__name__}",
        (base_worker_class,),
        {"death_penalty_class": death_penalty_class},
    )


def main() -> None:
    settings = get_settings()
    from redis import Redis
    from rq import Connection

    redis = Redis.from_url(settings.redis_url)
    with Connection(redis):
        worker_class = build_worker_class(
            select_worker_class(),
            select_death_penalty_class(),
        )
        worker = worker_class([settings.agent_queue_name])
        worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
