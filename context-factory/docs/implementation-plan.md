# Product Implementation Plan

> **Hackathon mode:** Authentication is deferred. Each browser session = one user. No login/signup needed until post-demo.

---

## Status Key

- `[ ]` Not started
- `[/]` In progress or partially complete
- `[x]` Complete
- `[-]` Deferred or intentionally out of scope for the current phase

---

## [x] Phase 0 - Project Setup

- [x] Initialize frontend repo (Astro + React + TypeScript + Tailwind)
- [x] Initialize backend repo (FastAPI, Python 3.11+)
- [x] Create Supabase project - get URL, anon key, service key
- [x] Create `.env` files for both frontend and backend
- [x] Confirm both dev servers run locally

---

## [x] Phase 1 - Database Schema

- [x] `project` table - id, name, description, created_at
- [x] `project_member` table - id, project_id, session_id, role (`creator` | `approver` | `member`), can_approve, can_edit
- [x] `chat_message` table - id, project_id, session_id, content, created_at
- [x] `uploaded_file` table - id, project_id, session_id, storage_path, mime_type, created_at
- [x] `agent_status` table - id, project_id, agent (`monitor` | `analyzer` | `planner` | `updater`), status, updated_at
- [x] `plan_proposal` table - id, project_id, status (`pending` | `approved` | `rejected` | `applied`), changes (jsonb), created_at
- [x] `project_plan` table - id, project_id, content (jsonb), version, finalized_at
- [x] `plan_version` table - id, project_id, content (jsonb), created_at *(max 3 reverts enforced in code)*
- [x] Enable Supabase Realtime on: `chat_message`, `agent_status`, `plan_proposal`, `project_plan`
- [x] Configure Supabase Storage bucket for file uploads

---

## [x] Phase 2 - API (FastAPI)

### Infrastructure
- [x] `main.py` - app setup, lifespan, router registration
- [x] `supabase_client.py` - async client factory
- [x] `config.py` - global settings via pydantic-settings
- [x] `exceptions.py` - base exception hierarchy

### Projects domain
- [x] `POST /api/v1/projects` - create project, auto-add creator session as `creator` member
- [x] `GET /api/v1/projects` - list projects for current session
- [x] `GET /api/v1/projects/{project_id}` - get single project

### Chat domain
- [x] `POST /api/v1/projects/{project_id}/messages` - persist message; Realtime delivers it
- [x] `GET /api/v1/projects/{project_id}/messages` - fetch message history
- [x] `GET /api/v1/projects/{project_id}/files/upload-url` - return signed Supabase Storage URL

### Members domain *(simplified - no real auth, use session_id)*
- [x] `POST /api/v1/projects/{project_id}/members` - add a session as a member with a role
- [x] `PATCH /api/v1/projects/{project_id}/members/{session_id}/permissions` - update can_approve / can_edit

### Plans domain
- [x] `GET /api/v1/projects/{project_id}/plan` - return current finalized plan
- [x] `GET /api/v1/projects/{project_id}/plan/proposal` - return pending proposal (approvers only)
- [x] `POST /api/v1/projects/{project_id}/plan/approve` - approve proposal items; trigger Updater
- [x] `POST /api/v1/projects/{project_id}/plan/reject` - reject proposal; mark as rejected
- [x] `POST /api/v1/projects/{project_id}/plan/revert` - revert to previous version (max 3)

### Agents domain
- [x] `GET /api/v1/projects/{project_id}/agents/status` - return agent pipeline status
- [x] `POST /api/v1/projects/{project_id}/agents/trigger` - manually trigger pipeline (approvers only)

---

## [/] Phase 3 - AI Engine (FastAPI)

> Phase 3 is now partially implemented: schema migration, API queue/run plumbing,
> `ai_engine` scaffolding, worker entrypoint, context builder, core guardrails,
> Monitor/Analyzer/Planner pipeline, deterministic updater hardening, and
> backend tests are in place. Remaining work is primarily hybrid debounce,
> per-project locking, retry/backoff, planner fallback/repair flow, input
> sanitization completion, and broader test coverage.

### Schema Migration

- [ ] `agent_run` table — `id`, `project_id`, `triggered_by`, `status` (`queued` | `running` | `completed` | `failed`), `new_message_ids`, `new_file_ids`, `error_code`, `error_message`, `created_at`, `started_at`, `completed_at`
- [ ] `project_memory` table — `id`, `project_id`, `kind` (`decision` | `task` | `risk` | `requirement` | `summary` | `detail`), `content`, `source_message_ids`, `source_file_ids`, `confidence`, `status` (`active` | `resolved` | `superseded`), `created_at`, `updated_at`
- [ ] `conversation_summary` table — `id`, `project_id`, `summary`, `source_message_ids`, `last_message_created_at`, `created_at`
- [ ] `agent_artifact` table — `id`, `run_id`, `project_id`, `agent`, `payload`, `created_at`
- [ ] `project_llm_usage` table — `id`, `project_id`, `date`, `call_count`; unique on `(project_id, date)`
- [ ] Add `superseded` to `plan_proposal_status` enum
- [ ] Enable Supabase Realtime on `agent_artifact`

