# AI Engine Guidelines

> Authoritative reference for all AI agent development on this project.
> Derived from [`docs/mvp.md`](./mvp.md) and [`docs/idea.md`](./idea.md).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Agent Pipeline](#2-agent-pipeline)
3. [Agent Roles & Responsibilities](#3-agent-roles--responsibilities)
4. [Permission & Safety Rules](#4-permission--safety-rules)
5. [Context Management](#5-context-management)
6. [Agent State & Status](#6-agent-state--status)
7. [Tool Use (MCP — Stretch Goal)](#7-tool-use-mcp--stretch-goal)
8. [Input & Output Schema](#8-input--output-schema)
9. [Error Handling](#9-error-handling)
10. [Anti-Patterns Checklist](#10-anti-patterns-checklist)

---

## 1. Overview

Each project runs a pipeline of **4 specialized AI agents** that continuously monitor team conversations and turn them into structured, actionable project plans.

### AI Capabilities

From [`idea.md > AI Thinking`](./idea.md):

> *AI can monitor team conversations, extract key decisions, detect unclear tasks, identify missing details, and turn scattered discussions into structured action plans. It can also identify weak points in the plan, synthesize context, highlight risks, and suggest improved workflows based on the team's goals.*

The two capability modes the AI engine employs:

| Capability Mode | Description |
|---|---|
| **Agentic Workflow** | A pipeline of specialized agents that autonomously monitor, analyze, plan, and stage updates — each handing its output to the next |
| **Generative AI** | LLM-driven generation of summaries, structured plans, task lists, timelines, gap reports, and risk flags |

**Solution statement** (from [`idea.md`](./idea.md)):
> *An AI-powered team messaging platform where development teams can chat while an AI assistant analyzes conversations in real time. The AI reads new messages and retrieves relevant context from a persistent project memory — a structured store of confirmed decisions, finalized tasks, and past summaries — using semantic search before generating any output. It then suggests clearer tasks, timelines, priorities, and improved project plans.*

**Why AI, not Trello or Notion** (from [`idea.md > AI Thinking`](./idea.md)):
> *Tools like Trello and Notion can store tasks and notes, but they require team members to correctly categorize, connect, and surface relevant information up front — and to do so manually, at the right moment. The specific gap AI fills is proactive, unprompted retrieval and reasoning: recognizing that a current discussion relates to a prior decision or risk without the user knowing to search for it. Relationships between tasks and decisions in real team conversations are often implicit and emerge over time — rule-based tools cannot detect them.*

**Core principle:** The AI is a collaborator, not an executor. It analyzes, suggests, and flags — but **never modifies any project data without explicit human approval.**

### What AI Can Do

| Capability | Notes |
|---|---|
| Analyze conversations and the project plan | Reads all chat messages in a project |
| Generate plans, tasks, timelines, and responsibilities | Outputs proposals only — not applied until approved |
| Summarize discussions and surface key decisions | Presented in the AI activity panel (right column) |
| Flag risks and identify gaps or unclear action items | Analyzer agent responsibility |
| Generate code snippets and documents | *(Stretch goal: PDF, DOCX)* |
| Access external tools via MCP servers | *(Stretch goal: per-project configuration)* |

### What AI Cannot Do (without explicit user approval)

- Modify, edit, or delete any part of the project plan
- Archive, unarchive, or trash any project data
- Apply any structured output until a user with approval permission explicitly accepts it

---

## 2. Agent Pipeline

Each project's AI pipeline processes new messages in this fixed order:

```
Chat message received
        │
        ▼
  [Monitor Agent]      ← watches conversations; extracts decisions, tasks, key details
        │
        ▼
 [Analyzer Agent]      ← identifies gaps, risks, unclear action items
        │
        ▼
  [Planner Agent]      ← generates structured plan: timeline, priorities, ownership
        │
        ▼
  [Updater Agent]      ← stages plan diff; ONLY applies after explicit user approval
```

### Pipeline Trigger

The pipeline is triggered whenever:
- A new chat message is persisted to the `chat_message` table
- A file upload is completed and its transcript/content is indexed
- A user manually triggers the pipeline via the AI settings

### Execution Model

- The 4-agent pipeline involves long-running LLM calls and **must run in a task queue** (Celery / Arq / RQ), not FastAPI `BackgroundTasks`.
- Each agent updates its status in the `agent_status` table; Supabase Realtime broadcasts the update to the frontend automatically.
- Agents run **sequentially** within a project pipeline — the output of each agent is the input to the next.

---

## 3. Agent Roles & Responsibilities

### Monitor Agent

**Input:** Raw chat messages (text, file transcripts, metadata)
**Output:** Extracted structured data — decisions, tasks, key details

Responsibilities:
- Read all new messages since the last pipeline run
- Extract: key decisions, action items, named owners, deadlines, priorities
- Flag media content (images, video, audio, documents) for indexing
- Output a structured extraction payload for the Analyzer

Rules:
- Does **not** evaluate quality or risk — extraction only
- Must handle multilingual input; do not assume a single language
- Must cite source messages for every extracted item (message ID + excerpt)

---

### Analyzer Agent

**Input:** Monitor's extraction payload + current project plan
**Output:** Gap and risk report

Responsibilities:
- Compare extracted items against the existing project plan
- Identify: unclear action items, missing owners, missing deadlines, conflicting decisions, risks
- Surface missing information the team needs to resolve
- Produce a prioritized list of gaps and risks

Rules:
- Does **not** generate a new plan — analysis only
- Must reference specific extraction items and plan sections in its report
- Must not hallucinate gaps that are not supported by the conversation context

---

### Planner Agent

**Input:** Analyzer's gap report + Monitor's extraction + current project plan
**Output:** A proposed plan diff (not the full plan — only the changes)

Responsibilities:
- Generate a structured plan update: tasks, timeline, priorities, responsibilities
- Produce a clear, human-readable diff of what would change
- Justify each proposed change by referencing a source message or gap item

Rules:
- Output is a **proposal only** — never write directly to the `project_plan` table
- The proposal must be staged in the `plan_proposal` table awaiting approval
- Must indicate confidence level for each proposed change (high / medium / low)
- Do not remove or overwrite existing plan items unless the conversation explicitly supports it

---

### Updater Agent

**Input:** Approved plan proposal (after user accept/reject)
**Output:** Committed plan update applied to the `project_plan` table

Responsibilities:
- Apply **only the approved portions** of the proposal
- Record a new version in the `plan_version` table (max 3 reverts enforced)
- Mark the proposal as `applied` and notify relevant project members via Supabase Realtime

Rules:
- **Never runs autonomously** — it is invoked only after a user with approval permission explicitly accepts a proposal
- Partial approvals are valid — apply only accepted items, discard rejected ones
- Must be idempotent: applying the same approved proposal twice must not create duplicate plan entries

---

## 4. Permission & Safety Rules

These rules are **non-negotiable** and must be enforced at the agent layer independent of API-level guards.

| Rule | Detail |
|---|---|
| No autonomous plan writes | Agents stage proposals; users apply them |
| No data deletion | Agents cannot archive, trash, or delete any record |
| Approval required | Every AI-generated plan change needs explicit accept from an authorized user |
| Cite sources | Every extraction, gap, or plan item must reference a source message |
| Fail safe | On error, agents surface the failure — they do not silently skip or apply partial results |

### Approval Permission Model

Mirrors the MVP permission model:

| Role | Can view AI proposals | Can approve/reject | Can edit before approving |
|---|---|---|---|
| **Creator** | ✅ | ✅ | ✅ |
| **Approver** | ✅ | ✅ | Optional (delegated) |
| **Member** | ✅ (after sync) | ❌ | ❌ |

---

## 5. Context Management

### The Context Window Problem

LLM context windows are limited. Long project conversations — especially those with media — will exceed context limits. Agents must never load raw history naively.

### Responsible AI (from [`idea.md > Responsible AI`](./idea.md))

**What could go wrong?**
> *The context window of AI models is limited, which may not be able to keep up with long conversations, especially in chat apps that allow sending media like files, photos, videos, and audio. This will significantly impact AI reliability.*

**How we reduce that risk:**
> *Chunk conversations into summaries, store key decisions in a project memory, index media transcripts, and use retrieval before generating plans. The AI should cite sources and ask confirmation when context is incomplete.*

**What triggers a suggestion vs. a summary** (from [`idea.md > AI Thinking`](./idea.md)):
- **Suggestion** — triggered when a new message semantically overlaps with an unresolved item or known risk in project memory (e.g., a team member mentions a person or deadline linked to a prior blocker the AI has flagged).
- **Summary** — triggered on explicit user request, at the start of a new session, or when the AI detects that the active discussion has drifted significantly from the current sprint goal stored in memory.

**Where humans remain involved** (from [`idea.md > Human Role`](./idea.md)):
> *Humans should make the final decision before the AI-generated plan becomes official. The AI can suggest summaries, tasks, risks, and timelines, but team members should confirm if the plan is accurate, realistic, and aligned with their actual goals before anyone follows it.*

These principles directly shape the context strategy and approval rules described below.

---

### Strategy: Chunked Summaries + Project Memory

1. **Chunk conversations** into rolling summaries stored in the `conversation_summary` table. Summarize every N messages or when a context threshold is approaching.
2. **Project memory** — a persistent structured store of key decisions, confirmed tasks, and finalized plan sections. Always included in agent context at the start of each run.
3. **Media indexing** — transcribe audio/video and extract text from images and documents. Store indexed content in the `file_index` table. Agents retrieve relevant excerpts via semantic search, not full content.
4. **Retrieval before generation** — agents must retrieve relevant context (summaries, memory, indexed files) before generating output. Do not rely solely on the raw recent message window.
5. **Cite and confirm** — when context is incomplete or ambiguous, the agent must flag it (via the Analyzer) and ask for confirmation in the AI activity panel rather than guessing.

### Context Assembly Order (per agent run)

```
1. Project memory (key decisions, confirmed tasks, finalized plan)
2. Rolling conversation summaries (most recent N summaries)
3. Recent raw messages (since last pipeline run, up to context budget)
4. Retrieved file excerpts (semantic search results relevant to current discussion)
5. Current plan proposal (for Planner and Updater only)
```

---

## 6. Agent State & Status

Each agent reports its state to the `agent_status` table. Supabase Realtime broadcasts these changes to the frontend (right-column AI activity panel) without polling.

### Status Values

| Status | Meaning |
|---|---|
| `idle` | No pipeline running for this project |
| `running` | Agent is actively processing |
| `waiting_approval` | Planner has produced a proposal; awaiting user action |
| `error` | Agent encountered an unrecoverable error |
| `completed` | Pipeline run finished successfully |

### State Transitions

```
idle → running (Monitor starts)
running → running (each agent hands off to the next)
running → waiting_approval (Planner stages proposal)
waiting_approval → running (user approves; Updater applies)
waiting_approval → idle (user rejects; no changes applied)
running → error (any agent fails)
running → completed (Updater finishes successfully)
error → idle (after error is acknowledged)
```

---

## 7. Tool Use (MCP — Stretch Goal)

The MVP includes tool use as a **stretch goal**. AI agents can access external services via pre-configured MCP (Model Context Protocol) servers on a per-project basis.

### Configuration

- Each project has its own `ai_settings` record specifying which MCP servers are enabled.
- The project creator configures tool access via the **AI Settings** screen.
- Tool calls are subject to the same approval rules: agents propose tool actions, users approve.

### Permitted Tool Actions (when enabled)

- Read from external services (e.g., fetch a GitHub issue, read a Notion page)
- Write actions only after explicit user approval

### Prohibited Tool Actions (always)

- Deleting remote resources
- Unauthorized data exfiltration
- Calling any tool not listed in the project's `ai_settings`

---

## 8. Input & Output Schema

### Agent Input (per pipeline run)

```python
class AgentRunInput(BaseModel):
    project_id:        UUID
    triggered_by:      str               # "message" | "file_upload" | "manual"
    new_message_ids:   list[UUID]        # messages since last run
    new_file_ids:      list[UUID]        # newly uploaded files
    context:           AgentContext      # assembled context (see section 5)
```

### Agent Context

```python
class AgentContext(BaseModel):
    project_memory:     dict              # key decisions, confirmed tasks
    summaries:          list[str]         # rolling conversation summaries
    recent_messages:    list[MessageOut]  # raw messages within context budget
    file_excerpts:      list[str]         # retrieved indexed file content
    current_plan:       dict | None       # current finalized plan, if any
```

### Monitor Output

```python
class MonitorOutput(BaseModel):
    decisions:    list[ExtractedItem]
    tasks:        list[ExtractedItem]
    key_details:  list[ExtractedItem]

class ExtractedItem(BaseModel):
    content:      str
    source_ids:   list[UUID]   # message IDs that support this item
    excerpt:      str          # short quote from source
    confidence:   Literal["high", "medium", "low"]
```

### Analyzer Output

```python
class AnalyzerOutput(BaseModel):
    gaps:   list[GapItem]
    risks:  list[GapItem]

class GapItem(BaseModel):
    description:    str
    severity:       Literal["critical", "major", "minor"]
    related_items:  list[str]   # references to MonitorOutput items or plan sections
```

### Planner Output (Plan Proposal)

```python
class PlanProposal(BaseModel):
    project_id:  UUID
    status:      Literal["pending", "approved", "rejected", "applied"]
    changes:     list[ProposedChange]
    created_at:  datetime

class ProposedChange(BaseModel):
    section:      str                           # e.g. "tasks", "timeline", "responsibilities"
    action:       Literal["add", "update", "remove"]
    content:      dict                          # the proposed new value
    justification: str                          # references source message or gap
    confidence:   Literal["high", "medium", "low"]
    approved:     bool | None = None            # set by user during approval
```

---

## 9. Error Handling

### Agent Failure Rules

- **Never swallow exceptions silently.** If an agent fails, update `agent_status` to `error` and surface the error in the AI activity panel.
- **Partial results are not applied.** If any agent in the pipeline fails, no plan changes are staged or applied for that run.
- **Retry policy:** Transient LLM/network errors should be retried up to 3 times with exponential backoff before marking the run as failed.
- **Context errors:** If the assembled context exceeds the model's token limit, the agent must trim the least-relevant content (oldest summaries, lowest-relevance file excerpts) and log a warning — it must not crash.

### Error Status Payload

```python
class AgentError(BaseModel):
    agent:    Literal["monitor", "analyzer", "planner", "updater"]
    code:     str          # e.g. "CONTEXT_OVERFLOW", "LLM_TIMEOUT", "INVALID_OUTPUT"
    message:  str          # human-readable description shown in the UI
    run_id:   UUID
```

---

## 10. Anti-Patterns Checklist

Avoid the following at all times:

| Anti-Pattern | Why It's Wrong |
|---|---|
| Writing to `project_plan` without user approval | Violates the core safety rule — all AI writes require explicit approval |
| Loading raw full chat history into context | Will exceed context window; use chunked summaries + retrieval |
| Swallowing agent exceptions | Hides failures; agents must always surface errors |
| Running AI pipeline in `BackgroundTasks` | Long-running LLM calls will block the event loop; use a task queue |
| Hallucinating gaps or risks not grounded in conversation | Erodes user trust; every item must cite a source message |
| Applying a proposal more than once | Must be idempotent; check proposal `status` before applying |
| Calling MCP tools not enabled in `ai_settings` | Violates project-scoped tool permission configuration |
| Ignoring multilingual input | The MVP explicitly supports any language — never assume English only |