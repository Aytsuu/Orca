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

On Windows, the worker automatically falls back to RQ `SimpleWorker` and
`TimerDeathPenalty` because the default fork-based worker and `SIGALRM` timeout
handling are Unix-only.

The API enqueues `run_project_pipeline_job(run_id)` into Redis/RQ. The worker
runs with RQ scheduler support enabled so delayed debounce jobs are processed.
Each job loads the `agent_run`, acquires `pipeline_lock:{project_id}` for up to
5 minutes, assembles context, executes Monitor -> Analyzer -> Planner with
short-circuiting, persists `agent_artifact` rows, and stages a `plan_proposal`
for approval.

Chat messages use hybrid debounce from the API side:

- first message schedules a delayed run after `DEBOUNCE_SILENCE_SECONDS`
- once `DEBOUNCE_MESSAGE_COUNT` pending messages accumulate, the same run is
  enqueued immediately
- duplicate delayed jobs are safe because completed runs are ignored by the
  worker
- if a project lock is busy, the run remains `queued` and the worker requeues
  the same run after a short delay instead of marking it complete

Gemini configuration is owned by `ai_engine`. The worker reads
`LLM_API_KEY` from `ai_engine/.env`; values in `api/.env` do not power the
current LLM pipeline unless the API later adds its own model calls.

## Gemini fallback profile

The primary and fallback LLM profiles are both server-side `ai_engine`
configuration. The fallback profile is optional; if `LLM_FALLBACK_API_KEY` is
blank, the worker keeps using only the primary Gemini profile.

```dotenv
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.5-flash
LLM_FAST_MODEL=gemini-2.5-flash-lite
LLM_API_KEY=

LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDER=gemini
LLM_FALLBACK_MODEL=gemini-2.5-flash
LLM_FALLBACK_FAST_MODEL=gemini-2.5-flash-lite
LLM_FALLBACK_API_KEY=
```

Fallback behavior:

- primary rate limits first try the primary fast model
- quota, auth, transport, repeated rate-limit, and invalid model-output errors
  can move to the fallback profile when configured
- local schema/configuration errors fail fast and do not call fallback
- artifact metadata records only safe fields such as provider profile, model,
  fallback usage, attempt count, and final error code

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

Run the same smoke test against the fallback profile:

```powershell
cd ai_engine
.venv\Scripts\python.exe -m src.llm.smoke --profile fallback
```

## Planner schema smoke test

Print the exact planner `response_schema` that the Gemini client sends:

```powershell
cd ai_engine
.venv\Scripts\python.exe -m src.llm.schema_smoke
```

Use this when Gemini rejects a planner request with `INVALID_ARGUMENT` and you
need to inspect the emitted schema locally without making a live API call.

## Redis contingency fallback

If Redis becomes the blocker during the hackathon, the intended fallback is a
Supabase-polling worker that processes queued `agent_run` rows directly. That
fallback is documented but not implemented unless Redis setup proves infeasible.
