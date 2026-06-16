# Phase 3 Strategy — Refinements & Sharpened Decisions

> **Purpose:** This document supplements [`phase-iii-strategy.md`](./phase-iii-strategy.md) with decisions and refinements resolved during a design review. It does **not** replace the original plan — it sharpens it.

---

## Three Pillars Alignment Assessment

The original plan maps cleanly onto the Three Pillars of AI Agent Engineering:

| Pillar | Where It Appears in the Plan | Assessment |
|---|---|---|
| **Prompt Engineering** | Agent recipes (§5): role prompts, JSON schema enforcement, confidence levels, source citation rules | ✅ Strong — every agent has a defined persona, constrained output, and reasoning instructions |
| **Context Engineering** | ContextBuilder (§4): project memory, conversation summaries, recent messages, file metadata, context assembly order | ✅ Strong — follows retrieval-before-generation, never loads full history |
| **Harness Engineering** | Queue + worker (§2), retry logic, `agent_run` tracking, `agent_status` updates, deterministic Updater | ⚠️ Good foundation — but missing explicit guardrails, observability depth, short-circuit logic, and rate limiting |

**Verdict:** The plan is architecturally sound and well-aligned with the framework. The refinements below address the **harness engineering gaps** and sharpen the operational details that separate a demo from a production-shaped system.

---

## Refinement 1: Queue Infrastructure — Redis Primary, Supabase Fallback

**Decision:** Keep RQ + Redis as the primary task queue. Document a Supabase-polling async worker as a fallback.

**Rationale:** Redis is the production-correct choice — it gives retry visibility, job persistence, and worker coordination for free. But if Redis becomes a setup blocker during the hackathon (Windows compatibility issues, Docker requirement, etc.), the fallback is a simple Python worker process that polls the `agent_run` table for `status = 'queued'` rows.

