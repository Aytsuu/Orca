from __future__ import annotations

import os
from datetime import timedelta
from functools import lru_cache
from typing import Protocol

from src.config import Settings, get_settings


class QueueProducer(Protocol):
    def enqueue_run(self, run_id: str, *, delay_seconds: int | None = None) -> str | None:
        ...


def build_run_job_id(run_id: str, *, delay_seconds: int | None = None) -> str:
    suffix = "delayed" if delay_seconds is not None and delay_seconds > 0 else "immediate"
    return f"agent-run:{run_id}:{suffix}"


def runtime_supports_delayed_enqueue() -> bool:
    return hasattr(os, "fork")


class RqQueueProducer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def enqueue_run(self, run_id: str, *, delay_seconds: int | None = None) -> str | None:
        if not self._settings.redis_url:
            return None

        from redis import Redis
        from rq import Queue

        queue = Queue(
            name=self._settings.agent_queue_name,
            connection=Redis.from_url(self._settings.redis_url),
        )
        effective_delay_seconds = delay_seconds
        if effective_delay_seconds is not None and effective_delay_seconds > 0:
            if not runtime_supports_delayed_enqueue():
                effective_delay_seconds = None
        job_kwargs = {
            "job_timeout": self._settings.agent_queue_timeout_seconds,
            "job_id": build_run_job_id(run_id, delay_seconds=effective_delay_seconds),
        }
        if effective_delay_seconds is not None and effective_delay_seconds > 0:
            job = queue.enqueue_in(
                timedelta(seconds=effective_delay_seconds),
                "src.tasks.worker.run_project_pipeline_job",
                run_id,
                **job_kwargs,
            )
        else:
            job = queue.enqueue(
                "src.tasks.worker.run_project_pipeline_job",
                run_id,
                **job_kwargs,
            )
        return job.id


@lru_cache
def get_queue_producer() -> QueueProducer:
    return RqQueueProducer(get_settings())
