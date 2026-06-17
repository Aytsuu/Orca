# Structured Plan — Design Specification

> **Document type:** Frontend design contract  
> **Feeds into:** `PlanView.tsx`, `ai-engine.md`, `api-guidelines.md`  
> **Stack:** Astro + React + TypeScript + Tailwind CSS  
> **Design tokens:** `DESIGN.md` via `ui-ux.md`  
> **Last updated:** 2026-06-17

---

## Purpose

This document defines what a **structured plan** looks like as a rendered frontend artifact in Orca. It answers three questions:

1. What **data** does a plan carry?
2. What **visual components** does a plan render, and in what order?
3. How does the **Planner agent output** map to those components?

This is the authoritative contract between the LLM planner output schema and the `PlanView` component. Do not deviate from the structure defined here without updating this file first.

### Design Decisions (resolved)

| # | Question | Decision |
|---|---|---|
| 1 | Task expansion model | **Inline** — detail expands in-place below the task row (Notion-style, no modal or drawer) |
| 2 | File attachment scope | **Both** — task-level attachments exist separately from project-level files; a "View All Files" entry point links to the full project file list |
| 3 | Code snippets | **Stretch goal** — not included in the MVP plan; excluded from this spec |
| 4 | Phase goal field | **Included** — `Phase` carries a `goal` string (one sentence describing what the phase achieves) |
| 5 | Task description vs. acceptance criteria | **Two separate fields** — `description` (context/rationale) and `acceptanceCriteria[]` (done-when bullets) |
| 6 | Risk Summary visibility | **All members** — visible to everyone once the plan is finalized |

---

## 1 — Plan Hierarchy

A structured plan is a document with the following hierarchy:

```
Plan
├── Header
│     title, description, status, version, dates
├── Overview
│     objectives[], stakeholders[]
├── Phase[]  (1…N)
│     ├── Phase Header  (title, timeframe badge, goal)
│     ├── Task[]  (1…N)
│     │     ├── Task Row       (step #, title, owner, due, priority, state badge)
│     │     └── Task Detail    (inline-expanded)
│     │           ├── description
│     │           ├── acceptanceCriteria[]
│     │           ├── FileAttachment[]  (task-level)
│     │           └── sourceQuote       (traceability to chat message)
│     └── GapNotice[]   (Analyzer gaps scoped to this phase)
└── RiskSummary
      RiskItem[]  (global risks, visible to all after finalization)
```

---

## 2 — Data Model

### 2.1 Top-level Plan

```ts
interface StructuredPlan {
  id:           string;
  projectId:    string;
  title:        string;          // e.g. "Runway Q3 Launch"
  description:  string;         // 1–3 sentence project summary
  status:       PlanStatus;
  version:      number;         // 1-indexed; increments on each finalized update
  createdAt:    string;         // ISO datetime
  updatedAt:    string;         // ISO datetime
  finalizedAt?: string;         // set when status becomes 'finalized'

  objectives:   string[];       // 3–5 SMART goal bullets
  stakeholders: Stakeholder[];
  phases:       Phase[];
  globalRisks:  RiskItem[];
}

type PlanStatus =
  | 'draft'            // AI generated; not yet reviewed by approver
  | 'pending_review'   // approver is actively reviewing
  | 'finalized'        // approved and synced to all members
  | 'reverted';        // rolled back from a newer version
```

### 2.2 Stakeholder

```ts
interface Stakeholder {
  userId:   string;
  name:     string;     // full display name
  role:     string;     // e.g. "Tech Lead", "Designer", "QA"
  initials: string;     // e.g. "JD"
}
```

### 2.3 Phase

```ts
interface Phase {
  id:        string;
  title:     string;     // e.g. "Phase 1 — Foundation"
  goal:      string;     // one sentence: what this phase achieves
  timeframe: string;     // e.g. "Day 1–2", "Week 1"
  tasks:     Task[];
  gaps:      GapItem[];  // gaps scoped to this phase (from Analyzer)
}
```

### 2.4 Task

```ts
interface Task {
  id:                  string;
  title:               string;
  description?:        string;          // context / rationale
  acceptanceCriteria?: string[];        // done-when bullets
  owner?:              string;          // display name or "@mention"
  ownerUserId?:        string;
  due?:                string;          // ISO date or relative ("Day 2")
  priority:            'critical' | 'high' | 'medium' | 'low';
  status:              TaskStatus;
  attachments:         FileAttachment[]; // task-level only
  sourceMessageIds:    string[];        // chat message IDs that justify this task
  sourceExcerpt?:      string;          // short quote shown in expanded detail
  confidence:          'high' | 'medium' | 'low'; // from Planner agent
  isNew?:              boolean;         // AI-proposed addition (pending approval)
  isModified?:         boolean;         // AI-proposed update (pending approval)
}

type TaskStatus =
  | 'proposed'    // AI suggested; awaiting approver action
  | 'accepted'    // approver accepted
  | 'rejected'    // approver rejected
  | 'gap';        // Analyzer flagged missing info on this task
```

### 2.5 File Attachment (task-level)

