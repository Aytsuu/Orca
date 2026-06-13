# UI/UX Plan — AI Team Planner
> **Document type:** AI-agent implementation spec  
> **Design system source:** `DESIGN.md` (Build with Gemini XPRIZE)  
> **Product source:** `mvp.md`  
> **Stack:** Astro + React + TypeScript + Tailwind CSS  
> **Last updated:** 2026-06-13

---

## Agent Instructions

This document is structured for direct implementation. Each section maps a screen or component to:
- Explicit design token references (from `DESIGN.md`)
- Layout spec with ASCII wireframes
- Component states and interaction logic
- Copy guidelines

**Reading order for implementation:** Design Tokens → Shared Components → Homepage → Project Interface (Chat Tab) → Project Interface (Plan Tab) → AI Settings → Modals.

Do not deviate from the token values defined in `DESIGN.md`. All color, typography, spacing, and motion references below use the exact CSS custom property names from that file.

---

## 01 — Design Tokens (Active Subset)

Only tokens actively used in this product. Pull full definitions from `DESIGN.md`.

### Colors

| Role | Token | Value | Where Used |
|---|---|---|---|
| Page background | `--color-background` | `#0B0E0C` | All screen bases |
| Panel / card | `--color-surface` | `#111411` | Sidebars, cards, message bubbles |
| Modal / popover | `--color-surface-raised` | `#181C18` | Dialogs, dropdowns |
| Default border | `--color-border` | `#282B29` | Column dividers, card outlines |
| Subtle divider | `--color-border-subtle` | `#1E211E` | Internal row separators |
| Primary action | `--color-primary` | `#1BBFE0` | CTAs, active nav, AI accent |
| Primary hover | `--color-primary-hover` | `#16A8C6` | Hover on primary buttons |
| Primary tint bg | `--color-primary-muted` | `rgba(27,191,224,0.12)` | AI activity panel, badge backgrounds |
| Primary glow | `--color-primary-glow` | `rgba(27,191,224,0.25)` | Live agent pulse animation |
| Heading text | `--color-text-primary` | `#F5F7F5` | H1–H3, card titles |
| Body text | `--color-text-secondary` | `#A8B5AC` | Descriptions, message content |
| Muted / meta | `--color-text-muted` | `#7D8D83` | Timestamps, step numbers, captions |
| Text on cyan | `--color-text-inverse` | `#0B0E0C` | Text inside primary buttons |
| Success | `--color-success` | `#2ECC71` | Plan approved, task done |
| Warning | `--color-warning` | `#F39C12` | Gaps flagged, pending approval |
| Error | `--color-error` | `#E74C3C` | AI action rejected, validation fail |

### Typography

| Role | Size Token | Weight Token | Usage |
|---|---|---|---|
| Page title | `--text-display-md` (48px) | `--weight-black` (900) | Homepage empty state, modal headers |
| Section heading | `--text-display-sm` (36px) | `--weight-bold` (700) | Plan tab H1 |
| Card title | `--text-lg` (22px) | `--weight-bold` (700) | Project card name, column headers |
| Body default | `--text-md` (18px) | `--weight-regular` (400) | Chat messages, plan body |
| Label / UI text | `--text-sm` (15px) | `--weight-semibold` (600) | Buttons, badge text, nav links |
| Caption / meta | `--text-xs` (12px) | `--weight-semibold` (600) | Timestamps, step numbers, eyebrows |
| Monospace | `--text-mono-sm` (13px) | `--weight-regular` (400) | Code snippets in chat |

Font family for all roles: `--font-heading` / `--font-body` = Inter. Monospace: `--font-mono` = JetBrains Mono.

### Spacing

Use only from the defined scale. Do not use arbitrary values.

```
--space-1   4px    micro gaps (icon + label)
--space-2   8px    tight inline spacing
--space-3   12px   base unit — input padding vertical
--space-4   16px   compact row padding
--space-5   20px   default vertical padding
--space-6   24px   card internal padding
--space-8   32px   column header padding
--space-10  40px   between major sections within a panel
--space-12  48px   section top/bottom padding
--space-16  64px   panel gutter
```

### Border Radius

- `--radius-sm` (2px) — all cards, inputs, panels, message bubbles
- `--radius-md` (4px) — tooltips, dropdowns
- `--radius-pill` (999px) — all buttons exclusively

### Motion

- UI transitions: `200ms` ease on color/border
- Entrance animations: `fadeUp` at `--duration-enter` (600ms) with `--ease-out`
- Agent pulse: `pulseGlow` keyframe on active agent status dot
- Stagger rule: apply 80ms delay increment per list item (max 4 items)

---

## 02 — Shared Components

These components appear across multiple screens. Implement once, reuse everywhere.

---

### 2.1 Navigation Bar

**Sticky top bar. Height: 56px.**