### Queue & Harness

- [ ] `REDIS_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_FAST_MODEL`, `LLM_API_KEY` in `ai_engine/src/config.py` (via pydantic-settings); also add `daily_llm_budget_per_project`, `debounce_message_count`, `debounce_silence_seconds`, `summary_message_threshold`
- [ ] RQ + Redis worker entrypoint at `ai_engine/src/tasks/worker.py`
- [ ] Queue producer in `api/src/agents/service.py`
- [ ] `POST /agents/trigger` — validate approver permission, create `agent_run`, enqueue `run_project_pipeline(run_id)`, return `202`
- [ ] `POST /messages` — persist message then run hybrid debounce logic (3 messages OR 8s silence, configurable); enqueue pipeline with accumulated message IDs; if pipeline already active, mark IDs for next run
- [ ] Per-project Redis lock with 5-min TTL — one active pipeline per project, parallel across projects
- [ ] Retry transient failures up to 3× with exponential backoff; on final failure write `agent_run.status = failed` and persist error artifact; never apply partial plan changes
- [ ] Document Supabase-polling fallback worker (`supabase_worker.py`) in `ai_engine/README.md` — build only if Redis is blocked

### LLM Adapter

- [ ] `ai_engine/src/llm/client.py` — `generate_json(prompt, schema, model, temperature)` interface
- [ ] `ai_engine/src/llm/gemini.py` — Google GenAI implementation with native JSON mode (`response_schema`)
- [ ] `ai_engine/src/llm/fake.py` — deterministic fake for tests
- [ ] In-memory token-bucket rate limiter (15 RPM default)
- [ ] Model fallback chain: `gemini-2.5-flash` → on 429 → `gemini-2.5-flash-lite` → exponential backoff → queue job for later
- [ ] Triple-layer output enforcement: Gemini JSON mode → Pydantic validation → repair-retry (1 retry with error + original prompt); on second failure → `INVALID_OUTPUT`, run fails

### Context Builder

- [ ] `ContextBuilder` in `ai_engine/src/context/builder.py`
- [ ] `RetrievalStrategy` Protocol — `retrieve(project_id, query_messages, limit) -> list[dict]`
- [ ] `KeywordRetrievalStrategy` — recency + keyword overlap (Phase 3 default)
- [ ] Priority-based context assembly (highest first): current plan (always) → new messages for this run (always) → active project memory → conversation summaries → file metadata (filename + mime type only)
- [ ] Token budget: estimate via `len(text) / 4`; warn if >100K tokens; trim from priority 5→4→3 reverse-recency if needed
- [ ] Hard rule: never load full chat history; every item must carry `source_message_ids`

### Guardrail Layer

- [ ] Input sanitization: truncate messages >10K chars, cap at 50 messages per run (most recent), verify referenced message IDs exist
- [ ] Output validation: reject fabricated `source_message_ids`, reject `remove` action without explicit conversation evidence, downgrade `confidence: high` to `medium` if only 1 source, deduplicate by content similarity
- [ ] Safety-check prompt (flash-lite, temp 0.0) after Planner — verifies justification references real messages, no unsupported removes, no destructive changes, confidence matches evidence; returns `{safe, violations}`

### Agent Steps (AgentStep interface with `should_continue`)

- [ ] `StepResult` dataclass — `agent`, `output`, `should_continue`, `artifacts`, `skipped`
- [ ] `AgentStep` ABC — `execute(context, prior_results) -> StepResult`
- [ ] **Monitor Step** — `gemini-2.5-flash-lite`, temp `0.0`; extracts `decisions`, `tasks`, `requirements`, `risks`, `open_questions`, `summary_candidate`; every item must have `source_message_ids`, `excerpt`, `confidence`; persists facts to `project_memory` and output to `agent_artifact`; `should_continue = False` if zero actionable items (summary alone does not count)
- [ ] **Analyzer Step** — `gemini-2.5-flash`, temp `0.1`; inputs Monitor output + plan + memory; outputs `gaps`, `risks`, `conflicts`, `missing_information`, `panel_suggestions`; severity must be `critical` | `major` | `minor`; no hallucinated gaps; `should_continue = False` if zero gaps/risks/conflicts
- [ ] **Planner Step** — `gemini-2.5-flash`, temp `0.2`; creates proposal diff; writes to `plan_proposal` with `status: pending`; supersedes existing pending proposal (marks old as `superseded`); runs safety-check prompt before persisting; prefer `add`/`update`, `remove` only on explicit user request; never writes `project_plan` directly
- [ ] **Pipeline Runner** — iterates steps, short-circuits on `should_continue = False`; marks skipped steps as `completed` with `{skipped: true, reason: "no_actionable_input"}` artifact
- [ ] **Updater** — deterministic only, no LLM; applies only approved items; writes previous plan to `plan_version` (max 3); marks proposal `applied`; updates `agent_status.updater`; idempotency guard (reject if proposal not `pending`); only callable through approval endpoint after permission check