```ts
interface FileAttachment {
  id:           string;
  name:         string;
  type:         'image' | 'video' | 'audio' | 'document' | 'other';
  sizeBytes:    number;
  url:          string;
  uploadedBy:   string;
  uploadedAt:   string;
}
```

### 2.6 Gap Item

```ts
interface GapItem {
  id:               string;
  description:      string;
  severity:         'critical' | 'major' | 'minor';
  relatedTaskId?:   string;     // if gap is tied to a specific task
  sourceMessageIds: string[];   // chat messages that surface this gap
  sourceExcerpt?:   string;
}
```

### 2.7 Risk Item

```ts
interface RiskItem {
  id:               string;
  description:      string;
  severity:         'critical' | 'major' | 'minor';
  mitigation?:      string;
  sourceMessageIds: string[];
  sourceExcerpt?:   string;
}
```

---

## 3 — Visual Components

All token references below use CSS custom properties defined in `DESIGN.md`.  
Do not use arbitrary values — reference only the named tokens.

---

### 3.1 Plan Header

The first visible block when the Plan tab opens. Establishes context for everything below.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PROJECT PLAN                                                   │  ← eyebrow label
│                                                                 │
│  Runway Q3 Launch                                               │  ← H1
│  AI-generated plan based on 3 days of team discussion.          │  ← description
│                                                                 │
│  [📅 Jun 12]  [v3 of 3]  [● Pending Review]                    │  ← meta pill row
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │  ← divider
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Token mapping:**

| Element | Token / Class |
|---|---|
| Eyebrow | `.section-label` — `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted` |
| H1 title | `--text-display-sm` (36px), `--weight-bold`, `--color-text-primary`, `--tracking-tight` |
| Description | `--text-md`, `--color-text-secondary`, max 3 lines |
| Meta pills | `.category-badge` base style — inline chips |
| Status: Draft | Muted tint — `--color-text-muted` |
| Status: Pending Review | Warning tint — `--color-warning` |
| Status: Finalized | Success tint — `--color-success` |
| Divider | `border-top: 1px solid var(--color-border-subtle)`, `margin: --space-8 0` |

---

### 3.2 Overview Section

Executive summary of the project. Always visible; not collapsible.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│  OVERVIEW                                                       │  ← section label
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  OBJECTIVES                                                     │  ← sub-label
│  ▸ Launch redesigned checkout flow before Q3 ends               │
│  ▸ Reduce checkout drop-off rate by 15%                         │
│  ▸ Pass WCAG AA accessibility audit                             │
│                                                                 │
│  TEAM                                                           │  ← sub-label
│  [JD]  Jan Doe    Tech Lead                                     │
│  [RY]  Ryu Lee    Designer                                      │
│  [SK]  Sam K.     QA                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Token mapping:**

| Element | Token / Class |
|---|---|
| Section label | `.section-label` |
| Sub-labels ("OBJECTIVES", "TEAM") | `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted`, `margin-top: --space-6` |
| Objective item | `▸` glyph + `--text-sm`, `--color-text-secondary`, `gap: --space-2` between items |
| Stakeholder avatar | 32px circle, `--color-surface` bg, initials in `--text-xs --weight-semibold --color-text-muted` |
| Stakeholder name | `--text-sm`, `--weight-semibold`, `--color-text-primary` |
| Stakeholder role | `--text-xs`, `--color-text-muted` |
| Stakeholder row gap | `--space-3` between rows |

---

### 3.3 Phase Block

The core repeating structure. Each phase renders as a visually distinct section.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Phase 1 — Foundation                           [Day 1–2]      │  ← H2 + timeframe badge
│  Set up the technical foundation for the project.               │  ← goal (italic)
│                                                                 │
│  · · · · · · · · · · · · · · · · · · · · · · · · · · · · · ·  │  ← inner dashed divider
│                                                                 │
│  [Task rows...]                                                 │
│  [Gap notices, if any...]                                       │
│                                                                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  ← phase-end divider
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Token mapping:**

| Element | Token / Class |
|---|---|
| H2 title | `--text-lg` (22px), `--weight-bold`, `--color-text-primary` |
| Timeframe badge | `.category-badge` — `--color-text-muted` tint |
| Goal line | `--text-sm`, `--color-text-secondary`, `font-style: italic` |
| Inner divider | `border-top: 1px dashed var(--color-border-subtle)`, `margin: --space-5 0` |
| Phase-end divider | `border-top: 1px solid var(--color-border-subtle)`, `margin: --space-10 0` |
| Phase block gap | `gap: --space-10` between consecutive phases |

---

### 3.4 Task Row

The atomic unit of a plan. Has 5 distinct visual states.

**State: Default (accepted or no pending changes)**

```
┌─────────────────────────────────────────────────────────────────┐
│  01  Define product requirements                                │
│      Owner: @jan  ·  Due: Jun 14  ·  ● High                   │
└─────────────────────────────────────────────────────────────────┘
```

**State: New (AI-proposed addition, pending approval)**

```
╔═════════════════════════════════════════════════════════════════╗
║  02  Deploy staging environment             [NEW]               ║  ← cyan left border
║      Owner: @ryu  ·  Due: Jun 15  ·  ● High                   ║  ← cyan bg tint
╚═════════════════════════════════════════════════════════════════╝
```

