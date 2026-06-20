from __future__ import annotations

import asyncio
import logging
import os
import signal
from datetime import timedelta

from src.config import get_settings
from src.pipelines.locks import RedisProjectLockManager
from src.pipelines.runner import run_project_pipeline
from src.supabase_client import get_supabase_admin
from src.transcription.service import transcribe_uploaded_file

logger = logging.getLogger(__name__)


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


async def _run_transcription(uploaded_file_id: str, project_id: str) -> None:
    supabase = await get_supabase_admin()
    await transcribe_uploaded_file(
        supabase,
        project_id=project_id,
        uploaded_file_id=uploaded_file_id,
    )


def run_project_pipeline_job(run_id: str) -> None:
    asyncio.run(_run(run_id))


def transcribe_source_file_job(uploaded_file_id: str, project_id: str) -> None:
    logger.info(
        "transcript_job_started project_id=%s uploaded_file_id=%s",
        project_id,
        uploaded_file_id,
    )
    asyncio.run(_run_transcription(uploaded_file_id, project_id))
    logger.info(
        "transcript_job_completed project_id=%s uploaded_file_id=%s",
        project_id,
        uploaded_file_id,
    )


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


def _work(queue_name: str) -> None:
    settings = get_settings()
    from redis import Redis
    from rq import Connection

    redis = Redis.from_url(settings.redis_url)
    with Connection(redis):
        worker_class = build_worker_class(
            select_worker_class(),
            select_death_penalty_class(),
        )
        worker = worker_class([queue_name])
        try:
            worker.work(with_scheduler=True)
        except KeyboardInterrupt:
            print("RQ worker interrupted. Shutting down.")


def main() -> None:
    _work(get_settings().agent_queue_name)


def transcription_main() -> None:
    _work(get_settings().transcript_queue_name)


if __name__ == "__main__":
    main()