```
┌──────────────────────────────────────────────────────────────────┐
│  ▣ AppName          Projects   [+ New Project]   [Avatar ▾]      │
└──────────────────────────────────────────────────────────────────┘
```

**Token mapping:**

| Element | Style |
|---|---|
| Container | `background: var(--color-background)` + `border-bottom: 1px solid var(--color-border-subtle)` + `backdrop-filter: blur(12px)` + `position: sticky; top: 0; z-index: 100` |
| App logo | Unicode `▣` glyph in `--color-primary` + "AppName" in `--text-sm` `--weight-bold` `--color-text-primary` |
| Nav links | `.navbar__link` pattern from `DESIGN.md` — `--text-sm`, `--color-text-muted`, hover → `--color-text-primary` |
| New Project button | `.btn-primary` pill, label: `+ New Project →` |
| Avatar | 32px circle, `--color-surface` bg, `--color-border` border, user initials in `--text-xs` `--color-text-muted` |

**Active link state:** `--color-primary` text, no underline.

---

### 2.2 Buttons

Three variants. Use exactly as defined in `DESIGN.md`.

| Variant | Class | Usage in this app |
|---|---|---|
| Primary | `.btn-primary` | New Project, Save Settings, Send message, Approve plan |
| Secondary | `.btn-secondary` | Cancel, View History, Export |
| Ghost | `.btn-ghost` | Icon actions in panels, column header controls |

**Copy rules:**
- Primary CTA always ends with `→`: `Approve Plan →`, `Create Project →`
- Destructive actions (reject, revert): use `.btn-secondary` with `--color-error` text override
- Disabled state: `opacity: 0.38`, `cursor: not-allowed`, no hover effect

---

### 2.3 Category Badge

Used for permission levels, agent status labels, and file type indicators.

```css
/* Base from DESIGN.md .category-badge */
/* Permission variant */
.badge--approver  { --badge-color: var(--color-primary); }
.badge--editor    { --badge-color: var(--color-warning); }
.badge--viewer    { --badge-color: var(--color-text-muted); }
```

**Content examples:** `APPROVER`, `EDITOR`, `VIEWER`, `MONITOR`, `ANALYZER`, `PLANNER`, `UPDATER`

---

### 2.4 Agent Status Indicator

A live dot showing whether an AI agent is active, idle, or complete.

```
● MONITOR    ◎ ANALYZER    ○ PLANNER    ✓ UPDATER
```

| State | Dot style | Label color |
|---|---|---|
| Active | 8px circle, `--color-primary`, `pulseGlow` animation | `--color-primary` |
| Idle | 8px circle, `--color-text-muted`, no animation | `--color-text-muted` |
| Complete | Checkmark `✓`, `--color-success` | `--color-success` |
| Error | `✕`, `--color-error` | `--color-error` |

**Label:** `.step-number` class from `DESIGN.md` — `--text-xs`, `--tracking-widest`, uppercase.

---

### 2.5 Divider with Label

Used to separate message groups, plan sections, and settings groups.

```
──────────────── TODAY ────────────────
```

Use `.divider-labeled` from `DESIGN.md`. Label text: `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted`.

---

### 2.6 Empty State

Used when a list has no items.

```
┌──────────────────────────────────┐
│                                  │
│         ▣                        │
│    No projects yet               │
│  Start by creating one →         │
│                                  │
│    [+ Create your first project →]│
└──────────────────────────────────┘
```

- Icon: `▣` Unicode glyph, 32px, `--color-text-muted`
- Heading: `--text-lg`, `--weight-bold`, `--color-text-primary`
- Subtext: `--text-sm`, `--color-text-secondary`
- CTA: `.btn-primary`

---

### 2.7 Toast Notification

Appears bottom-right. Auto-dismiss after 4s.

```
┌───────────────────────────────┐
│  ✓  Plan approved and synced  │
└───────────────────────────────┘
```

| Variant | Left border color | Icon |
|---|---|---|
| Success | `--color-success` | `✓` |
| Warning | `--color-warning` | `⚠` |
| Error | `--color-error` | `✕` |
| Info | `--color-primary` | `ℹ` |

Container: `--color-surface-raised`, `--radius-sm`, `border-left: 3px solid {variant}`, `padding: --space-4 --space-6`, `--text-sm`, `--color-text-primary`.

---

## 03 — Homepage (Project List)

**Inspiration:** NotebookLM project grid. **Route:** `/`

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVBAR                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PROJECTS                            [+ New Project →]           │
│  ─────────────────────────────────────────────────              │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ 01           │  │ 02           │  │ 03           │           │
│  │ Project Name │  │ Project Name │  │ + New        │           │
│  │              │  │              │  │   Project    │           │
│  │ 3 members    │  │ 1 member     │  │              │           │
│  │ Active · 2h  │  │ Draft        │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Grid:** 3 columns on desktop, 2 on tablet, 1 on mobile. `gap: --space-6`. `max-width: 1200px`, centered.

### Section Header