**Fallback design (document, don't build unless needed):**

```python
# ai_engine/src/tasks/supabase_worker.py (fallback — only build if Redis is blocked)
async def poll_loop():
    while True:
        run = await supabase.table("agent_run") \
            .select("*").eq("status", "queued") \
            .order("created_at").limit(1).execute()
        if run.data:
            await process_run(run.data[0])
        await asyncio.sleep(2)
```

**Action items:**
- Add a note in `ai_engine/README.md` about the fallback
- Ensure `agent_run` table schema supports both queue backends (it already does — the table tracks status regardless of how the worker picks it up)

---

## Refinement 2: Context Retrieval — Keyword Now, Semantic Interface Ready

**Decision:** Use keyword overlap + recency for Phase 3 memory retrieval. Design the `ContextBuilder` with an abstract `RetrievalStrategy` interface so embedding-based retrieval can be swapped in later without changing agent code.

**Interface design:**

```python
class RetrievalStrategy(Protocol):
    async def retrieve(
        self,
        project_id: str,
        query_messages: list[dict],
        limit: int,
    ) -> list[dict]:
        """Return relevant memory items for the given query messages."""
        ...

class KeywordRetrievalStrategy:
    """Phase 3 default: recency + keyword overlap."""
    async def retrieve(self, project_id, query_messages, limit):
        # Extract keywords from new messages
        # Match against project_memory.content by substring/token overlap
        # Sort by recency, return top `limit` items
        ...

# Future Phase 5+:
class EmbeddingRetrievalStrategy:
    """Semantic search using Gemini embeddings + pgvector."""
    ...
```

**Why this matters:** The Three Pillars context specifically calls out that keyword matching is brittle for the exact use case this project targets — "recognizing that a current discussion relates to a prior decision or risk without the user knowing to search for it." The interface makes the upgrade path zero-friction.

---

## Refinement 3: Conversation Summarization — Dual Trigger

**Decision:** Summarization happens in two ways:

1. **Inline (during pipeline):** The Monitor's `summary_candidate` is committed to `conversation_summary` if it covers messages not already summarized. This is the primary path.

2. **Background threshold job:** A lightweight background task checks if there are 15+ unsummarized messages for a project. If so, it enqueues a summarization-only job using `gemini-2.5-flash-lite`.

**Parameters:**
- Message threshold for background job: **15 messages**
- Summarization model: `gemini-2.5-flash-lite` at temperature `0.0`
- Background check frequency: on every `POST /messages` call, check the count of messages since the last summary

**Schema addition to `conversation_summary`:**

```sql
-- Add to track which messages are covered by each summary
alter table conversation_summary add column if not exists
    last_message_created_at timestamptz;
```

---

## Refinement 4: Context Window Budget — Priority-Based with Overflow Trimming

**Decision:** Context budget is allocated by priority, not fixed percentages.

**Priority order (highest first):**

| Priority | Section | Behavior |
|---|---|---|
| 1 (always include) | Current project plan | Full plan, never trimmed |
| 2 (always include) | New messages for this run | All messages in `agent_run.new_message_ids` |
| 3 (fill remaining) | Active project memory | By recency, up to remaining budget |
| 4 (fill remaining) | Conversation summaries | Most recent first, up to remaining budget |
| 5 (fill remaining) | File metadata | Filename + mime type only for Phase 3 |

**Budget enforcement:**
- Estimate token count using a simple heuristic: `len(text) / 4` (roughly 4 chars per token)
- Gemini 2.5 Flash context window: ~1M tokens — unlikely to hit in Phase 3
- Log a warning if total assembled context exceeds 100K tokens (quality degrades with too much context even if it fits)
- If trimming is needed, remove items from priority 5 → 4 → 3 in reverse-recency order

---

## Refinement 5: Pipeline Short-Circuit — Cascading Conditional Execution

**Decision:** The pipeline uses cascading short-circuit logic:

```
Monitor runs ALWAYS
  └─ If Monitor extracts 0 meaningful items → STOP (mark run completed, skip Analyzer/Planner)
  └─ If Monitor extracts items → Analyzer runs
      └─ If Analyzer finds 0 gaps/risks/conflicts → STOP (mark run completed, skip Planner)  
      └─ If Analyzer finds items → Planner runs
          └─ Planner creates proposal → run enters "pending approval" state
```

**"Meaningful items" definition for Monitor:**
- At least 1 item in `decisions`, `tasks`, `requirements`, `risks`, or `open_questions`
- A `summary_candidate` alone does NOT count (summaries are informational, not actionable)

**Status reporting on short-circuit:**
- When the pipeline short-circuits, set remaining agents to `completed` (not `idle`) so the frontend shows they were considered
- Write a minimal `agent_artifact` for skipped agents with `payload: { "skipped": true, "reason": "no_actionable_input" }`

---

## Refinement 6: Message Debounce — Hybrid with Configurable Parameters

**Decision:** Hybrid debounce with per-project configurable parameters.

**Default parameters:**
- Message count threshold: **3 messages**
- Silence timeout: **8 seconds**
- Trigger condition: whichever comes first

**Implementation approach:**

```python
# In the API message handler:
async def on_message_created(project_id, message_id):
    # 1. Record the message ID in a pending batch (Redis list or in-memory)
    # 2. Check if batch count >= N (default 3)
    #    → If yes: trigger pipeline immediately with all pending IDs
    # 3. If count < N: schedule/reset a delayed trigger for T seconds (default 8)
    #    → When timer fires: trigger pipeline with all accumulated IDs
    # 4. If a pipeline is already running: mark message IDs for next run
```

**Configuration storage:** Add `debounce_message_count` and `debounce_silence_seconds` to `ai_settings` table (or a new `project_ai_config` table if `ai_settings` doesn't exist yet).

---

## Refinement 7: Pending Proposal Conflict — Supersede with Archive

**Decision:** When a new pipeline run produces a proposal while an existing proposal is still `pending`:

1. Mark the old proposal as `superseded` (new status enum value)
2. Create the new proposal as `pending`
3. The old proposal remains visible in proposal history

**Schema change:**

```sql
-- Add 'superseded' to the plan_proposal_status enum
alter type public.plan_proposal_status add value if not exists 'superseded';
```

**Frontend implication:** The AI Activity panel should show a subtle note when a proposal was superseded: "Updated proposal available — previous version archived."

---

## Refinement 8: Live Observability — Realtime on agent_artifact

**Decision:** Enable Supabase Realtime on the `agent_artifact` table so the frontend receives live agent outputs as they're produced.

**Implementation:**

```sql
-- In the Phase 3 migration:
alter publication supabase_realtime add table public.agent_artifact;
```

**Frontend subscription pattern:**

```typescript
supabase
  .channel(`agent_artifacts:${projectId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'agent_artifact',
    filter: `project_id=eq.${projectId}`,
  }, (payload) => {
    // Update AI Activity panel with new artifact
  })
  .subscribe();
```

**What each agent artifact contains:**

| Agent | Artifact Payload |
|---|---|
| Monitor | `{ decisions: [...], tasks: [...], risks: [...], summary_candidate: "..." }` |
| Analyzer | `{ gaps: [...], risks: [...], conflicts: [...] }` |
| Planner | `{ proposal_id: "...", change_count: N, summary: "..." }` |
| Skipped | `{ skipped: true, reason: "no_actionable_input" }` |

---

## Refinement 9: Structured Output — Triple-Layer Schema Enforcement

**Decision:** Three layers of defense for structured output:

1. **Gemini native JSON mode:** Use `response_schema` parameter in the `google-genai` SDK to constrain model decoding
2. **Pydantic validation:** Parse the JSON response through the agent's Pydantic output model
3. **Repair retry:** If Pydantic validation fails, retry once with a repair prompt that includes the validation error

**Repair prompt template:**

```python
REPAIR_PROMPT = """
The previous output failed validation with the following error:
{validation_error}

Please fix the output to match the required schema. The original prompt was:
{original_prompt}

Return ONLY the corrected JSON.
"""
```

**Retry budget:** Each agent gets 1 repair retry. If the repair also fails → `INVALID_OUTPUT` error, run fails.

---

## Refinement 10: Worker Concurrency — Per-Project Locking

**Decision:** One shared RQ worker process with per-project locking.

**Behavior:**
- The worker processes jobs from the queue
- Before starting a pipeline for project X, acquire a lock (Redis lock with TTL)
- If project X already has an active pipeline, the new job waits (RQ handles this via job dependencies or a simple Redis lock)
- Multiple projects can run pipelines in parallel

**Lock implementation:**

```python
import redis

def acquire_project_lock(redis_client: redis.Redis, project_id: str, ttl: int = 300) -> bool:
    """Acquire a lock for a project's pipeline. TTL prevents dead locks."""
    return redis_client.set(f"pipeline_lock:{project_id}", "1", nx=True, ex=ttl)

def release_project_lock(redis_client: redis.Redis, project_id: str):
    redis_client.delete(f"pipeline_lock:{project_id}")
```

**TTL:** 5 minutes (300 seconds). If a pipeline takes longer than this, something is very wrong. The lock auto-expires to prevent deadlocks.

---

## Refinement 11: Rate Limiting + Model Fallback + Budget

**Decision:** Three-tier protection against Gemini free-tier limits:

### Tier 1: In-Memory Rate Limiter (Token Bucket)

```python
class RateLimiter:
    def __init__(self, rpm: int = 15):
        self.rpm = rpm
        self.tokens = rpm
        self.last_refill = time.time()
    
    async def acquire(self):
        self._refill()
        if self.tokens <= 0:
            wait_time = 60 / self.rpm
            await asyncio.sleep(wait_time)
            self._refill()
        self.tokens -= 1
```

### Tier 2: Model Fallback Chain

```
gemini-2.5-flash (primary)
  └─ on 429 → gemini-2.5-flash-lite (fallback)
      └─ on 429 → exponential backoff + retry
          └─ on 3rd failure → queue job for later
```

### Tier 3: Per-Project Daily Budget

- Default: **100 LLM calls/day per project**
- Soft warning at **80 calls** (80%): skip Planner, only run Monitor + Analyzer
- Hard stop at **100 calls**: skip pipeline entirely, log warning, surface in AI Activity panel
- Budget resets at midnight UTC
- Budget tracking: add a `project_llm_usage` table or a simple counter in `agent_run` metadata

**Budget tracking table:**

```sql
create table if not exists public.project_llm_usage (
    id uuid primary key default gen_random_uuid(),
    project_id uuid not null references public.project (id) on delete cascade,
    date date not null default current_date,
    call_count integer not null default 0,
    constraint project_llm_usage_project_date_unique unique (project_id, date)
);
```

---

## Refinement 12: Full Guardrail Layer

**Decision:** Three-stage guardrail system:

### Stage 1: Input Sanitization (before LLM call)

| Check | Action |
|---|---|
| Message content > 10,000 chars | Truncate with `[truncated]` marker |
| Message count > 50 for single run | Take most recent 50 only |
| Referenced message IDs | Verify they exist in the database before including in context |

### Stage 2: Output Validation (after LLM response, before persistence)

| Check | Action |
|---|---|
| `source_message_ids` exist in input messages | Reject if any ID is fabricated |
| Planner `action: "remove"` | Reject unless conversation evidence explicitly supports removal |
| Confidence level justified | If `confidence: "high"` but only 1 source message, downgrade to `medium` |
| Duplicate items | Deduplicate by content similarity before persisting |

### Stage 3: Safety Check Prompt (post-generation verification)

A lightweight LLM call (flash-lite, temperature 0.0) that reviews the Planner's output:

```python
SAFETY_CHECK_PROMPT = """
Review the following proposed plan changes. For each change, verify:
1. The justification references real source messages
2. No "remove" action exists without explicit user request
3. All changes are additive or corrective, not destructive
4. Confidence levels match the evidence strength

If ANY change violates these rules, return {"safe": false, "violations": [...]}.
If all changes pass, return {"safe": true}.

Proposed changes:
{planner_output}
"""
```

**Cost consideration:** The safety check adds 1 LLM call per pipeline run. Using flash-lite at temperature 0, this costs ~0.5 cents per call (free tier). Worth it for the integrity guarantee.

---

## Refinement 13: Pipeline Orchestration — AgentStep Interface

**Decision:** Hard-coded linear sequence behind a common `AgentStep` interface with `should_continue` flag.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

@dataclass
class StepResult:
    agent: str
    output: Any
    should_continue: bool
    artifacts: dict  # Data to persist as agent_artifact
    skipped: bool = False

class AgentStep(ABC):
    @abstractmethod
    async def execute(self, context: dict, prior_results: list[StepResult]) -> StepResult:
        ...

class MonitorStep(AgentStep):
    async def execute(self, context, prior_results):
        output = await self.llm_client.generate_json(...)
        has_items = bool(output.decisions or output.tasks or output.risks or output.requirements)
        return StepResult(
            agent="monitor",
            output=output,
            should_continue=has_items,
            artifacts=output.model_dump(),
        )

# Pipeline runner:
async def run_pipeline(steps: list[AgentStep], context: dict):
    results = []
    for step in steps:
        result = await step.execute(context, results)
        results.append(result)
        if not result.should_continue:
            # Mark remaining steps as skipped
            break
    return results
```

---

## Refinement 14: Data Access — Independent Supabase Client in ai_engine

**Decision:** `ai_engine` gets its own Supabase client using the service key, following the same config pattern as the API. No import dependencies between `api` and `ai_engine`.

**Config additions to `ai_engine/src/config.py`:**

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    
    # LLM
    llm_provider: str | None = Field(default=None, alias="LLM_PROVIDER")
    llm_model: str = Field(default="gemini-2.5-flash", alias="LLM_MODEL")
    llm_fast_model: str = Field(default="gemini-2.5-flash-lite", alias="LLM_FAST_MODEL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    
    # Supabase
    supabase_url: str = Field(alias="SUPABASE_URL")
    supabase_service_key: str = Field(alias="SUPABASE_SERVICE_KEY")
    
    # Redis
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    
    # Budget
    daily_llm_budget_per_project: int = Field(default=100, alias="DAILY_LLM_BUDGET")
    llm_budget_warning_threshold: float = Field(default=0.8, alias="LLM_BUDGET_WARNING_THRESHOLD")
    
    # Debounce defaults
    debounce_message_count: int = Field(default=3, alias="DEBOUNCE_MESSAGE_COUNT")
    debounce_silence_seconds: int = Field(default=8, alias="DEBOUNCE_SILENCE_SECONDS")
    
    # Summarization
    summary_message_threshold: int = Field(default=15, alias="SUMMARY_MESSAGE_THRESHOLD")
```

---

## Refinement 15: Implementation Sequencing — REST Test Harness First

**Decision:** Build Phase 3 backend-first with integration tests that hit actual API endpoints. Frontend integration is the final step.

**Revised microplan order:**

```
1. Contract First (Pydantic schemas)           — no dependencies
2. Schema Migration (new tables)                — no dependencies
3. ai_engine Supabase Client + Config           — depends on 2
4. LLM Adapter (Gemini + fake + rate limiter)   — no dependencies
5. Queue Harness (RQ + Redis + worker)          — depends on 3
6. Context Builder (with RetrievalStrategy)     — depends on 3
7. Guardrail Layer (input + output validators)  — depends on 1
8. Monitor Step                                 — depends on 4, 6, 7
9. Analyzer Step                                — depends on 8
10. Planner Step + Safety Check                 — depends on 9
11. Pipeline Runner (AgentStep orchestration)   — depends on 8, 9, 10
12. Updater Hardening                           — depends on 3
13. REST Integration Tests                      — depends on all above
14. Frontend Integration                        — depends on 13
15. Docs Update                                 — depends on 14
```

---

## New Schema Additions (beyond original plan)

The following tables/columns are **new** relative to the original plan:

| Addition | Purpose |
|---|---|
| `project_llm_usage` table | Track per-project daily LLM call budget |
| `plan_proposal_status` enum: `superseded` | Support proposal archiving when a newer proposal arrives |
| `conversation_summary.last_message_created_at` | Track which messages a summary covers |
| Realtime on `agent_artifact` | Enable live agent output streaming to frontend |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Gemini free tier rate limits during demo | High | Medium | Rate limiter + fallback chain + budget caps |
| Redis setup fails on Windows | Medium | High | Supabase-polling fallback documented and ready to build |
| Safety check prompt adds latency | Low | Low | Uses flash-lite (fast), only runs after Planner (1x per pipeline) |
| Proposal superseding confuses users | Low | Medium | Frontend shows clear "updated proposal available" messaging |
| Large context degrades output quality | Medium | Medium | Priority-based trimming + 100K token warning threshold |

---

## Summary of All Decisions

| Decision Area | Choice |
|---|---|
| Queue infrastructure | RQ + Redis primary, Supabase-polling fallback documented |
| Context retrieval | Keyword + recency now, `RetrievalStrategy` interface for semantic upgrade |
| Summarization trigger | Inline (during pipeline) + background (15 message threshold) |
| Context budget | Priority-based with overflow trimming (plan → messages → memory → summaries) |
| Pipeline short-circuit | Cascading: Monitor always → Analyzer if items → Planner if gaps |
| Message debounce | Hybrid: 3 messages OR 8s silence, configurable per-project |
| Proposal conflicts | Supersede with `superseded` status, old proposal archived |
| Live observability | Supabase Realtime on `agent_artifact` table |
| Schema enforcement | Native JSON mode + Pydantic + repair retry |
| Worker concurrency | Single worker, per-project Redis locking |
| Rate limiting | Token bucket + flash → flash-lite fallback + daily budget (100 calls, warn at 80%) |
| Guardrails | Input sanitization + output validation + safety check prompt |
| Pipeline orchestration | `AgentStep` interface with `should_continue` flag |
| Data access | Independent Supabase client in ai_engine with service key |
| Implementation order | Backend-first with REST test harness, frontend last |