### Conversation Summarization

- [ ] Inline path: Monitor's `summary_candidate` committed to `conversation_summary` if it covers unsummarized messages
- [ ] Background threshold: on every `POST /messages`, check count of messages since last summary; if ≥15, enqueue summarization-only job using `gemini-2.5-flash-lite`, temp `0.0`

### Per-Project LLM Budget

- [ ] Track calls in `project_llm_usage` (date-bucketed); reset midnight UTC
- [ ] Soft cap at 80 calls/day: skip Planner, run Monitor + Analyzer only
- [ ] Hard cap at 100 calls/day: skip pipeline entirely, surface warning in AI Activity panel

### Data Access

- [ ] `ai_engine` gets its own Supabase client (service key); no import dependencies between `api` and `ai_engine`

### Tests

- [ ] Contract tests: reject missing citations, invalid confidence, malformed proposal changes, unsupported actions
- [ ] Fake-LLM unit tests for Monitor, Analyzer, Planner outputs
- [ ] Context Builder tests: assert full history never loaded, source message IDs preserved
- [ ] Pipeline short-circuit tests (no items → stop early)
- [ ] Updater tests: partial approval, double-approval rejection, version history, rejected proposal no-op
- [ ] Queue harness tests: trigger enqueue, message-created debounce behavior
- [ ] REST integration tests (hit actual API endpoints)


---

## [x] Phase 4 - Frontend

### Layout & Design System
- [x] Global CSS / Tailwind config - color palette, typography, dark mode
- [x] Page shell - sidebar nav, tab switching

### Homepage
- [x] Project list - card grid, "Create Project" button
- [x] Create Project modal - name, description fields

### Project Interface - Chat Tab
- [x] 3-column layout: Files (left) | Chat (center) | AI Activity (right)
- [x] Chat center: message list (Realtime subscription), message input, file attach button
- [x] Files left panel: uploaded file list, upload trigger
- [x] AI Activity right panel: agent status indicator, extracted items, gap/risk report, proposal preview

### Project Interface - Plan Tab
- [x] Plan viewer - renders current finalized plan content
- [x] Proposal diff view - shows pending changes with Accept / Reject controls per item (approvers only)
- [x] Version history - list of past versions with revert button (max 3)
- [x] "Plan finalized" notification for non-approver members

### Session Identity *(replaces auth)*
- [x] On first load, generate and persist a `session_id` to localStorage
- [x] Pass `session_id` as a header (`X-Session-Id`) on all API requests
- [x] Backend reads `X-Session-Id` to identify "current user"

---

## Phase 5 - Integration & Polish

### Frontend Integration (Phase 3 backend wire-up)

- [ ] Map backend statuses to UI: `queued` → idle/queued, `running` → active, `completed` → complete, `failed` → error
- [ ] Subscribe to `agent_artifact` Realtime channel per project; update AI Activity panel on INSERT
- [ ] Show "Updated proposal available — previous version archived" when proposal superseded
- [ ] Show budget warning in AI Activity panel when hard cap reached
- [ ] Remove localStorage fallbacks for agent state (keep only if backend unavailable during demo)

### End-to-End & Polish

- [ ] End-to-end flow: create project -> chat -> agent runs -> proposal appears -> approve -> plan updates
- [ ] Realtime: confirm messages, agent status, and plan updates all propagate to UI without refresh
- [ ] File upload flow: select file -> get signed URL -> upload to Supabase Storage -> persist record -> agent indexes it
- [ ] Error states: agent failure shown in AI Activity panel; empty states on all list views
- [ ] Responsive layout check (desktop + tablet minimum)
- [ ] Demo script walkthrough - verify all MVP user steps work end to end

---

## Deferred (Post-Hackathon)

- [-] Authentication (Supabase Auth - JWT, login, signup, session refresh)
- [-] Row Level Security (RLS) policies - replace session_id guards with `auth.uid()`
- [-] MCP tool server integration
- [-] PDF / DOCX export
- [-] Mobile layout