**State: Modified (AI-proposed update, pending approval)**

```
╔═════════════════════════════════════════════════════════════════╗
║  03  API integration                     [UPDATED]              ║  ← cyan left border
║      Priority changed: Low → High  ·  Owner: @jan              ║  ← shows what changed
╚═════════════════════════════════════════════════════════════════╝
```

**State: Gap (missing required info)**

```
╔═════════════════════════════════════════════════════════════════╗
║  04  Write test suite                  ⚠ Missing Owner          ║  ← amber left border
║      Owner: —  ·  Due: Jun 16  ·  ● Medium                    ║  ← amber bg tint
╚═════════════════════════════════════════════════════════════════╝
```

**State: Rejected (approver rejected this AI proposal)**

```
┌─────────────────────────────────────────────────────────────────┐
│  05  ~~Migrate legacy data~~              ✕ Rejected            │  ← muted, strikethrough
│      Owner: @sam  ·  Due: Jun 17  ·  ● Low                    │
└─────────────────────────────────────────────────────────────────┘
```

**Token mapping — state matrix:**

| State | Left border | Background | Badge |
|---|---|---|---|
| Default | `transparent` | none | — |
| New | `2px solid var(--color-primary)` | `rgba(27,191,224,0.10)` | `NEW` in `--color-primary` |
| Modified | `2px solid var(--color-primary)` | `rgba(27,191,224,0.10)` | `UPDATED` in `--color-primary` |
| Gap | `2px solid var(--color-warning)` | `rgba(243,156,18,0.06)` | `⚠ <reason>` in `--color-warning` |
| Rejected | `transparent` | none | `✕ Rejected` in `--color-error`; title `opacity: 0.4; text-decoration: line-through` |

**Token mapping — base elements:**

| Element | Token / Class |
|---|---|
| Step number | `--font-mono`, `--text-xs`, `--color-text-muted`, fixed `width: 24px`, right-aligned |
| Task title | `--text-sm`, `--weight-bold`, `--color-text-primary` |
| Meta line | `--text-xs`, `--color-text-muted`, flex row with `·` separators |
| Priority dot | 6px circle — Critical: `--color-error`; High: `--color-warning`; Medium: `--color-primary`; Low: `--color-text-muted` |
| Hover | `background: rgba(var(--color-surface-raised), 0.40)`, `cursor: pointer` |
| Transition | `200ms ease` on background and border-color |
| Row padding | `padding: --space-2`, `margin: 0 calc(-1 * --space-2)` (bleed to left) |
| Rows gap | `gap: --space-4` between task rows within a phase |
| Phase indent | `padding-left: --space-6`, `margin-left: --space-3` (visual indent from phase header) |

---

### 3.5 Task Detail (Inline Expanded)

Clicking a task row expands it **in place** — content slides in below the row header without navigation or a modal. Collapsing restores the compact row.

**Wireframe (expanded state):**

```
┌─────────────────────────────────────────────────────────────────┐
│  01  Define product requirements                       [▲ Hide] │  ← row stays visible
│      Owner: @jan  ·  Due: Jun 14  ·  ● High                   │
│      ─────────────────────────────────────────────────────────  │  ← inner rule
│                                                                 │
│      Define the full requirements for the redesigned checkout   │  ← description
│      flow: user stories, API contract, and acceptance criteria  │
│      aligned with the Q3 goal.                                  │
│                                                                 │
│      DONE WHEN                                                  │  ← sub-label
│      ▸ PRD document shared with the team                        │
│      ▸ API contract reviewed by @ryu                            │
│      ▸ Acceptance criteria signed off by @jan                   │
│                                                                 │
│      ATTACHMENTS                                                │  ← sub-label (only if files exist)
│      ▢ design-brief.pdf      PDF · 2.4 MB       [Preview →]    │
│      ▢ wireframes.fig        Figma · 14 MB      [Preview →]    │
│                              [View All Project Files →]         │  ← link to project file list
│                                                                 │
│      SOURCE                                                     │  ← sub-label
│      "Let's make sure we document the API before we build       │
│       anything." — @jan, Jun 12                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Expand / collapse behavior:**

- **Trigger:** Click anywhere on the task row (title or meta line)
- **Animation:** `max-height` transition from `0` to `auto` over `200ms ease`; no layout shift for other tasks
- **Toggle label:** `[▼ Expand]` when collapsed (shown on row hover only); `[▲ Hide]` when expanded (always visible)
- **State:** Local component state — no URL change, no persistence

**Token mapping:**

| Element | Token / Class |
|---|---|
| Expand/collapse toggle | `.btn-ghost`, `--text-xs`, right-aligned within the row header |
| Inner rule | `border-top: 1px solid var(--color-border-subtle)`, `margin: --space-3 0` |
| Description | `--text-sm`, `--color-text-secondary`, `line-height: --leading-relaxed` |
| Sub-labels | `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted`, `margin-top: --space-5` |
| Criteria bullets | `▸` glyph, `--text-sm`, `--color-text-secondary`, `gap: --space-2` |
| Detail padding | `padding: --space-4 0 --space-6 0` (above the SOURCE block) |

---

### 3.6 File Attachment Row (task-level)

Appears inside Task Detail under the **ATTACHMENTS** sub-label. Task-level attachments are distinct records from the project-level Files Panel — but both reference the same underlying file storage.

```
  ▢ design-brief.pdf      PDF · 2.4 MB       [Preview →]
  ▢ wireframes.fig        Figma · 14 MB      [Preview →]
  ▢ screen-recording.mp4  Video · 48 MB      [Preview →]
                          [View All Project Files →]
