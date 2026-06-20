# Phase 3 AI Agent Pipeline Implementation Plan

## Summary

Build Phase 3 as a real production-shaped agent pipeline using the three-pillar model:

- **Prompt engineering:** strict role prompts, structured JSON outputs, source citation rules.
- **Context engineering:** persistent project memory, recent-message context, summaries, current plan, and source-backed retrieval.
- **Harness engineering:** Redis-backed queue, per-project run control, retries, status updates, proposal staging, and deterministic approval application.

Primary model path: **Gemini free-first**. Use `gemini-2.5-flash` as the default agent model and `gemini-2.5-flash-lite` for cheaper extraction/summarization fallback. Use Google’s `google-genai` Python SDK and structured JSON output. Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [Python SDK quickstart](https://ai.google.dev/gemini-api/docs/quickstart).

## Key Changes

- Keep FastAPI responsible for HTTP, permissions, persistence entrypoints, and queue enqueueing.
- Put agent orchestration, prompts, LLM calls, context assembly, and output validation in `ai_engine`.
- Use **RQ + Redis** for the queue because Phase 3 needs durable worker execution, retries, and visibility without FastAPI `BackgroundTasks`. Source: [RQ docs](https://python-rq.org/docs/).
- Keep `/plan/approve` response behavior compatible with Phase 2: approval still returns the updated plan, but internally it becomes the deterministic **Updater** step and updates `agent_status.updater`.
- Do not implement MCP tool use or full media OCR/transcription in Phase 3. Add the data hooks needed for files, but keep actual file indexing as Phase 5/stretch.

## Implementation Changes

### 1. Database And State

Add a new Supabase migration for Phase 3:

- Add `agent_run`:
  - Tracks one pipeline execution.
  - Fields: `id`, `project_id`, `triggered_by`, `status`, `new_message_ids`, `new_file_ids`, `error_code`, `error_message`, `created_at`, `started_at`, `completed_at`.
  - Status values: `queued`, `running`, `completed`, `failed`.
  - Enforce one active queued/running run per project in service logic.

- Add `project_memory`:
  - Persistent context store for extracted facts.
  - Fields: `id`, `project_id`, `kind`, `content`, `source_message_ids`, `source_file_ids`, `confidence`, `status`, `created_at`, `updated_at`.
  - `kind`: `decision`, `task`, `risk`, `requirement`, `summary`, `detail`.
  - `status`: `active`, `resolved`, `superseded`.

- Add `conversation_summary`:
  - Stores rolling summaries so agents never load full chat history.
  - Fields: `id`, `project_id`, `summary`, `source_message_ids`, `created_at`.

- Add `agent_artifact`:
  - Stores monitor/analyzer/planner outputs for the AI Activity panel and debugging.
  - Fields: `id`, `run_id`, `project_id`, `agent`, `payload`, `created_at`.

- Keep existing `agent_status` enum values. Use:
  - `queued` when a run is waiting.
  - `running` while an agent is active.
  - `completed` when an agent succeeds.
  - `failed` when an agent fails.
  - Pending approval is represented by `plan_proposal.status = pending`, not a new status enum.

### 2. Queue And Harness

- Add `REDIS_URL`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_FAST_MODEL`, and `LLM_API_KEY` to `ai_engine/src/config.py`.
- Add queue producer code in `api/src/agents/service.py`.
- `POST /agents/trigger` should:
  - validate approver permission,
  - initialize statuses,
  - create an `agent_run`,
  - enqueue `run_project_pipeline(run_id)`,
  - return `202 { project_id, status: "queued" }`.

- `POST /messages` should:
  - persist the message,
  - enqueue a pipeline run automatically,
  - debounce duplicate runs by reusing an active queued/running run for the same project.

- Worker command:
  - `cd ai_engine`
  - `python -m src.tasks.worker`

- Failure behavior:
  - Retry transient LLM/network failures up to 3 times with exponential backoff.
  - On final failure, write `agent_run.status = failed`, set the active agent to `failed`, and persist an `agent_artifact` error payload.
  - Never stage or apply partial plan changes after a failed Monitor/Analyzer/Planner run.

### 3. LLM And Structured Output

Create a provider abstraction in `ai_engine`:

- `llm/client.py`: interface `generate_json(prompt, schema, model, temperature)`.
- `llm/gemini.py`: Google GenAI implementation.
- `llm/fake.py`: deterministic fake client for tests.

Generation settings:

- Monitor: `gemini-2.5-flash-lite`, temperature `0.0`.
- Analyzer: `gemini-2.5-flash`, temperature `0.1`.
- Planner: `gemini-2.5-flash`, temperature `0.2`.
- Summarizer: `gemini-2.5-flash-lite`, temperature `0.0`.
- Updater: no LLM. It is deterministic merge logic only.

All model outputs must validate through Pydantic before being persisted. Invalid JSON or schema mismatch is `INVALID_OUTPUT` and triggers retry.

### 4. Context Engineering

Build `ContextBuilder` in `ai_engine`:

- Inputs:
  - project id,
  - run id,
  - new message ids,
  - current project plan,
  - pending proposal if any,
  - active project memory,
  - latest conversation summaries,
  - recent raw messages.

- Context assembly order:
  - Current plan.
  - New messages for this run.
  - Active project memory relevant by recency and keyword overlap.
  - Latest summaries.
  - File metadata only for Phase 3.

- Hard rule:
  - Never load full chat history into an LLM prompt.
  - Every extracted item, risk, gap, and proposed change must carry `source_message_ids`.
  - If source IDs are missing, reject the output before persistence.

### 5. Agent Recipes

**Monitor Agent**

Purpose: extract facts only.

Input:
- new messages,
- current plan,
- relevant memory,
- recent summaries.

Output:
- `decisions`
- `tasks`
- `requirements`
- `risks`
- `open_questions`
- `summary_candidate`

Rules:
- No planning.
- No risk scoring beyond explicit risk extraction.
- Every item must include `source_message_ids`, `excerpt`, and `confidence`.
- Store accepted facts in `project_memory`.
- Store full output in `agent_artifact`.

**Analyzer Agent**

Purpose: detect gaps and risks.

Input:
- Monitor output,
- current plan,
- relevant project memory.

Output:
- `gaps`
- `risks`
- `conflicts`
- `missing_information`
- `panel_suggestions`

Rules:
- No plan changes.
- Do not invent gaps without cited evidence.
- Severity must be `critical`, `major`, or `minor`.
- Each item must reference either a monitor item or a current plan section.

**Planner Agent**

Purpose: create a proposal diff.

Input:
- Monitor output,
- Analyzer output,
- current plan.

Output persisted to `plan_proposal.changes`.

Change shape:

```json
{
  "id": "generated-stable-id",
  "section": "phases",
  "action": "add",
  "content": {},
  "justification": "Supported by message IDs ...",
  "source_message_ids": [],
  "confidence": "high",
  "approved": null
}
```

Rules:
- Proposal only. Never write `project_plan`.
- Prefer `add` and `update`.
- Use `remove` only when the user explicitly says something should be removed.
- If confidence is low or required information is missing, create an analyzer gap instead of a plan change.

**Updater Agent**

Purpose: apply approved proposal items.

Implementation:
- Keep deterministic merge behavior in the plans domain.
- Improve idempotency by refusing to apply proposals unless status is `pending`.
- Apply only selected indexes.
- Mark approved changes with `approved: true`.
- Mark proposal `applied`.
- Write previous plan to `plan_version`.
- Trim versions to max 3.
- Update `agent_status.updater` from `running` to `completed` or `failed`.

Rules:
- No LLM.
- No autonomous invocation.
- Only callable through approval endpoint after approver permission check.

## Microplan

1. **Contract First**
   - Add Pydantic schemas for agent inputs/outputs in `ai_engine`.
   - Add tests that reject missing citations, invalid confidence values, malformed proposal changes, and unsupported actions.

2. **Schema Migration**
   - Add Phase 3 migration for `agent_run`, `project_memory`, `conversation_summary`, and `agent_artifact`.
   - Update migration tests to assert required tables, indexes, RLS enabled, and Realtime only where needed.

3. **Queue Harness**
   - Add Redis/RQ dependencies to `api` and `ai_engine`.
   - Implement enqueue service in API.
   - Implement worker entrypoint in `ai_engine`.
   - Add fake queue tests for trigger and message-created enqueue behavior.

4. **LLM Adapter**
   - Implement Gemini client with structured output.
   - Implement fake client for tests.
   - Add retry wrapper and invalid-output handling.

5. **Context Builder**
   - Implement current plan, recent messages, memory, and summary assembly.
   - Add tests proving old full history is not loaded.
   - Add source-message preservation tests.

6. **Monitor**
   - Implement prompt and parser.
   - Persist memory and artifacts.
   - Add fake-LLM tests for decisions, tasks, risks, and open questions.

7. **Analyzer**
   - Implement prompt and parser.
   - Persist gap/risk artifacts.
   - Add tests for missing owner, missing deadline, conflicting decision, and no unsupported hallucinated gap.

8. **Planner**
   - Implement prompt and proposal writer.
   - Persist `plan_proposal` with `pending` status.
   - Add tests for proposal creation, source citations, and no direct plan mutation.

9. **Updater Hardening**
   - Keep approval endpoint compatible.
   - Add idempotency guard.
   - Add status updates for updater.
   - Add tests for partial approval, double approval rejection, version history, and rejected proposal no-op.

10. **Frontend Integration**
   - Replace simulated AI status/proposals with backend reads where possible.
   - Map backend statuses:
     - `queued` -> idle/queued display
     - `running` -> active
     - `completed` -> complete
     - `failed` -> error
   - Keep localStorage fallback only if backend is unavailable during demo.

11. **Docs**
   - Update `docs/implementation-plan.md` Phase 3 checkboxes after implementation.
   - Update `docs/ai-engine.md` to reflect the chosen status model: approval wait is represented by pending proposal, not `waiting_approval`.

## Test Plan

- Run backend tests:
  - `cd api`
  - `python -m pytest`

- Run AI engine tests:
  - `cd ai_engine`
  - `python -m pytest`

- Run lint:
  - `cd api && python -m ruff check src tests`
  - `cd ai_engine && python -m ruff check src tests`

- Manual demo scenario:
  - Create project.
  - Send message: “Kent owns backend setup, due Friday. We still need someone for frontend QA.”
  - Confirm Monitor extracts task and open gap with message citation.
  - Confirm Analyzer flags missing frontend QA owner.
  - Confirm Planner creates a pending proposal only.
  - Approve one proposal item.
  - Confirm project plan updates, version increments, proposal becomes applied, and Realtime-visible statuses update.

## Assumptions

- Phase 3 prioritizes **free-first hackathon delivery** over paid-model reliability.
- MCP tools, OCR, audio/video transcription, and full file indexing remain Phase 5/stretch.
- Supabase service key is allowed only in backend/worker environments, never in frontend code.
- The current approval API contract should remain stable to avoid breaking Phase 2 tests and frontend assumptions.
- The implementation should improve reliability through schemas, citations, retries, and deterministic updates before adding more agent autonomy.