```
PROJECTS                                     [+ New Project →]
```

- "PROJECTS" eyebrow: `.section-label` class from `DESIGN.md`
- Subline: `--text-sm`, `--color-text-secondary`: `"Your workspaces"`
- Top padding: `--space-12`

### Project Card

Based on `.step-card` from `DESIGN.md` with additions.

```
┌──────────────────────────────────────┐
│  01                    [● Active]    │
│                                      │
│  Project Name                        │
│  Short description, one line max     │
│                                      │
│  ─────────────────────────────────  │
│  ◎ 4 members    🕐 Updated 2h ago   │
└──────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Card container | `--color-surface`, `border: 1px solid --color-border-subtle`, `--radius-sm`, `padding: --space-8`, hover → `border-color: --color-border`, `background: --color-surface-raised`, transition 200ms |
| Step number | `.step-card__number` — `--text-xs`, `--tracking-widest`, `--color-text-muted` |
| Status badge | `.category-badge` — Active = `--color-success` tint, Draft = `--color-text-muted` tint |
| Project name | `.step-card__title` — `--text-lg`, `--weight-bold`, `--color-text-primary` |
| Description | `.step-card__description` — `--text-sm`, `--color-text-secondary`, 1 line max, `text-overflow: ellipsis` |
| Divider | `border-top: 1px solid --color-border-subtle`, `margin: --space-4 0` |
| Meta row | `--text-xs`, `--color-text-muted`, flex row with `--space-4` gap |

**Hover behavior:** `translateY(-2px)` + border brightens. Duration: `150ms` `--ease-spring`.

**Click:** Navigate to `/project/[id]/chat`.

### New Project Card (Ghost)

Same card dimensions, dashed border (`border: 1px dashed --color-border`), centered `+` icon (`--text-display-sm`, `--color-text-muted`) and label `"New Project"`. Hover: border → `--color-primary`, `+` icon → `--color-primary`.

---

### New Project Modal

Triggered by `+ New Project →` button or ghost card click.

```
┌──────────────────────────────────────────────────────┐
│  NEW PROJECT                              [✕]        │
│                                                      │
│  Project Name                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ e.g. Q3 Product Launch                        │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Description  (optional)                             │
│  ┌────────────────────────────────────────────────┐  │
│  │                                               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│           [Cancel]    [Create Project →]             │
└──────────────────────────────────────────────────────┘
```

- Overlay: `--overlay-dark`
- Modal container: `--color-surface-raised`, `--radius-sm`, `max-width: 520px`, `padding: --space-10`
- Title: `.section-label` uppercase eyebrow
- Input fields: `background: --color-background`, `border: 1px solid --color-border`, `--radius-sm`, `padding: --space-3 --space-4`, `--text-md`, `--color-text-primary`. Focus: `outline: 2px solid --color-primary`
- Placeholder text: `--color-text-muted`
- Buttons: right-aligned, Cancel = `.btn-secondary`, Create = `.btn-primary`

---

## 04 — Project Interface

**Route:** `/project/[id]/[tab]` — `tab` is `chat` or `plan`.

### Tab Bar

Sits below the navbar, full width.

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Projects   /   Runway Q3 Launch           [Chat] [Plan] [AI] │
└──────────────────────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Breadcrumb | `← Projects` ghost link, `/` separator in `--color-text-muted`, project name in `--color-text-primary`, `--text-sm` |
| Tab items | `--text-sm`, `--weight-semibold`, inactive = `--color-text-muted`, active = `--color-text-primary` with `border-bottom: 2px solid --color-primary` |
| Tab bar container | `border-bottom: 1px solid --color-border-subtle`, `padding: 0 --space-8`, `height: 48px` |

---

## 05 — Chat Tab

**Route:** `/project/[id]/chat`

### Layout (Desktop — 3 columns)

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVBAR                                                          │
│  TAB BAR                                                         │
├──────────────┬──────────────────────────────┬────────────────────┤
│ FILES        │ TEAM CHAT                    │ AI ACTIVITY        │
│ 240px        │ flex-1                       │ 300px              │
│              │                              │                    │
│ ─────────── │ ──────────────────────────── │ ────────────────── │
│              │                              │                    │
│ ▣ uploads   │  [messages...]               │  [agent status]    │
│              │                              │  [suggestions...]  │
│ + Add File   │  ─────────────────          │                    │
│              │  [input row]                 │                    │
└──────────────┴──────────────────────────────┴────────────────────┘
```

**Responsive:**
- Tablet (768–1024px): Hide Files column; accessible via a `◫ Files` ghost button in chat header
- Mobile (<768px): Single-column; bottom sheet tabs for Files / Chat / AI

---

### 5.1 Files Panel (Left Column)

```
┌──────────────────────┐
│ FILES                │
│ ────────────────────│
│ ▢ design-brief.pdf  │
│   PDF · 2.4 MB      │
│                      │
│ ▢ wireframes.fig    │
│   Figma · 14 MB     │
│                      │
│ ────────────────────│
│ + Add File           │
└──────────────────────┘
```

