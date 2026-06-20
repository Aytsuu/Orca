# Orca Next Development Plan

## Summary

Orca is currently in **late Phase 3 / early Phase 5 transition**.

Phase 0, Phase 1, Phase 2, and most of Phase 4 are implemented. The project is not ready to treat Phase 5 as the main focus yet because the **Phase 3 backend/AI integration contract is still incomplete**.

Verified current state:

- `web` builds successfully with `npm run build`.
- `ai_engine` tests pass with `ai_engine\.venv\Scripts\python.exe -m pytest`.
- `api` tests partially fail: `17 passed, 3 failed`.
- The failing API tests point to missing routes for uploaded file finalization/listing and latest AI activity/proposal reads.

Primary priority: **finish the API + AI backend contract before polishing the frontend.**

## Current Phase

The project should be considered in **Phase 3B: AI Engine Integration Hardening**.

Phase 3 core scaffolding exists:

- `agent_run`, `project_memory`, `conversation_summary`, `agent_artifact`, and `project_llm_usage` migration exists.
- `ai_engine` has context builder, guardrails, LLM clients, pipeline runner, RQ worker, and tests.
- API can create/reuse `agent_run` rows and enqueue RQ jobs.
- Frontend has the shell and UI, but major chat/plan/AI activity behavior is still mock/local state.

Phase 3 is not complete because:

- API has missing endpoints already expected by tests.
- Message debounce is not implemented as designed.
- Per-project Redis locking is not implemented.
- Retry/backoff and model fallback are incomplete.
- Agent status updates are not fully wired through the pipeline.
- Frontend still simulates chat messages, files, agent status, and suggestions.

## Priority Implementation Plan

### 1. Repair API Contract First

Goal: make the existing backend tests pass before adding new behavior.

Implement these missing endpoints:

- `POST /api/v1/projects/{project_id}/files`
- `GET /api/v1/projects/{project_id}/files`
- `GET /api/v1/projects/{project_id}/agents/artifacts/latest`
- `GET /api/v1/projects/{project_id}/plan/proposals/latest`

Expected behavior:

- File finalization persists `filename`, `mime_type`, `storage_path`, `size_bytes`, `session_id`, and `project_id` into `uploaded_file`.
- File finalization rejects any `storage_path` outside `{project_id}/{session_id}/...`.
- File finalization triggers an agent run with `new_file_ids`.
- Latest artifact endpoint returns newest useful `agent_artifact` rows for the project.
- Latest proposal endpoint returns the newest proposal, including `superseded` and `pending`.

Acceptance:

```powershell
cd K:\Orca\api
.venv\Scripts\python.exe -m pytest
```

Expected: all API tests pass.

### 2. Finish Phase 3 Harness Reliability

Goal: make the AI pipeline reliable enough for demo and local development.

Implement next:

- Hybrid debounce: trigger pipeline after `3` messages or `8` seconds of silence.
- Per-project Redis lock with `pipeline_lock:{project_id}`, TTL `300` seconds.
- Retry transient LLM/network failures up to `3` times with exponential backoff.
- Gemini fallback chain: `gemini-2.5-flash` to `gemini-2.5-flash-lite` on rate-limit errors.
- Soft budget behavior: at `80%` daily usage, run Monitor + Analyzer but skip Planner.
- Hard budget behavior: at `100` calls/day, skip pipeline and create visible warning artifact.
- Agent status updates inside `ai_engine`: queued, running, completed, failed per agent.

Acceptance:

```powershell
cd K:\Orca\ai_engine
.venv\Scripts\python.exe -m pytest
```

Add or update tests for debounce, locking, retry/fallback, budget skipping, and agent status transitions.

### 3. Wire Frontend To Real Backend Data

Goal: replace demo-only state with real API and Realtime data.

Implement next:

- Chat sends real messages through `POST /messages`.
- Chat loads message history from `GET /messages`.
- File panel uses signed upload URL, uploads to Supabase Storage, then finalizes via `POST /files`.
- AI Activity reads agent statuses and latest artifacts from backend.
- Plan tab reads current plan and latest proposal from backend.
- Approve/reject/revert buttons call real plan endpoints.
- Remove mock AI pipeline animation once real statuses are available.

Keep localStorage only for `session_id` and temporary offline fallback.

Acceptance:

```powershell
cd K:\Orca\web
npm run build
```

Manual demo flow must work:

1. Create project.
2. Send chat message.
3. Agent run is queued.
4. Worker processes run.
5. AI artifact/proposal appears.
6. Approve proposal.
7. Plan updates.

### 4. End-To-End Demo Stabilization

Goal: prove the full system works from browser to worker.

Run services in separate terminals:

```powershell
docker start orca-redis
cd K:\Orca\api
.venv\Scripts\Activate.ps1
uvicorn src.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd K:\Orca\ai_engine
.venv\Scripts\Activate.ps1
python -m src.tasks.worker
```

```powershell
cd K:\Orca\web
npm run dev
```

Acceptance checklist:

- Redis container is running.
- API health endpoint returns OK.
- Worker connects to Redis and listens on `orca-agent-pipeline`.
- Frontend opens on the printed Astro port.
- Sending a message creates `chat_message` and `agent_run`.
- Worker writes `agent_artifact`.
- Proposal approval writes `project_plan`.

## Public API / Interface Additions

Add or stabilize these API responses:

- `UploadedFileOut`: `id`, `project_id`, `session_id`, `filename`, `storage_path`, `mime_type`, `size_bytes`, `created_at`.
- `AgentArtifactOut`: `id`, `run_id`, `project_id`, `agent`, `payload`, `created_at`.
- `ProposalOut` already supports `superseded`; expose latest proposal through `/plan/proposals/latest`.

No new frontend public environment variables are required beyond:

- `PUBLIC_API_BASE_URL=http://127.0.0.1:8000`

## Test Plan

Run in this order:

```powershell
cd K:\Orca\api
.venv\Scripts\python.exe -m pytest
```

```powershell
cd K:\Orca\ai_engine
.venv\Scripts\python.exe -m pytest
```

```powershell
cd K:\Orca\web
npm run build
```

Then run the full local stack and test the browser flow manually.

## Assumptions

- Optimize for **MVP/demo readiness**, not post-hackathon auth/RLS hardening.
- Keep Redis/RQ as the primary queue.
- Keep Supabase-polling worker as documented fallback only.
- Defer MCP, OCR/transcription, semantic embeddings, PDF/DOCX export, and real authentication.
- Frontend polish should wait until backend API and worker behavior are stable.
