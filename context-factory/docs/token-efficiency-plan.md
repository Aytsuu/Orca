# Token Efficiency

## Goal

Eliminate automatic per-message pipeline execution. Users control when the AI pipeline runs. Reduce per-run token consumption by removing redundant context from later pipeline steps.

---

## Phase 1 - Slash-Command Trigger (Replace Auto-Trigger)

Convert the pipeline from auto-fire-on-message to user-invoked slash commands. Slash commands are **ephemeral** - only visible to the sender, never persisted to `chat_message`, never broadcast to other project members.

### 1A - API: Command Interception

#### Files

- `api/src/chat/router.py` - `create_message_endpoint`
- `api/src/chat/commands.py` - **[NEW]** command registry and parser
- `api/src/agents/service.py` - `trigger_agents()`

#### Changes

- [x] Remove `classify_message_for_agent_trigger` call and `trigger_agents()` from `create_message_endpoint`. Messages become plain chat - no LLM cost.
- [x] Create `api/src/chat/commands.py` with a command registry:
  - `SLASH_COMMANDS` dict mapping command names to handler metadata.
  - `parse_slash_command(content: str) -> tuple[str, str] | None` - returns `(command_name, args)` if content starts with `/`, else `None`.
  - Initial commands: `/analyze` (triggers pipeline), `/status` (returns agent statuses).
- [x] In `create_message_endpoint`, before `create_message()`, call `parse_slash_command()`. If a command is detected:
  - **Do not** persist to `chat_message`. Do not call `create_message()`.
  - Execute the command handler.
  - Return a response with `ephemeral: true` flag and the command result payload.
- [x] Add `GET /{project_id}/commands` endpoint returning the `SLASH_COMMANDS` registry (name, description, usage) for the frontend picker.
- [x] Remove the `debounce` parameter path from `trigger_agents()`.
- [x] Delete `api/src/chat/relevance.py` - dead code after auto-trigger removal.

#### Verification

- [x] Sending a regular message produces zero LLM calls and is persisted normally.
- [x] Sending `/analyze` triggers exactly one pipeline run, returns ephemeral response, creates no `chat_message` row.
- [x] Sending `/status` returns current agent statuses ephemerally.
- [x] `GET /commands` returns the command list.

---

### 1B - Frontend: Slash Command Picker & Ephemeral Display

#### Files

- `web/src/components/islands/features/ChatView.tsx` - `handleSend`, chat input `textarea`
- `web/src/components/islands/ui/SlashCommandPicker.tsx` - **[NEW]**
- `web/src/lib/query/projectMessages.ts` - send mutation

#### Changes

- [x] In `ChatView.tsx`, detect when `messageText` starts with `/`. Show `SlashCommandPicker` popover anchored above the textarea.
- [x] `SlashCommandPicker` fetches available commands from `GET /{project_id}/commands` and caches them indefinitely.
- [x] Picker filters commands as user types (for example `/an` narrows to `/analyze`). Selecting a command fills the input.
- [x] On submit, if the message starts with `/`, call the send mutation. The API returns `ephemeral: true`.
- [x] Ephemeral responses are rendered inline in the local message list only, appended in chat order, never refetched from the server, and styled distinctly.
- [x] Ephemeral messages are not added to the React Query cache for `projectMessages` - they live in a separate `useState` array that is merged into `renderedMessages` at render time.
- [x] Ephemeral messages persist locally across reloads for the sender only.

#### Verification

- [x] Typing `/` in chat input shows the command picker popover.
- [x] Picking `/analyze` sends the command; response appears only to the sender.
- [x] Other team members see no trace of the slash command in their chat feed.
- [x] Refreshing the page preserves ephemeral messages locally for the sender only.

---

## Phase 2 - Conversation Windowing (Watermark)

Track which messages have been processed. The explicit trigger only feeds unprocessed messages.

### Files

- `supabase/migrations/` - new migration
- `api/src/agents/service.py` - `trigger_agents()`
- `ai_engine/src/pipelines/runner.py` - `run_project_pipeline()`
- `ai_engine/src/repository.py` - new function

### Changes

- [x] Add `last_processed_message_at timestamptz` column to `project` (or a new `project_ai_cursor` table with `project_id` PK + `last_processed_message_at`).
- [x] In `trigger_agents()`, when `message_ids` is empty, query `chat_message` where `created_at > last_processed_message_at` and pass those IDs to the run.
- [x] At pipeline completion in `run_project_pipeline()`, update the watermark to `max(created_at)` of processed messages.
- [x] Add `update_project_ai_cursor()` and `get_project_ai_cursor()` to `repository.py`.