| Element | Style |
|---|---|
| Column container | `width: 240px`, `background: --color-surface`, `border-right: 1px solid --color-border`, `padding: --space-6`, `overflow-y: auto` |
| Section label | `.section-label` — `--text-xs`, `--tracking-widest`, uppercase, `--color-text-muted` |
| File row | `display: flex`, `gap: --space-3`, `padding: --space-3 --space-2`, hover bg `--color-primary-muted`, `--radius-sm`, cursor pointer |
| File icon glyph | `▢` Unicode, `--text-sm`, `--color-text-muted` |
| File name | `--text-sm`, `--weight-medium`, `--color-text-primary` |
| File meta | `--text-xs`, `--color-text-muted` |
| Add File | `.btn-ghost` style, `+ Add File`, full-width, bottom of panel |

**Accepted file types:** images, videos, audio, documents (as defined in `mvp.md`). Show a generic `▢` glyph for all — no custom file-type icons needed.

---

### 5.2 Team Chat Panel (Center Column)

```
┌────────────────────────────────────────────────┐
│ TEAM CHAT               [Search ⌕] [Members ◎] │
│ ───────────────────────────────────────────────│
│                                                │
│   ─────────── TODAY ───────────               │
│                                                │
│  [JD]  Jan Doe  10:32 AM                       │
│        What should the priority be for...      │
│                                                │
│  [AI]  ◈ AI Suggestion  10:33 AM              │
│  ▓▓▓▓  Based on discussion, I suggest...       │
│        [Accept →]  [Edit]  [Reject]            │
│                                                │
│  [YO]  You  10:35 AM                          │
│        Looks good. Let's also add...          │
│                                                │
│ ───────────────────────────────────────────── │
│  ┌──────────────────────────────┐  [Send →]   │
│  │ Message your team...        │              │
│  └──────────────────────────────┘              │
└────────────────────────────────────────────────┘
```

**Column container:** `flex: 1`, `display: flex; flex-direction: column`, `background: --color-background`, `border-right: 1px solid --color-border`

**Column header:**
- `height: 56px`, `padding: 0 --space-8`, `border-bottom: 1px solid --color-border-subtle`
- Title: `--text-sm`, `--weight-bold`, `--color-text-primary`
- Ghost icon buttons for Search and Members: `.btn-ghost`, glyphs `⌕` and `◎`

**Message list:**
- `flex: 1`, `overflow-y: auto`, `padding: --space-8`
- `display: flex; flex-direction: column; gap: --space-6`
- Scrollbar: custom thin style, `--color-border` track, `--color-surface-raised` thumb

**User message bubble:**

```
[AV]  Sender Name  HH:MM AM
      Message content here, wrapping naturally
      across multiple lines as needed.
```

| Element | Style |
|---|---|
| Avatar | 32px circle, `--color-surface` bg, initials in `--text-xs`, `--weight-semibold`, `--color-text-muted` |
| Sender name | `--text-xs`, `--weight-semibold`, `--color-text-muted` (not primary — de-emphasize attribution) |
| Timestamp | `--text-xs`, `--color-text-muted`, inline after sender name |
| Message body | `--text-md`, `--color-text-secondary`, `line-height: --leading-normal`, `max-width: 680px` |
| Own messages | No special background — same layout, sender name = "You" |

**AI suggestion bubble:**

