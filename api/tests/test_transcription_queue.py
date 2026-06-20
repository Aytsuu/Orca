from __future__ import annotations

import sys
import types
from dataclasses import dataclass

from src.transcription.queue import RqTranscriptQueueProducer


@dataclass
class FakeSettings:
    redis_url: str = "redis://localhost:6379/0"
    transcript_queue_name: str = "orca-transcripts"
    transcript_queue_timeout_seconds: int = 600
    transcript_queue_retry_max: int = 3
    transcript_queue_retry_backoff_seconds: int = 10


class FakeJob:
    def __init__(self, job_id: str) -> None:
        self.id = job_id


class FakeQueue:
    calls: list[dict] = []

    def __init__(self, *, name: str, connection: object) -> None:
        self.name = name
        self.connection = connection

    def enqueue(self, func: str, uploaded_file_id: str, project_id: str, **kwargs) -> FakeJob:
        self.calls.append(
            {
                "func": func,
                "uploaded_file_id": uploaded_file_id,
                "project_id": project_id,
                "kwargs": kwargs,
            }
        )
        return FakeJob(kwargs["job_id"])


class FakeRetry:
    def __init__(self, max: int, interval):
        self.max = max
        self.interval = interval


class FakeRedis:
    @classmethod
    def from_url(cls, redis_url: str) -> str:
        return redis_url


def test_transcript_queue_producer_uses_stable_job_ids(monkeypatch) -> None:
    FakeQueue.calls = []
    monkeypatch.setitem(sys.modules, "redis", types.SimpleNamespace(Redis=FakeRedis))
    monkeypatch.setitem(
        sys.modules,
        "rq",
        types.SimpleNamespace(Queue=FakeQueue, Retry=FakeRetry),
    )

    producer = RqTranscriptQueueProducer(FakeSettings())

    job_id = producer.enqueue_transcription("file-1", project_id="project-1")

    assert job_id == "source-transcript:file-1"
    assert len(FakeQueue.calls) == 1
    call = FakeQueue.calls[0]
    assert call["func"] == "src.tasks.worker.transcribe_source_file_job"
    assert call["uploaded_file_id"] == "file-1"
    assert call["project_id"] == "project-1"
    assert call["kwargs"]["job_timeout"] == 600
    assert call["kwargs"]["job_id"] == "source-transcript:file-1"
    assert call["kwargs"]["retry"].max == 3
    assert call["kwargs"]["retry"].interval == [10, 20]