```

**Token mapping:**

| Element | Token / Class |
|---|---|
| File icon | `▢` Unicode glyph, `--text-sm`, `--color-text-muted` |
| File name | `--text-sm`, `--weight-medium`, `--color-text-primary` |
| File meta | `--text-xs`, `--color-text-muted` (type · size) |
| Preview link | `.btn-ghost`, `--text-xs`, `--color-primary`, `[Preview →]` |
| Row hover | `background: var(--color-primary-muted)`, `--radius-sm` |
| Row padding | `padding: --space-3 --space-2` |
| "View All" link | `.btn-ghost`, `--text-xs`, `--color-text-muted`, right-aligned, shown below the attachment list |

**"View All Project Files" behavior:**
- Navigates to or opens the project-level Files Panel (left column of the Chat tab)
- Not a modal — navigates to `/project/[id]/chat` with the files column in focus

---

### 3.7 Source Quote

Appears at the bottom of every expanded Task Detail. Provides traceability from the plan to the chat conversation.

```
  SOURCE
  "Let's make sure we document the API before we build anything."
  — @jan, Jun 12 at 10:32 AM
```

**Token mapping:**

| Element | Token / Class |
|---|---|
| Sub-label | `.section-label` inline |
| Quote text | `--text-xs`, `--color-text-muted`, `font-style: italic`, `quotes: '"' '"'` |
| Attribution | `--text-xs`, `--color-text-muted`, `— @name, date` |
| Multiple sources | Show up to 2 quotes; if more, show `+N more from chat` ghost link |

---

### 3.8 Gap Notice (inline within a Phase)

When the Analyzer flags a gap that is **not directly tied to a specific task** — it renders as a standalone notice block within the phase, after all task rows.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠  CRITICAL GAP                                                │
│  ─────────────────────────────────────────────────────────────  │
│  No deployment timeline defined for Phase 2. The team           │
│  discussed "we'll figure out staging later" — a concrete        │
│  date must be set before Phase 1 ends.                          │
│                                                                 │
│  "We'll figure out staging later." — @ryu, Jun 13               │
└─────────────────────────────────────────────────────────────────┘
```

**Severity variants:**

| Severity | Border | Background | Label color |
|---|---|---|---|
| Critical | `rgba(231,76,60,0.40)` | `rgba(231,76,60,0.06)` | `--color-error` |
| Major | `rgba(243,156,18,0.40)` | `rgba(243,156,18,0.06)` | `--color-warning` |
| Minor | `rgba(125,141,131,0.40)` | `rgba(125,141,131,0.04)` | `--color-text-muted` |

**Token mapping:**

| Element | Token / Class |
|---|---|
| Container | `border: 1px solid <severity-border>`, `background: <severity-bg>`, `--radius-sm`, `padding: --space-5` |
| Header | `⚠` glyph + severity label — `--text-xs`, `--tracking-widest`, uppercase, `<severity-label-color>` |
| Inner rule | `border-top: 1px solid <severity-border>`, `margin: --space-2 0` |
| Body | `--text-sm`, `--color-text-secondary` |
| Source quote | `--text-xs`, `--color-text-muted`, `font-style: italic` |
| Margin | `margin-top: --space-5` (below the last task row in the phase) |

---

### 3.9 Risk Summary Block

Appears at the very **end of the plan**, after all phases. Visible to all project members once the plan is finalized. During draft/pending review, visible to the approver only.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│  RISKS & FLAGS                                                  │  ← section label
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ● CRITICAL                                                     │
│  No fallback if the external payment API goes down during       │
│  launch week.                                                   │
│  Mitigation: mock the API for staging; build a retry circuit.   │
│                                                                 │
│  ● MAJOR                                                        │
│  Context window limits may degrade AI plan quality on           │
│  conversations longer than ~100 messages.                       │
│  Mitigation: rolling summaries + project memory.                │
│                                                                 │
│  ○ MINOR                                                        │
│  Two team members share the same timezone, which may slow        │
│  async review cycles.                                           │
│  Mitigation: set async review SLA of 4 hours.                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Token mapping:**
6
| Element | Token / Class |
|---|---|
| Section label | `.section-label` |
| Severity dot | 8px circle: Critical = `--color-error`; Major = `--color-warning`; Minor = `--color-text-muted` |
| Severity label | `--text-xs`, `--tracking-widest`, uppercase, same color as dot |
| Risk description | `--text-sm`, `--color-text-secondary` |
| Mitigation line | `--text-xs`, `--color-text-muted`; `Mitigation:` prefix in `--weight-semibold` |
| Risk item gap | `--space-8` between risk items |
| Block margin | `margin-top: --space-16` (large visual separation from last phase) |