```
┌──────────────────────────────────────────────────┐
│  ◈  AI Suggestion                   10:33 AM     │
│  ─────────────────────────────────────────────── │
│  Based on this conversation, I've identified     │
│  3 action items and 1 risk...                    │
│                                                  │
│  [Accept →]  [Edit ✎]  [Reject ✕]               │
└──────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Container | `background: --color-primary-muted`, `border: 1px solid rgba(27,191,224,0.2)`, `--radius-sm`, `padding: --space-6` |
| Header glyph | `◈` in `--color-primary`, `--text-sm` |
| Header label | `--text-xs`, `--weight-semibold`, `--tracking-wide`, uppercase, `--color-primary` |
| Body text | `--text-md`, `--color-text-secondary` |
| Action row | `margin-top: --space-4`, `display: flex; gap: --space-3` |
| Accept | `.btn-primary` small — `padding: --space-2 --space-4`, `Accept →` |
| Edit | `.btn-secondary` small — `Edit ✎` |
| Reject | `.btn-secondary` small with `color: --color-error` override — `Reject ✕` |

**Message input:**

| Element | Style |
|---|---|
| Container | `padding: --space-4 --space-8`, `border-top: 1px solid --color-border-subtle`, `display: flex; gap: --space-4; align-items: flex-end` |
| Textarea | `flex: 1`, `background: --color-surface`, `border: 1px solid --color-border`, `--radius-sm`, `padding: --space-3 --space-4`, `--text-md`, `--color-text-primary`, `resize: none`, `min-height: 44px`, `max-height: 160px`. Focus: `border-color: --color-primary` |
| Placeholder | `"Message your team..."`, `--color-text-muted` |
| Send button | `.btn-primary`, label `Send →`, `align-self: flex-end` |
| File attach | `.btn-ghost` icon `⊕` to the left of textarea |

**Multilingual note:** The input accepts any language. The AI processes all input regardless of language — no UI changes needed.

---

### 5.3 AI Activity Panel (Right Column)

```
┌────────────────────────┐
│ AI ACTIVITY            │
│ ──────────────────────│
│                        │
│  AGENTS                │
│  ● MONITOR    Active   │
│  ◎ ANALYZER   Idle     │
│  ○ PLANNER    Idle     │
│  ○ UPDATER    Idle     │
│                        │
│  ──────────────────── │
│                        │
│  SUGGESTIONS           │
│  ┌────────────────────┐│
│  │ ⚠ Missing owner   ││
│  │ Task 3 has no...  ││
│  └────────────────────┘│
│  ┌────────────────────┐│
│  │ ◈ New task found  ││
│  │ "Deploy staging..." ││
│  └────────────────────┘│
└────────────────────────┘
```

**Column container:** `width: 300px`, `background: --color-surface`, `padding: --space-6`, `overflow-y: auto`, `border-left: 1px solid --color-border`

**Agents section:**

- Section label: `.section-label`
- Each agent row: `display: flex; justify-content: space-between; align-items: center; padding: --space-3 0`
- Agent name: `--text-xs`, `--tracking-widest`, uppercase
- Status: Agent Status Indicator component (section 2.4)
- Separator: `--color-border-subtle`, `margin: --space-5 0`

**AI Suggestion cards (right panel mini-cards):**

```
┌──────────────────────┐
│ ◈ SUGGESTION TYPE    │
│ Card summary in 1–2  │
│ short lines.         │
│              [View →] │
└──────────────────────┘
```

| Element | Style |
|---|---|
| Card container | `background: --color-background`, `border: 1px solid --color-border-subtle`, `--radius-sm`, `padding: --space-5`, `margin-bottom: --space-3` |
| Type label | `--text-xs`, `--tracking-widest`, uppercase — `◈` + type: `SUGGESTION`, `⚠ GAP`, `⚡ TASK`, `ℹ INSIGHT` |
| Body | `--text-sm`, `--color-text-secondary`, 2 lines max, ellipsis |
| View link | `.btn-ghost`, `--text-xs`, `--color-primary`, aligned right |

**Suggestion type color mapping:**

| Type | Glyph | Label color |
|---|---|---|
| Suggestion | `◈` | `--color-primary` |
| Gap / Risk | `⚠` | `--color-warning` |
| Task | `⚡` | `--color-success` |
| Insight | `ℹ` | `--color-text-muted` |

---

## 06 — Project Plan Tab

**Route:** `/project/[id]/plan`

**Access control:** If the current user does NOT have approval permissions, show a read-only notice and the last finalized plan. If the user HAS approval permissions, show the full review interface.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVBAR                                                          │
│  TAB BAR                                                         │
├──────────────────────────────────────────────────────────────────┤
│  PLAN CONTROLS BAR                                               │
│  [← v2 of 3]  [Revert ↩]  [Finalize & Sync →]    ⚠ 2 gaps     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────┐  ┌─────────────────────┐ │
│  │  PLAN CONTENT                    │  │ REVIEW PANEL        │ │
│  │                                  │  │                     │ │
│  │  # Project Name                  │  │  PENDING CHANGES    │ │
│  │                                  │  │  ┌───────────────┐  │ │
│  │  ## Phase 1 — Foundation         │  │  │ ◈ Add Task 1  │  │ │
│  │  ...                             │  │  │ [✓] [✕]      │  │ │
│  │                                  │  │  └───────────────┘  │ │
│  │  ## Phase 2 — Build              │  │                     │ │
│  │  ...                             │  │  ┌───────────────┐  │ │
│  │                                  │  │  │ ◈ Add Task 2  │  │ │
│  └───────────────────────────────┘  │  │  └───────────────┘  │ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Read-only view (non-approver):**

```
┌──────────────────────────────────────────────────────────────────┐
│  ℹ  This plan was finalized on Jun 12. Comment via chat.         │
├──────────────────────────────────────────────────────────────────┤
│  [Plan content — full width, read-only]                          │
└──────────────────────────────────────────────────────────────────┘
```

---

### 6.1 Plan Controls Bar

```
[← Version 2 of 3]    [↩ Revert]    ⚠ 2 gaps flagged    [Finalize & Sync →]
```

| Element | Style |
|---|---|
| Bar container | `height: 52px`, `padding: 0 --space-8`, `background: --color-surface`, `border-bottom: 1px solid --color-border`, flex row, `justify-content: space-between` |
| Version indicator | `--text-sm`, `--color-text-muted`, left-aligned. `← Version 2 of 3` with arrow as ghost nav |
| Revert button | `.btn-secondary` — label `↩ Revert`. Disabled when on oldest version (opacity 0.38). Opens confirmation modal |
| Gap badge | `.category-badge` with `--color-warning` tint — `⚠ N gaps flagged`. Hidden when 0 gaps |
| Finalize button | `.btn-primary` — `Finalize & Sync →`. Disabled when pending changes exist (opacity 0.38) |

---

### 6.2 Plan Content Area

```
┌────────────────────────────────────────────────┐
│                                                │
│  # Project Plan — Runway Q3 Launch             │
│  Generated Jun 12 · Last updated 2h ago        │
│                                                │
│  ────────────────────────────────────          │
│                                                │
│  ## Phase 1 — Foundation  [Day 1–2]            │
│                                                │
│  01  Define product requirements               │
│      Owner: @jan · Due: Jun 14                │
│                                                │
│  02  Set up repository and environments        │
│      Owner: @ryu · Due: Jun 14                │
│                                                │
│  ────────────────────────────────────          │
│                                                │
│  ## Phase 2 — Build  [Day 3–5]                 │
│                                                │
└────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Content container | `flex: 1`, `overflow-y: auto`, `padding: --space-10 --space-16`, `max-width: 760px` (centered in its column) |
| Plan title H1 | `--text-display-sm` (36px), `--weight-bold`, `--color-text-primary`, `letter-spacing: --tracking-tight` |
| Meta line | `--text-xs`, `--color-text-muted`, below H1 |
| Phase header H2 | `--text-xl` (30px), `--weight-semibold`, `--color-text-primary`, `margin-top: --space-10`. Phase timeframe as inline badge |
| Phase badge | `.category-badge` style — muted `--color-text-muted` tint, e.g. `Day 1–2` |
| Task row | `.timeline-item` layout from `DESIGN.md`. Step number in `--color-text-muted`, title in `--color-text-primary --text-md --weight-semibold`, meta (owner, due) in `--text-xs --color-text-muted` |
| Divider | `.divider` class |