### Verification

- [x] First analyze call processes all messages. Second call with no new messages produces an empty run (skipped).
- [x] Messages sent between two analyze calls are captured exactly once.

---

## Phase 3 - Slim Serialization for Monitor Prompt

Remove metadata fields that waste tokens in the Monitor prompt.

### Files

- `ai_engine/src/agents/steps.py` - `MonitorStep.execute()`

### Changes

- [x] Replace `asdict(context)` in `MonitorStep` with a purpose-built dict that includes only: `current_plan` (title + description + phases), `new_messages` (id + content + role), `memory`, `summaries`.
- [x] Exclude `run_id`, `project_id`, `token_estimate`, `warnings`, `files` from Monitor prompt.
- [x] Strip `_id`, `_at`, and internal DB fields from plan/memory/summary payloads using the existing `_strip_non_citation_ids` helper.

### Verification

- [x] Monitor output unchanged on the same input (regression test with fixture).
- [x] Prompt token count reduced (log or assert `len(prompt) < previous_baseline`).

---

## Phase 4 - Drop Raw Messages from Analyzer and Planner

Analyzer and Planner operate on Monitor's structured output, not raw messages.

### Files

- `ai_engine/src/agents/steps.py` - `_build_reasoning_context()`, `AnalyzerStep`, `PlannerStep`

### Changes

- [x] Modify `_build_reasoning_context()` to accept a `include_messages: bool = True` parameter. When `False`, omit `context.new_messages` from the payload.
- [x] `AnalyzerStep.execute()` calls `_build_reasoning_context(..., include_messages=False)`. Monitor output already contains all extracted items with `source_message_ids`.
- [x] `PlannerStep.execute()` calls `_build_reasoning_context(..., include_messages=False)`.
- [x] Keep `context.new_messages` available for `validate_source_message_ids()` and `calibrate_confidence_from_messages()` - these run on the Python side, not in the LLM prompt.

### Verification

- [x] Analyzer and Planner prompts no longer contain raw message text.
- [x] Source message ID validation still works (IDs come from Monitor output, validated against context).
- [x] End-to-end pipeline produces equivalent proposals on test fixtures.

---

## Phase 5 - Tighten Memory and Summary Caps

Reduce memory/summary items included in prompts.

### Files

- `ai_engine/src/context/builder.py` - `build()`
- `ai_engine/src/context/retrieval.py` - `KeywordRetrievalStrategy.retrieve()`
- `ai_engine/src/config.py` - new settings

### Changes

- [x] Reduce default memory retrieval from `limit=20` to `limit=10`.
- [x] Reduce default summary retrieval from `limit=10` to `limit=5`.
- [x] Add `CONTEXT_MEMORY_LIMIT` and `CONTEXT_SUMMARY_LIMIT` to `Settings` so these are configurable without code changes.
- [x] In `KeywordRetrievalStrategy.retrieve()`, return only items with `score > 0` up to limit (currently falls back to returning `rows[:limit]` even with zero overlap - remove that fallback).

### Verification

- [x] Prompt size measurably smaller with equivalent output quality on test fixtures.
- [x] Zero-overlap fallback no longer injects irrelevant memory.

---

## Phase 6 - Server-Side Message Filtering

Stop fetching all project messages when only specific IDs are needed.

### Files

- `ai_engine/src/context/builder.py` - `_get_messages()`

### Changes

- [ ] Replace the current `SELECT * ... eq(project_id) ... order(created_at)` + Python filter with a direct `IN` filter: `.in_("id", message_ids)`.
- [ ] Remove the `requested_ids` set and client-side filtering.
- [ ] Keep the `[-50:]` cap as a safeguard.

### Verification

- [ ] Query plan uses index scan on `id` (not sequential scan on all project messages).
- [ ] Pipeline results identical to before.

---

## Phase Summary

| Phase | What | Token impact | Risk |
|-------|------|-------------|------|
| 1 | Slash-command trigger (`/analyze`, `/status`) + ephemeral messages | **Eliminates all automatic LLM calls** | Frontend: command picker + ephemeral rendering |
| 2 | Watermark | Prevents reprocessing | Migration required |
| 3 | Slim Monitor prompt | ~500-2K tokens/call saved | Low |
| 4 | Drop messages from Analyzer/Planner | 30-50% input reduction on steps 2-3 | Must verify proposal quality |
| 5 | Tighten memory caps | ~2K tokens/call saved | Low |
| 6 | Server-side filtering | DB performance only | Low |