---

## 4 — Review Panel (Approver Only)

The right sidebar on the Plan tab. This panel contains a **diff queue** — not the plan itself. Each card represents one pending AI-proposed change. Approvers action each change individually or accept all at once.

**Wireframe:**

```
┌─────────────────────────────────────────────────────────────────┐
│  PENDING CHANGES  (3)                                           │  ← section label + count
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ◈ ADD TASK                                               │  │  ← action type
│  │  "Deploy to staging"                                      │  │
│  │  Phase 2  ·  Owner @ryu  ·  Due Jun 15                    │  │
│  │                                                           │  │
│  │  "we need a staging env before the demo" — @ryu, Jun 13  │  │  ← source quote
│  │                                                           │  │
│  │  [✓ Accept]                         [✕ Reject]           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ◈ UPDATE PRIORITY                                        │  │
│  │  "API integration"  Low → High                            │  │
│  │  Phase 2                                                  │  │
│  │                                                           │  │
│  │  "this is now the main blocker" — @jan, Jun 13            │  │
│  │                                                           │  │
│  │  [✓ Accept]                         [✕ Reject]           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  [✓ Accept All →]                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.1 Change Card Anatomy

| Element | Token / Class |
|---|---|
| Card container | `background: var(--color-background)`, `border: 1px solid var(--color-border-subtle)`, `--radius-sm`, `padding: --space-5`, `margin-bottom: --space-3` |
| Action type | `◈` glyph + label — `--text-xs`, `--tracking-widest`, uppercase, `--color-primary` |
| Change title | `--text-sm`, `--weight-bold`, `--color-text-primary` |
| Detail line | `--text-xs`, `--color-text-muted` |
| Source quote | `--text-xs`, `--color-text-muted`, `font-style: italic` |
| Accept button | `.btn-primary` small — `✓ Accept` |
| Reject button | `.btn-secondary` small with `--color-error` text override — `✕ Reject` |

### 4.2 Action Type Labels

| `ProposedChange.action` | `ProposedChange.section` | Label |
|---|---|---|
| `add` | `tasks` | `◈ ADD TASK` |
| `update` | `tasks` | `◈ UPDATE [FIELD]` (e.g. `◈ UPDATE PRIORITY`) |
| `remove` | `tasks` | `◈ REMOVE TASK` |
| `add` | `phases` | `◈ ADD PHASE` |
| `gap_flag` | `*` | `⚠ GAP FLAGGED` — uses `--color-warning` instead of `--color-primary` |

### 4.3 Accept All button

`.btn-primary` full-width, pinned to the bottom of the panel. Label: `✓ Accept All →`.  
Only shown when there are pending changes. Disabled (`opacity: 0.38`, `cursor: not-allowed`) if no changes remain.

### 4.4 Empty State (review complete)

```
  ✓  Review complete.
     No pending changes.
```

`--text-sm`, `--color-text-muted`, centered within the panel.

---

## 5 — Planner Agent Output → UI Mapping

How each `ProposedChange` from `ai-engine.md §8` maps to what the user sees:

| Agent output | Plan Content column | Review Panel |
|---|---|---|
| `action: add, section: tasks` | New task row with `[NEW]` badge + cyan border | `◈ ADD TASK` change card |
| `action: update, section: tasks` | Modified task row with `[UPDATED]` badge + cyan border | `◈ UPDATE [FIELD]` change card |
| `action: remove, section: tasks` | Task row greyed out with `✕ Removed` badge | `◈ REMOVE TASK` change card |
| `action: add, section: phases` | Entire new phase block with `[NEW]` badge | `◈ ADD PHASE` change card |
| `gap_flag` (from Analyzer) | Inline GapNotice in the relevant phase; task row gets `gap` state if task-specific | `⚠ GAP FLAGGED` change card |
| Risk items (from Analyzer) | Added to Risk Summary block | No change card — informational only |

***

---

## 6 — Full Page Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  NAVBAR  (56px sticky)                                               │
│  TAB BAR  (48px — Chat | Plan ← active | AI Settings)               │
├──────────────────────────────────────────────────────────────────────┤
│  PLAN CONTROLS BAR  (52px)                                           │
│  [← v2 of 3]  [↩ Revert]  ⚠ 2 gaps  [Finalize & Sync →]            │
├─────────────────────────────────────┬────────────────────────────────┤
│  PLAN CONTENT                       │  REVIEW PANEL                  │
│  flex: 1                            │  width: 280px                  │
│  overflow-y: auto                   │  background: --color-surface   │
│  padding: --space-10 --space-16     │  border-left: 1px solid border │
│  max-width: 760px (centered)        │  padding: --space-6            │
│                                     │  overflow-y: auto              │
│  [3.1 Plan Header]                  │                                │
│  [3.2 Overview Section]             │  (approver only)               │
│  ────────────────────────────────   │                                │
│  [3.3 Phase 1 Block]                │  PENDING CHANGES (3)           │
│    [3.4 Task Row — default]         │  ┌────────────────────────┐    │
│    [3.4 Task Row — new]             │  │ ◈ ADD TASK             │    │
│    [3.5 Task Detail — expanded]     │  │ [✓ Accept] [✕ Reject]  │    │
│      [3.6 File Attachments]         │  └────────────────────────┘    │
│      [3.7 Source Quote]             │  ┌────────────────────────┐    │
│    [3.4 Task Row — gap]             │  │ ◈ UPDATE PRIORITY      │    │
│    [3.8 Gap Notice]                 │  │ [✓ Accept] [✕ Reject]  │    │
│  ════════════════════════════════   │  └────────────────────────┘    │
│  [3.3 Phase 2 Block]                │  ─────────────────────────     │
│    [3.4 Task Row — modified]        │  [✓ Accept All →]              │
│    [3.4 Task Row — rejected]        │                                │
│    [3.4 Task Row — default]         │                                │
│  ════════════════════════════════   │                                │
│  [3.9 Risk Summary]                 │                                │
│                                     │                                │
└─────────────────────────────────────┴────────────────────────────────┘
```