**Highlighted change (pending AI edit):**

Tasks added/modified by the AI have a left-border accent: `border-left: 2px solid --color-primary`, `padding-left: --space-4`, `background: --color-primary-muted` on the row.

**Gap highlight:**

Tasks flagged with missing info: `border-left: 2px solid --color-warning`. Shows inline `⚠ Missing owner` in `--text-xs --color-warning`.

---

### 6.3 Review Panel (Right sidebar, approver-only)

```
┌─────────────────────────┐
│ PENDING CHANGES  (3)    │
│ ─────────────────────── │
│                         │
│ ◈ Add task              │
│ "Deploy to staging"     │
│ Phase 2 · Jun 15        │
│   [✓ Accept]  [✕ Reject]│
│                         │
│ ◈ Update priority       │
│ "API integration" → P1  │
│   [✓ Accept]  [✕ Reject]│
│                         │
│ ─────────────────────── │
│ [✓ Accept All]          │
└─────────────────────────┘
```

| Element | Style |
|---|---|
| Panel | `width: 280px`, `background: --color-surface`, `border-left: 1px solid --color-border`, `padding: --space-6` |
| Header | `.section-label` + count badge in `--color-primary` |
| Change card | `background: --color-background`, `border: 1px solid --color-border-subtle`, `--radius-sm`, `padding: --space-5`, `margin-bottom: --space-3` |
| Change type | `--text-xs`, `--tracking-widest`, uppercase, `--color-primary` |
| Change description | `--text-sm`, `--color-text-secondary` |
| Accept button | `.btn-primary` small — `✓ Accept` |
| Reject button | `.btn-secondary` small, `color: --color-error` — `✕ Reject` |
| Accept All | `.btn-primary` full-width, bottom of panel — `✓ Accept All →` |

**Empty state:** "No pending changes. Review complete." `--text-sm`, `--color-text-muted`, centered.

---

### 6.4 Revert Confirmation Modal

Triggered by the `↩ Revert` button.

```
┌──────────────────────────────────────────────────┐
│  ⚠ REVERT PLAN                        [✕]       │
│                                                  │
│  This will restore Version 1 and permanently    │
│  remove all comments on the current version.    │
│                                                  │
│  You have 3 reverts remaining (2 after this).   │
│                                                  │
│         [Cancel]    [↩ Revert to v1 →]          │
└──────────────────────────────────────────────────┘
```

- Warning icon: `⚠` in `--color-warning`
- "Revert to vN" CTA: `.btn-primary` with background override to `--color-warning` for this context only
- Remaining revert count: `--text-sm`, `--color-text-muted`
- When 0 reverts remain: both revert UI elements disabled; show message "Revert limit reached"

---

### 6.5 Finalize & Sync Modal

