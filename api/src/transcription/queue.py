from __future__ import annotations

import logging
from functools import lru_cache
from typing import Protocol

from src.config import Settings, get_settings

logger = logging.getLogger(__name__)


class TranscriptQueueProducer(Protocol):
    def enqueue_transcription(self, uploaded_file_id: str, project_id: str) -> str | None: ...


def build_transcription_job_id(uploaded_file_id: str) -> str:
    return f"source-transcript:{uploaded_file_id}"


def build_transcription_retry(settings: Settings):
    retry_max = max(0, int(settings.transcript_queue_retry_max))
    if retry_max <= 1:
        return None

    from rq import Retry

    base_delay = max(0, int(settings.transcript_queue_retry_backoff_seconds))
    intervals = [base_delay * attempt for attempt in range(1, retry_max)]
    return Retry(max=retry_max, interval=intervals or 0)


class RqTranscriptQueueProducer:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def enqueue_transcription(self, uploaded_file_id: str, project_id: str) -> str | None:
        if not self._settings.redis_url:
            logger.info(
                "transcript_enqueue_skipped project_id=%s uploaded_file_id=%s reason=no_redis",
                project_id,
                uploaded_file_id,
            )
            return None

        from redis import Redis
        from rq import Queue

        queue = Queue(
            name=self._settings.transcript_queue_name,
            connection=Redis.from_url(self._settings.redis_url),
        )
        job = queue.enqueue(
            "src.tasks.worker.transcribe_source_file_job",
            uploaded_file_id,
            project_id,
            job_timeout=self._settings.transcript_queue_timeout_seconds,
            job_id=build_transcription_job_id(uploaded_file_id),
            retry=build_transcription_retry(self._settings),
        )
        logger.info(
            "transcript_enqueued project_id=%s uploaded_file_id=%s queue=%s job_id=%s",
            project_id,
            uploaded_file_id,
            self._settings.transcript_queue_name,
            job.id,
        )
        return job.id


@lru_cache
def get_transcript_queue_producer() -> TranscriptQueueProducer:
    return RqTranscriptQueueProducer(get_settings())