**Read-only layout (Viewer role, after finalization):**

- Review panel is **hidden** — plan content spans full width
- Controls bar is replaced by the finalized notice banner (from `ui-ux.md §6`)
- Risk Summary is **visible** — all members see it

---

## 7 — Empty States

### No plan generated yet

Shown when `phases` is empty and the plan has never been generated.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                        ◈                                        │
│                                                                 │
│             No plan generated yet                               │
│      Start chatting with your team — the AI will                │
│      generate a structured plan from your discussions.          │
│                                                                 │
│                   [Go to Chat →]                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

| Element | Token / Class |
|---|---|
| Icon glyph | `◈`, 32px, `--color-text-muted` |
| Heading | `--text-lg`, `--weight-bold`, `--color-text-primary` |
| Subtext | `--text-sm`, `--color-text-secondary` |
| CTA | `.btn-primary` — `Go to Chat →` |

### Review panel — no pending changes

```
  ✓  Review complete.
     No pending changes.
```

`--text-sm`, `--color-text-muted`, centered, `--color-success` checkmark.

---

## 8 — Responsive Behavior

| Breakpoint | Plan Content | Review Panel |
|---|---|---|
| Desktop (≥ 1280px) | `flex: 1`, side-by-side with panel | `width: 280px`, always visible |
| Tablet (768–1279px) | Full width | Collapsed to a `(N)` badge button in the controls bar; slides in as an overlay drawer from the right |
| Mobile (< 768px) | Full width, reduced padding | Accessible via a floating `◈ Review (N)` button fixed to bottom-right |

---

## 9 — What This Document Does NOT Cover

The following are **out of scope** for this spec and documented elsewhere:

- **Code Snippets** — stretch goal; not included in MVP
- **Plan Controls Bar** — fully specified in `ui-ux.md §6.1`
- **Revert / Finalize modals** — fully specified in `ui-ux.md §6.4` and `§6.5`
- **Agent pipeline internals** — see `ai-engine.md`
- **API endpoints for plan CRUD** — see `api-guidelines.md`
- **Plan version history UI** — version navigation handled by the controls bar; content area simply reflects the active version

---

## 10 — Manual Authoring

The plan is **not exclusively AI-generated**. Users with the appropriate permissions can manually add, edit, or remove any plan component at any time. The AI is a collaborator — human judgment is always the final authority on plan content.

### 10.1 Who Can Manually Author

| Role | Can manually add/edit | Can delete |
|---|---|---|
| **Creator** | ✅ All components | ✅ |
| **Approver** (delegated) | ✅ All components | ✅ |
| **Viewer / Member** | ❌ Read-only | ❌ |

Authoring permissions mirror the approval permissions model from `mvp.md`.

---

### 10.2 What Can Be Manually Added or Edited

Every major component of the plan supports human input:

| Component | Can add manually | Can edit fields | Can delete |
|---|---|---|---|
| Plan title | — | ✅ | — |
| Plan description | — | ✅ | — |
| Objectives (in Overview) | ✅ Add bullet | ✅ Edit text | ✅ Remove bullet |
| Stakeholders (in Overview) | ✅ | ✅ role label | ✅ |
| Phase | ✅ | ✅ title, goal, timeframe | ✅ (with confirmation) |
| Task | ✅ within any phase | ✅ all fields | ✅ (with confirmation) |
| Task description | — | ✅ | — |
| Acceptance criteria bullet | ✅ Add bullet | ✅ Edit text | ✅ Remove bullet |
| File attachment (task-level) | ✅ Upload | — | ✅ |
| Gap Notice | — | — | ✅ (dismiss) |
| Risk item | ✅ | ✅ description, severity, mitigation | ✅ |

---

### 10.3 How Manual Authoring Works — Principles

1. **Applies immediately.** Manually authored content does not go through the AI proposal/approval flow. The user is the author — their action is the approval.
2. **No AI middleman.** Adding a phase, task, or field manually never triggers the AI pipeline. The change is saved directly.
3. **Visually distinct from AI content.** Manually authored items are never labeled `[NEW]` or `[UPDATED]` — those badges are AI-only. Manual additions render as plain content from the moment they are saved.
4. **AI respects manual content.** On the next pipeline run, the Planner agent reads the current plan state (including manually added content) as ground truth. It will not propose to remove or override manually authored items unless the conversation explicitly supports it.
5. **Inline editing, no page navigation.** All manual edits happen in-place within the Plan tab, consistent with the inline expand/collapse pattern for Task Detail.

