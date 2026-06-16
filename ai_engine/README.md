# Orca AI Engine

Monorepo package for the Orca Phase 3 agent pipeline.

This app is intentionally separate from the API layer so the HTTP contract and
the worker orchestration can evolve independently.

## Scope

`ai_engine` owns:

- agent implementations (`monitor`, `analyzer`, `planner`, `updater`)
- queue and pipeline orchestration
- prompt templates and model-facing logic
- context assembly, guardrails, and proposal staging

The API remains responsible for:

- HTTP APIs
- request validation
- session handling
- persistence entrypoints
- enqueueing agent work

## Local setup

```powershell
cd ai_engine
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e .[dev]
```

## Worker

Primary queue worker:

```powershell
python -m src.tasks.worker
```

The API enqueues `run_project_pipeline_job(run_id)` into Redis/RQ. Each job
loads the `agent_run`, assembles context, executes Monitor -> Analyzer ->
Planner with short-circuiting, persists `agent_artifact` rows, and stages a
`plan_proposal` for approval.

Gemini configuration is owned by `ai_engine`. The worker reads
`LLM_API_KEY` from `ai_engine/.env`; values in `api/.env` do not power the
current LLM pipeline unless the API later adds its own model calls.

## Gemini smoke test

Run a live structured-output smoke call from the `ai_engine` environment:

```powershell
cd ai_engine
.venv\Scripts\python.exe -m src.llm.smoke
```

Expected output:

```text
{'ok': True, 'msg': 'pong'}
```

## Fallback

If Redis becomes the blocker during the hackathon, the intended fallback is a
Supabase-polling worker that processes queued `agent_run` rows directly. That
fallback is documented but not implemented unless Redis setup proves infeasible.
