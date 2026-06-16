from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from src.config import Settings, get_settings


class QueueProducer(Protocol):
    def enqueue_run(self, run_id: str) -> str | None:
        ...


class RqQueueProducer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def enqueue_run(self, run_id: str) -> str | None:
        if not self._settings.redis_url:
            return None

        from redis import Redis
        from rq import Queue

        queue = Queue(
            name=self._settings.agent_queue_name,
            connection=Redis.from_url(self._settings.redis_url),
        )
        job = queue.enqueue(
            "src.tasks.worker.run_project_pipeline_job",
            run_id,
            job_timeout=self._settings.agent_queue_timeout_seconds,
        )
        return job.id


@lru_cache
def get_queue_producer() -> QueueProducer:
    return RqQueueProducer(get_settings())