---

### 10.4 Add Phase — Interaction

A persistent `+ Add Phase` button sits below the last phase block, above the Risk Summary.

**Wireframe:**

```
  ════════════════════════════════════════════════════════════

  [+ Add Phase]                                                ← ghost button, full-width

  ════════════════════════════════════════════════════════════
```

**On click — inline form expands:**

```
┌─────────────────────────────────────────────────────────────────┐
│  NEW PHASE                                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Phase Title                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  e.g. Phase 3 — Testing                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Goal  (one sentence — what this phase achieves)               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Timeframe  (optional)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  e.g. Day 5–6                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Cancel]                              [Add Phase →]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Behavior:**
- `[Add Phase →]` is disabled until Phase Title is filled.
- On confirm: the new phase block appears at the bottom of the phase list (above `+ Add Phase`). It contains zero tasks and shows the `+ Add Task` affordance immediately.
- `[Cancel]` collapses the form without saving.

**Token mapping:**

| Element | Token / Class |
|---|---|
| `+ Add Phase` button | `.btn-ghost` full-width, `--text-sm`, `--color-text-muted`, dashed top/bottom border on hover |
| Form container | `background: var(--color-surface-raised)`, `border: 1px solid var(--color-border)`, `--radius-sm`, `padding: --space-8` |
| Form label | `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted` |
| Text inputs | Same style as New Project Modal — `background: var(--color-background)`, `border: 1px solid var(--color-border)`, `--radius-sm`, `padding: --space-3 --space-4`, `--text-md`. Focus: `outline: 2px solid var(--color-primary)` |
| Cancel | `.btn-secondary` |
| Add Phase | `.btn-primary` — disabled until title is filled |

---

### 10.5 Add Task — Interaction

Each phase has a `+ Add Task` ghost row at the bottom of its task list.

**Wireframe:**

```
  01  Define product requirements
      Owner: @jan  ·  Due: Jun 14  ·  ● High

  + Add Task                                                      ← ghost row, indented with tasks
```

**On click — inline mini-form expands below:**

```
  ┌───────────────────────────────────────────────────────────────┐
  │  Task Title *                                                 │
  │  ┌─────────────────────────────────────────────────────────┐  │
  │  │  e.g. Write unit tests for checkout flow                │  │
  │  └─────────────────────────────────────────────────────────┘  │
  │                                                               │
  │  Owner               Due Date             Priority            │
  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    │
  │  │  @mention    │    │  Jun 18      │    │  Medium  ▾   │    │
  │  └──────────────┘    └──────────────┘    └──────────────┘    │
  │                                                               │
  │  [Cancel]                                 [Add Task →]        │
  └───────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Minimal form — only title is required. Owner, due, and priority are optional.
- On confirm: the new task appends to the bottom of the phase's task list. It renders in the default task state (no badge, no border accent).
- The task can immediately be clicked to expand and fill in description, acceptance criteria, and file attachments.

**Expanding after creation:**

Once the task is created, the user clicks it to expand Task Detail (§3.5) and can add:
- `description` — free-text rich textarea
- `acceptanceCriteria[]` — bullet list with `+ Add criterion` inline
- `attachments[]` — file upload via drag-and-drop or file picker

---

### 10.6 Edit Any Existing Field — Inline Editing

All editable text fields in the plan support **click-to-edit** — clicking the content switches it to an editable input in place.

**Editable fields and their input types:**

| Field | Input type | Where |
|---|---|---|
| Plan title | Single-line text | Plan Header |
| Plan description | Multi-line textarea | Plan Header |
| Objective bullet | Single-line text | Overview |
| Phase title | Single-line text | Phase Block header |
| Phase goal | Single-line text | Phase Block header |
| Phase timeframe | Single-line text | Phase Block header |
| Task title | Single-line text | Task Row |
| Task owner | Text with `@mention` autocomplete | Task Detail |
| Task due date | Date picker | Task Detail |
| Task priority | Dropdown (`critical / high / medium / low`) | Task Detail |
| Task description | Multi-line textarea | Task Detail |
| Acceptance criteria bullet | Single-line text | Task Detail |
| Risk description | Multi-line textarea | Risk Summary |
| Risk mitigation | Single-line text | Risk Summary |

**Click-to-edit behavior:**

```
  Before (read mode):
  Define product requirements                           [Edit ✎]
                                                        ↑ shown on hover only

  After click (edit mode):
  ┌────────────────────────────────────────────────────┐  [✓]  [✕]
  │  Define product requirements                       │
  └────────────────────────────────────────────────────┘
```

- **Trigger:** Click on the field text, or click the `[Edit ✎]` icon (visible on row hover)
- **Save:** `Enter` key (single-line) or `Ctrl+Enter` (multi-line), or click the `[✓]` icon
- **Cancel:** `Escape` key or click the `[✕]` icon — reverts to prior value
- **Validation:** Title fields cannot be blank on save
- **Auto-save:** No auto-save — the user must explicitly confirm the edit