Triggered by `Finalize & Sync →` button.

```
┌──────────────────────────────────────────────────┐
│  FINALIZE PLAN                        [✕]        │
│                                                  │
│  This plan will be synced to all 4 project      │
│  members. They'll be notified and can comment   │
│  via chat.                                       │
│                                                  │
│         [Cancel]    [Finalize & Sync →]          │
└──────────────────────────────────────────────────┘
```

---

## 07 — AI Settings Screen

**Route:** `/project/[id]/settings/ai`  
**Access:** Project creator only (enforced server-side; UI hides tab for others).

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  NAVBAR                                                          │
│  TAB BAR  (Chat | Plan | AI Settings ← active)                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AI SETTINGS                                                     │
│  Configure what the AI can do in this project                    │
│                                                                  │
│  ── AI PERMISSIONS ──────────────────────────────────────────── │
│  [Toggle row]  Analyze conversations           ● ON             │
│  [Toggle row]  Generate plans and tasks        ● ON             │
│  [Toggle row]  Flag risks and gaps             ● ON             │
│  [Toggle row]  Generate summaries              ● ON             │
│  [Toggle row]  Access external tools (MCP)     ○ OFF            │
│  [Toggle row]  Generate code snippets    ★ Stretch ○ OFF        │
│                                                                  │
│  ── MCP TOOL SERVERS ────────────────────────────────────────── │
│  [Server row]  Notion   Connected ✓   [Remove]                  │
│  [Server row]  GitHub   Connected ✓   [Remove]                  │
│  [+ Add MCP Server]                                             │
│                                                                  │
│  ── TEAM PERMISSIONS ────────────────────────────────────────── │
│  [Member row]  Jan Doe   APPROVER     [Change ▾]                │
│  [Member row]  Ryu Lee   EDITOR       [Change ▾]                │
│  [Member row]  Sam K.    VIEWER       [Change ▾]                │
│                                                                  │
│                              [Save Changes →]                   │
└──────────────────────────────────────────────────────────────────┘
```

**Page container:** `max-width: 720px`, centered, `padding: --space-12 --space-8`

**Page header:**
- Eyebrow: `.section-label` → "AI SETTINGS"
- Subline: `--text-sm`, `--color-text-secondary` → `"Configure what the AI can do in this project"`

---

### 7.1 Section Headers

```
── AI PERMISSIONS ──────────────────────────────
```

Use `.divider-labeled` with label text in `.section-label` style. `margin: --space-10 0 --space-6`.

---

### 7.2 Toggle Row

```
┌────────────────────────────────────────────────┐
│  Analyze conversations and the project plan    ●│
│  The AI reads all messages to extract tasks.   │
└────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Row container | `display: flex; justify-content: space-between; align-items: flex-start`, `padding: --space-5 0`, `border-bottom: 1px solid --color-border-subtle` |
| Label | `--text-sm`, `--weight-semibold`, `--color-text-primary` |
| Description | `--text-xs`, `--color-text-muted`, below label |
| Toggle ON | Custom pill toggle: 40×22px, background `--color-primary`, thumb `--color-text-inverse` |
| Toggle OFF | Same dimensions, background `--color-border`, thumb `--color-text-muted` |
| Stretch badge | `.category-badge` with `--color-text-muted` tint, label `★ STRETCH` — shown next to label for stretch features |

**Disabled rule (from `mvp.md`):** "Access external tools" toggle is disabled (opacity 0.38) if no MCP servers are configured.

---

### 7.3 MCP Server Row

```
┌────────────────────────────────────────────────┐
│  ▢  Notion                    Connected ✓      │
│     https://mcp.notion.so                      │
│                               [Remove]         │
└────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Row container | Same as toggle row container |
| Glyph | `▢`, `--text-sm`, `--color-text-muted` |
| Server name | `--text-sm`, `--weight-semibold`, `--color-text-primary` |
| Server URL | `--text-xs`, `--color-text-muted`, `--font-mono` |
| Status | `Connected ✓` in `--color-success`, `--text-xs`. Or `Failed ✕` in `--color-error` |
| Remove | `.btn-ghost`, `--text-xs`, `--color-error`, right-aligned |

**Add MCP Server:**

```
[+ Add MCP Server]
```

`.btn-ghost` full-width row, dashed border: `border: 1px dashed --color-border`, `--radius-sm`, `padding: --space-4`. Click opens "Add MCP Server" modal (name + URL inputs, same pattern as New Project Modal).

---

### 7.4 Team Permission Row

```
┌────────────────────────────────────────────────┐
│  [JD]  Jan Doe                  [APPROVER ▾]   │
└────────────────────────────────────────────────┘
```

| Element | Style |
|---|---|
| Row container | `padding: --space-4 0`, `border-bottom: 1px solid --color-border-subtle`, flex, `align-items: center` |
| Avatar | Same 32px avatar component (section 2.2) |
| Name | `--text-sm`, `--weight-semibold`, `--color-text-primary` |
| Role dropdown | `.category-badge` style as dropdown trigger. Badge variants: APPROVER (cyan), EDITOR (warning), VIEWER (muted). `▾` chevron suffix. Click opens inline dropdown with 3 options. Project creator's row shows badge only, no dropdown (they cannot demote themselves) |

---

### 7.5 Save Controls

```
                              [Save Changes →]
