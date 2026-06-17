from __future__ import annotations

import sys
import types
from dataclasses import dataclass

from src.tasks import worker


@dataclass
class FakeSettings:
    redis_url: str = "redis://localhost:6379/0"
    agent_queue_name: str = "orca-agent-pipeline"
    agent_queue_timeout_seconds: int = 300


class FakeJob:
    def __init__(self, job_id: str) -> None:
        self.id = job_id


class FakeQueue:
    calls: list[dict] = []

    def __init__(self, *, name: str, connection: object) -> None:
        self.name = name
        self.connection = connection

    def enqueue_in(self, delta, func: str, run_id: str, **kwargs) -> FakeJob:
        self.calls.append(
            {
                "delay_seconds": int(delta.total_seconds()),
                "func": func,
                "run_id": run_id,
                "kwargs": kwargs,
            }
        )
        return FakeJob(kwargs["job_id"])


class FakeRedis:
    @classmethod
    def from_url(cls, redis_url: str) -> str:
        return redis_url


def test_build_requeue_run_uses_stable_retry_job_id(monkeypatch) -> None:
    FakeQueue.calls = []
    fake_redis_module = types.SimpleNamespace(Redis=FakeRedis)
    fake_rq_module = types.SimpleNamespace(Queue=FakeQueue)
    monkeypatch.setitem(sys.modules, "redis", fake_redis_module)
    monkeypatch.setitem(sys.modules, "rq", fake_rq_module)

    requeue_run = worker.build_requeue_run(FakeSettings())

    job_id = requeue_run("run-1", delay_seconds=5)

    assert job_id == "agent-run:run-1:retry"
    assert FakeQueue.calls == [
        {
            "delay_seconds": 5,
            "func": "src.tasks.worker.run_project_pipeline_job",
            "run_id": "run-1",
            "kwargs": {
                "job_timeout": 300,
                "job_id": "agent-run:run-1:retry",
            },
        }
    ]
