from __future__ import annotations

import sys
import types
from dataclasses import dataclass

from src.agents.queue import RqQueueProducer


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

    def enqueue(self, func: str, run_id: str, **kwargs) -> FakeJob:
        self.calls.append({"method": "enqueue", "func": func, "run_id": run_id, "kwargs": kwargs})
        return FakeJob(kwargs["job_id"])

    def enqueue_in(self, delta, func: str, run_id: str, **kwargs) -> FakeJob:
        self.calls.append(
            {
                "method": "enqueue_in",
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


def test_rq_queue_producer_uses_stable_job_ids(monkeypatch) -> None:
    FakeQueue.calls = []
    fake_redis_module = types.SimpleNamespace(Redis=FakeRedis)
    fake_rq_module = types.SimpleNamespace(Queue=FakeQueue)
    monkeypatch.setitem(sys.modules, "redis", fake_redis_module)
    monkeypatch.setitem(sys.modules, "rq", fake_rq_module)

    producer = RqQueueProducer(FakeSettings())

    immediate_job_id = producer.enqueue_run("run-1")
    delayed_job_id = producer.enqueue_run("run-1", delay_seconds=8)

    assert immediate_job_id == "agent-run:run-1:immediate"
    assert delayed_job_id == "agent-run:run-1:delayed"
    assert FakeQueue.calls == [
        {
            "method": "enqueue",
            "func": "src.tasks.worker.run_project_pipeline_job",
            "run_id": "run-1",
            "kwargs": {
                "job_timeout": 300,
                "job_id": "agent-run:run-1:immediate",
            },
        },
        {
            "method": "enqueue_in",
            "delay_seconds": 8,
            "func": "src.tasks.worker.run_project_pipeline_job",
            "run_id": "run-1",
            "kwargs": {
                "job_timeout": 300,
                "job_id": "agent-run:run-1:delayed",
            },
        },
    ]
