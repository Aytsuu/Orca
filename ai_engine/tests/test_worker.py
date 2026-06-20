from __future__ import annotations

import asyncio

from src.tasks import worker


def test_select_worker_class_uses_simple_worker_when_fork_is_unavailable(monkeypatch) -> None:
    monkeypatch.delattr(worker.os, "fork", raising=False)

    selected = worker.select_worker_class()

    assert selected.__name__ == "SimpleWorker"


def test_select_worker_class_uses_standard_worker_when_fork_is_available(monkeypatch) -> None:
    monkeypatch.setattr(worker.os, "fork", lambda: 0, raising=False)

    selected = worker.select_worker_class()

    assert selected.__name__ == "Worker"


def test_select_death_penalty_class_uses_timer_when_sigalrm_is_unavailable(monkeypatch) -> None:
    monkeypatch.delattr(worker.signal, "SIGALRM", raising=False)

    selected = worker.select_death_penalty_class()

    assert selected.__name__ == "TimerDeathPenalty"


def test_select_death_penalty_class_uses_unix_signal_when_sigalrm_is_available(
    monkeypatch,
) -> None:
    monkeypatch.setattr(worker.signal, "SIGALRM", object(), raising=False)

    selected = worker.select_death_penalty_class()

    assert selected.__name__ == "UnixSignalDeathPenalty"


def test_build_worker_class_applies_selected_death_penalty() -> None:
    base_class = worker.select_worker_class()
    death_penalty_class = worker.select_death_penalty_class()

    configured_class = worker.build_worker_class(base_class, death_penalty_class)

    assert configured_class is not base_class
    assert issubclass(configured_class, base_class)
    assert configured_class.death_penalty_class is death_penalty_class


def test_transcribe_source_file_job_runs_async_transcription(monkeypatch) -> None:
    recorded: dict[str, str] = {}
    real_asyncio_run = asyncio.run

    async def fake_run_transcription(uploaded_file_id: str, project_id: str) -> None:
        recorded["uploaded_file_id"] = uploaded_file_id
        recorded["project_id"] = project_id

    def fake_asyncio_run(coroutine):
        return real_asyncio_run(coroutine)

    monkeypatch.setattr(worker, "_run_transcription", fake_run_transcription)
    monkeypatch.setattr(worker.asyncio, "run", fake_asyncio_run)

    worker.transcribe_source_file_job("file-123", "project-456")

    assert recorded == {
        "uploaded_file_id": "file-123",
        "project_id": "project-456",
    }