**Token mapping:**

| Element | Token / Class |
|---|---|
| Edit icon | `✎` glyph, `.btn-ghost`, `--text-xs`, `--color-text-muted`, shown on hover only |
| Inline input | Same style as Add Phase form inputs |
| Confirm icon | `✓` — `.btn-ghost`, `--color-success` |
| Cancel icon | `✕` — `.btn-ghost`, `--color-text-muted` |

---

### 10.7 Add File to a Task — Interaction

Inside an expanded Task Detail, under **ATTACHMENTS**, a persistent upload trigger sits below any existing file rows.

**Wireframe:**

```
  ATTACHMENTS
  ▢ design-brief.pdf      PDF · 2.4 MB       [Preview →]
  ▢ wireframes.fig        Figma · 14 MB      [Preview →]

  [⊕ Attach File]                                               ← ghost button
                          [View All Project Files →]
```

**On click — file picker opens** (OS native dialog).  
**Drag-and-drop:** The task detail area accepts drag-and-drop directly when the task is expanded.

**After upload:**
- File appears immediately as a new row in the attachment list.
- File is saved as a **task-level attachment** — not automatically added to the project-level Files Panel, but the "View All Project Files" link will include it.
- Accepted types: images, videos, audio, documents (same as project-level files).

---

### 10.8 Add / Dismiss Gap and Risk Items Manually

**Gap Notice — dismiss:**
- Each Gap Notice has a `[✕ Dismiss]` ghost button (top-right corner, shown on hover).
- Dismissing a gap removes it from the plan view. It does **not** remove it from the Analyzer's output — if the underlying condition persists, the next pipeline run may re-surface it.
- A confirmation tooltip shows: *"Dismiss this gap? It may reappear if the issue is not resolved."*

**Risk Item — add manually:**
- A `+ Add Risk` ghost button appears at the bottom of the Risk Summary block.
- Clicking it opens a compact inline form: **Description** (textarea) + **Severity** (dropdown) + **Mitigation** (single-line, optional).
- Manually added risks render identically to AI-flagged risks — no visual distinction.

**Risk Item — delete:**
- Each risk row shows a `[✕]` ghost icon on hover.
- Click confirms deletion. No multi-step confirmation for individual risk items.

---

### 10.9 Delete Phase or Task — Confirmation

Destructive actions (deleting a phase or task) require a single inline confirmation to prevent accidents.

**Delete task:**

```
  02  Deploy staging environment                   [✕ Delete]
      Owner: @ryu  ·  Due: Jun 15  ·  ● High
```

On `[✕ Delete]` hover — button turns `--color-error`. On click:

```
  Delete "Deploy staging environment"?
  [Cancel]  [Delete →]
```

Inline under the task row — no modal. `[Delete →]` uses `.btn-primary` with `background: var(--color-error)`.

**Delete phase:**

Phase header shows a `[⋯]` overflow menu on hover:

```
  Phase 1 — Foundation    [Day 1–2]    [⋯]
                                        │
                                        ├─ Rename
                                        ├─ Edit Goal
                                        ├─ Edit Timeframe
                                        └─ Delete Phase
```

`Delete Phase` opens a modal (not inline) because deleting a phase deletes all its tasks — a high-impact action:

```
┌────────────────────────────────────────────────────────┐
│  DELETE PHASE                                 [✕]      │
│                                                        │
│  "Phase 1 — Foundation" contains 3 tasks.              │
│  Deleting this phase will permanently remove all       │
│  tasks within it. This cannot be undone.               │
│                                                        │
│  [Cancel]                      [Delete Phase →]        │
└────────────────────────────────────────────────────────┘
```

`[Delete Phase →]` uses `.btn-primary` with `background: var(--color-error)`.

---

### 10.10 Authorship Attribution

To maintain transparency, manually authored content is attributed in the plan's audit trail (not visible in the main plan view, but queryable):

| Event | Stored as |
|---|---|
| Manual phase added | `authored_by: userId`, `source: 'manual'` |
| Manual task added | `authored_by: userId`, `source: 'manual'` |
| Field edited | `edited_by: userId`, `edited_at: datetime`, `previous_value: string` |
| File attached | `uploaded_by: userId` |
| AI task accepted | `approved_by: userId`, `source: 'ai'` |

This audit trail supports future features like "Show changes by @jan" or plan diff history.

---

### 10.11 Summary — AI vs. Manual Content at a Glance

| | AI-generated content | Manually authored content |
|---|---|---|
| **How it enters the plan** | Via Planner agent proposal → approver accept | Direct user action — no intermediary |
| **Requires approval?** | Yes — approver must accept each change | No — user action = approval |
| **Visual badge** | `[NEW]` / `[UPDATED]` / `[REMOVED]` | No badge — plain content |
| **Left border accent** | Cyan (new/updated) or amber (gap) | None |
| **Affects the Review Panel?** | Yes — appears as a change card | No — never appears in the diff queue |
| **AI pipeline respects it?** | N/A | Yes — treated as confirmed plan content |
| **Can be edited later?** | Yes — by anyone with authoring permissions | Yes — same |