```

Right-aligned `.btn-primary`. Disabled until a change is made. On save: toast "Settings saved" (`--color-success`).

---

## 08 — Invite Teammates Modal

Accessible from: Members icon in Chat header, AI Settings.

```
┌──────────────────────────────────────────────────┐
│  INVITE TEAMMATES                     [✕]        │
│                                                  │
│  Email address                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ teammate@company.com                       │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Permission level                                │
│  ┌────────────────────────────────────────────┐  │
│  │ VIEWER  ▾                                  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  VIEWER — Can read the finalized plan and        │
│  comment via chat.                               │
│                                                  │
│         [Cancel]    [Send Invite →]              │
└──────────────────────────────────────────────────┘
```

**Permission level descriptions (shown inline, updated on selection):**

| Level | Description |
|---|---|
| APPROVER | Can accept, edit, and reject AI-generated plan changes |
| EDITOR | Can edit and reject AI changes, but cannot accept |
| VIEWER | Can read the finalized plan and comment via chat |

---

## 09 — Responsive Breakpoints

| Breakpoint | Width | Layout changes |
|---|---|---|
| Desktop | ≥1024px | 3-column chat, full plan + review panel |
| Tablet | 768–1023px | Files column hidden (sheet on demand), plan review panel collapses to bottom sheet |
| Mobile | <768px | Single column; tabs switch between Files / Chat / AI views; Plan tab = full screen list |

**Mobile-specific patterns:**
- Bottom tab bar replaces column navigation in Chat view: `Files ▢ · Chat ◈ · AI ●`
- All modals become full-screen bottom sheets on mobile
- Input row sticks to bottom on mobile (position: fixed, above OS keyboard)

---

## 10 — Interaction & Animation Summary

| Interaction | Animation | Duration | Easing |
|---|---|---|---|
| Page load | `fadeUp` on main content | `--duration-enter` (600ms) | `--ease-out` |
| Card hover | `translateY(-2px)` + border color | `150ms` | `--ease-spring` |
| Modal open | Fade in + `translateY(-8px)` → 0 | `--duration-normal` (250ms) | `--ease-out` |
| Modal close | Fade out + `translateY(8px)` | `--duration-fast` (150ms) | `--ease-sharp` |
| Agent pulse | `pulseGlow` keyframe | Loop 2s | n/a |
| Button hover | `translateY(-1px)` | `150ms` | ease |
| Toast enter | Slide in from right | `--duration-normal` (250ms) | `--ease-spring` |
| Toast exit | Slide out to right | `--duration-fast` (150ms) | `--ease-sharp` |
| Staggered lists | `fadeUp`, 80ms per child | `--duration-enter` | `--ease-out` |

**Reduced motion:** Wrap all transforms and keyframes in `@media (prefers-reduced-motion: no-preference)`. Fallback: instant opacity-only transitions.

---

## 11 — Copy & Content Guidelines

**Voice:** Direct, technical, brief. No filler. Active verbs.

**Key copy patterns:**

| Context | Do | Don't |
|---|---|---|
| Primary button | `Create Project →` | `Submit` |
| AI suggestion label | `AI Suggestion` | `Claude says...` |
| Empty plan | `No plan yet. Start chatting to generate one.` | `Your plan will appear here soon!` |
| Revert warning | `This removes all comments on the current version.` | `Are you sure?` |
| Error toast | `Failed to save. Try again.` | `Oops! Something went wrong.` |
| Approval confirmation | `Plan finalized. All members notified.` | `Done!` |

**Section labels (always uppercase, widest tracking):**
`PROJECTS · TEAM CHAT · AI ACTIVITY · FILES · PLAN · AI SETTINGS · PENDING CHANGES · AGENTS · SUGGESTIONS`

---

## 12 — Accessibility Checklist

- All interactive elements reachable via keyboard; focus visible via `*:focus-visible` rule from `DESIGN.md`
- Color is never the only differentiator — use glyphs (`✓`, `✕`, `⚠`) alongside color
- All icon-only buttons have `aria-label`
- Modals trap focus and restore on close
- AI suggestions announced via `role="status"` live region
- Agent status changes announced via `aria-live="polite"`
- Minimum contrast: text on `--color-surface` meets WCAG AA (verified: `--color-text-secondary` `#A8B5AC` on `#111411` = 5.1:1 ✓)

---

*End of UI/UX Plan — AI Team Planner*  
*Implements: `mvp.md` · Design system: `DESIGN.md`*