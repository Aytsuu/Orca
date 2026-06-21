# Plan Content Display Formatting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render dense project-plan and proposal text as safe, readable paragraphs, labeled fields, and bullet lists without changing persisted content or mutation behavior.

**Architecture:** Add a pure parser that converts free-form plan text into a small display model, then add one React renderer for that model. Wire the renderer into existing read-only paths in `PlanView.tsx`; inline editors continue receiving the untouched source strings.

**Tech Stack:** TypeScript 6, React 19, Astro 6, Tailwind CSS 4, Vitest 4

---

## File Structure

- Create `web/src/lib/planText.ts`: deterministic, dependency-free parsing and normalization only.
- Create `web/src/lib/planText.test.ts`: parser behavior, safety, fallback, and immutability tests.
- Create `web/src/components/islands/features/PlanFormattedText.tsx`: semantic React renderer for parser blocks.
- Create `web/src/components/islands/features/PlanFormattedText.test.tsx`: server-rendered component tests proving output hierarchy and HTML escaping.
- Modify `web/src/components/islands/features/PlanView.tsx`: use the formatter in main-plan read-only fields, embedded proposal previews, and Pending Changes cards while preserving editors and mutations.

Do not change API contracts, database schemas, proposal normalization, query hooks, or AI prompts.

### Task 1: Parse Plan Text into a Safe Display Model

**Files:**
- Create: `web/src/lib/planText.ts`
- Test: `web/src/lib/planText.test.ts`

- [ ] **Step 1: Write failing tests for blank input and plain prose**

Create `web/src/lib/planText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parsePlanText } from './planText';

describe('parsePlanText', () => {
  it('returns no blocks for blank input', () => {
    expect(parsePlanText(' \n\t ')).toEqual([]);
  });

  it('keeps ordinary prose as one paragraph', () => {
    expect(parsePlanText('Build a simple product history drawer for administrators.')).toEqual([
      {
        type: 'paragraph',
        text: 'Build a simple product history drawer for administrators.',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run the parser tests and verify the missing-module failure**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: FAIL because `./planText` does not exist.

- [ ] **Step 3: Add the minimal display-model types and paragraph fallback**

Create `web/src/lib/planText.ts`:

```ts
export type PlanTextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'label'; label: string; value: string }
  | { type: 'list'; label?: string; items: string[] };

export function parsePlanText(input: string): PlanTextBlock[] {
  const text = input.trim();
  return text ? [{ type: 'paragraph', text }] : [];
}
```

- [ ] **Step 4: Run the parser tests and verify they pass**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Add failing tests for explicit bullets and recognized labels**

Append inside the existing `describe` block:

```ts
  it('converts explicit bullet lines into one list block', () => {
    expect(parsePlanText('- First requirement\n* Second requirement\n• Third requirement')).toEqual([
      {
        type: 'list',
        items: ['First requirement', 'Second requirement', 'Third requirement'],
      },
    ]);
  });

  it('renders recognized colon labels separately from their values', () => {
    expect(parsePlanText('Goal: Show price history clearly.\nOwner: Admin team')).toEqual([
      { type: 'label', label: 'Goal', value: 'Show price history clearly.' },
      { type: 'label', label: 'Owner', value: 'Admin team' },
    ]);
  });

  it('preserves the order of paragraphs, labels, and lists', () => {
    expect(
      parsePlanText(
        'Build the history view.\nRequirements:\n- Fetch records dynamically\n- Show editor and timestamp\nNotes: Keep the drawer simple.'
      )
    ).toEqual([
      { type: 'paragraph', text: 'Build the history view.' },
      {
        type: 'list',
        label: 'Requirements',
        items: ['Fetch records dynamically', 'Show editor and timestamp'],
      },
      { type: 'label', label: 'Notes', value: 'Keep the drawer simple.' },
    ]);
  });
```

- [ ] **Step 6: Run the parser tests and verify the structural cases fail**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: the three new tests FAIL because all nonblank input is still returned as one paragraph.

- [ ] **Step 7: Implement explicit-line parsing**

Replace `web/src/lib/planText.ts` with:

```ts
export type PlanTextBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'label'; label: string; value: string }
  | { type: 'list'; label?: string; items: string[] };

const RECOGNIZED_LABELS = new Map<string, string>([
  ['acceptance criteria', 'Acceptance Criteria'],
  ['acceptance_criteria', 'Acceptance Criteria'],
  ['description', 'Description'],
  ['done when', 'Done When'],
  ['due', 'Due'],
  ['due date', 'Due Date'],
  ['goal', 'Goal'],
  ['mitigation', 'Mitigation'],
  ['notes', 'Notes'],
  ['objective', 'Objective'],
  ['objectives', 'Objectives'],
  ['owner', 'Owner'],
  ['priority', 'Priority'],
  ['requirements', 'Requirements'],
  ['status', 'Status'],
  ['tasks', 'Tasks'],
  ['technology stack', 'Technology Stack'],
  ['timeframe', 'Timeframe'],
]);

const LIST_LABELS = new Set([
  'Acceptance Criteria',
  'Done When',
  'Objectives',
  'Requirements',
  'Tasks',
  'Technology Stack',
]);

const BULLET_PATTERN = /^\s*(?:[-*•])\s+(.+?)\s*$/u;
const LABEL_PATTERN = /^\s*([A-Za-z][A-Za-z _/-]{1,40}):\s*(.*?)\s*$/;

function normalizeLabel(value: string): string | undefined {
  return RECOGNIZED_LABELS.get(value.trim().toLowerCase());
}

function pushParagraph(blocks: PlanTextBlock[], lines: string[]): void {
  for (const line of lines) {
    const text = line.replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
  }
  lines.length = 0;
}

function pushList(blocks: PlanTextBlock[], items: string[], label?: string): void {
  if (items.length > 0) blocks.push({ type: 'list', label, items: [...items] });
  items.length = 0;
}

export function parsePlanText(input: string): PlanTextBlock[] {
  const text = input.trim();
  if (!text) return [];

  const blocks: PlanTextBlock[] = [];
  const paragraphLines: string[] = [];
  const listItems: string[] = [];
  let pendingListLabel: string | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      pushParagraph(blocks, paragraphLines);
      pushList(blocks, listItems, pendingListLabel);
      pendingListLabel = undefined;
      continue;
    }

    const bulletMatch = line.match(BULLET_PATTERN);
    if (bulletMatch) {
      pushParagraph(blocks, paragraphLines);
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    pushList(blocks, listItems, pendingListLabel);
    pendingListLabel = undefined;

    const labelMatch = line.match(LABEL_PATTERN);
    const label = labelMatch ? normalizeLabel(labelMatch[1]) : undefined;
    if (label && labelMatch) {
      pushParagraph(blocks, paragraphLines);
      const value = labelMatch[2].trim();
      if (!value && LIST_LABELS.has(label)) {
        pendingListLabel = label;
      } else if (value) {
        blocks.push({ type: 'label', label, value });
      }
      continue;
    }

    paragraphLines.push(line);
  }

  pushParagraph(blocks, paragraphLines);
  pushList(blocks, listItems, pendingListLabel);
  return blocks;
}
```

- [ ] **Step 8: Run the parser tests and verify explicit formatting passes**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 9: Add failing tests for dense AI prose, ambiguity, safety, and immutability**

Append inside the existing `describe` block:

```ts
  it('extracts conservative embedded metadata from dense AI prose', () => {
    const input =
      "This phase implements the user interface. The owner is Frontend Team. The status is Planned. " +
      "The notes are 'Coordinate closely with design.' The acceptance_criteria are " +
      "['UI theme is consistent.', 'Mobile responsiveness is implemented.']";

    expect(parsePlanText(input)).toEqual([
      { type: 'paragraph', text: 'This phase implements the user interface.' },
      { type: 'label', label: 'Owner', value: 'Frontend Team' },
      { type: 'label', label: 'Status', value: 'Planned' },
      { type: 'label', label: 'Notes', value: 'Coordinate closely with design.' },
      {
        type: 'list',
        label: 'Acceptance Criteria',
        items: ['UI theme is consistent.', 'Mobile responsiveness is implemented.'],
      },
    ]);
  });

  it('does not split ordinary sentences containing unrecognized labels', () => {
    expect(parsePlanText('The result is clear. The customer is satisfied.')).toEqual([
      { type: 'paragraph', text: 'The result is clear. The customer is satisfied.' },
    ]);
  });

  it('keeps HTML-like input as inert text in the display model', () => {
    expect(parsePlanText('<img src=x onerror=alert(1)>')).toEqual([
      { type: 'paragraph', text: '<img src=x onerror=alert(1)>' },
    ]);
  });

  it('does not mutate the original input', () => {
    const input = 'Goal: Keep the source unchanged.';
    parsePlanText(input);
    expect(input).toBe('Goal: Keep the source unchanged.');
  });
```

- [ ] **Step 10: Run the parser tests and verify only dense metadata extraction fails**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: the dense AI prose test FAILS; ambiguity, inert-text, and immutability tests PASS.

- [ ] **Step 11: Implement conservative embedded metadata extraction**

Add these helpers above `parsePlanText`:

```ts
const EMBEDDED_FIELD_PATTERN =
  /(?:^|(?<=\.\s))The\s+(owner|status|priority|timeframe|due date|notes|acceptance_criteria|acceptance criteria|tasks)\s+(?:is|are)\s+/gi;

function stripWrappingPunctuation(value: string): string {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(['"])([\s\S]*?)\1\.?$/);
  if (quoted) return quoted[2].trim();
  return trimmed.replace(/\.$/, '').trim();
}

function parseSerializedItems(value: string): string[] {
  const matches = [...value.matchAll(/['"]([^'"]+)['"]/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return matches.length > 0 ? matches : [];
}

function parseDenseLine(line: string): PlanTextBlock[] | null {
  const markers = [...line.matchAll(EMBEDDED_FIELD_PATTERN)];
  if (markers.length === 0) return null;

  const blocks: PlanTextBlock[] = [];
  const firstIndex = markers[0].index ?? 0;
  const intro = line.slice(0, firstIndex).trim();
  if (intro) blocks.push({ type: 'paragraph', text: intro });

  markers.forEach((marker, index) => {
    const rawLabel = marker[1];
    const label = normalizeLabel(rawLabel);
    if (!label || marker.index === undefined) return;

    const valueStart = marker.index + marker[0].length;
    const valueEnd = markers[index + 1]?.index ?? line.length;
    const rawValue = line.slice(valueStart, valueEnd).trim();
    const listItems = LIST_LABELS.has(label) ? parseSerializedItems(rawValue) : [];

    if (listItems.length > 0) {
      blocks.push({ type: 'list', label, items: listItems });
      return;
    }

    const value = stripWrappingPunctuation(rawValue);
    if (value) blocks.push({ type: 'label', label, value });
  });

  return blocks.length > 0 ? blocks : null;
}
```

Then, inside the line loop in `parsePlanText`, immediately before `paragraphLines.push(line)`, add:

```ts
    const denseBlocks = parseDenseLine(line);
    if (denseBlocks) {
      pushParagraph(blocks, paragraphLines);
      blocks.push(...denseBlocks);
      continue;
    }
```

- [ ] **Step 12: Run the complete parser test file**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 13: Commit the parser**

Run:

```powershell
git add web/src/lib/planText.ts web/src/lib/planText.test.ts
git commit -m "feat(web): parse plan text for readable display"
```

Expected: one commit containing only the parser and its tests.

### Task 2: Render Parsed Blocks Semantically and Safely

**Files:**
- Create: `web/src/components/islands/features/PlanFormattedText.tsx`
- Test: `web/src/components/islands/features/PlanFormattedText.test.tsx`

- [ ] **Step 1: Write failing server-rendered component tests**

Create `web/src/components/islands/features/PlanFormattedText.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PlanFormattedText } from './PlanFormattedText';

describe('PlanFormattedText', () => {
  it('renders labels and bullets with semantic elements', () => {
    const html = renderToStaticMarkup(
      <PlanFormattedText text={'Goal: Make changes readable.\nRequirements:\n- Keep source text\n- Escape HTML'} />
    );

    expect(html).toContain('<dl');
    expect(html).toContain('<dt');
    expect(html).toContain('Goal');
    expect(html).toContain('<ul');
    expect(html).toContain('<li');
    expect(html).toContain('Keep source text');
  });

  it('escapes HTML-like user text', () => {
    const html = renderToStaticMarkup(
      <PlanFormattedText text={'<img src=x onerror=alert(1)>'} />
    );

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('renders nothing for blank input', () => {
    expect(renderToStaticMarkup(<PlanFormattedText text="   " />)).toBe('');
  });

  it('supports compact typography for review cards', () => {
    const html = renderToStaticMarkup(
      <PlanFormattedText text="A short review detail." compact className="review-copy" />
    );

    expect(html).toContain('review-copy');
    expect(html).toContain('text-[11px]');
  });
});
```

- [ ] **Step 2: Run the renderer tests and verify the missing-component failure**

Run:

```powershell
Set-Location web
npm test -- src/components/islands/features/PlanFormattedText.test.tsx
```

Expected: FAIL because `./PlanFormattedText` does not exist.

- [ ] **Step 3: Implement the semantic renderer**

Create `web/src/components/islands/features/PlanFormattedText.tsx`:

```tsx
import React from 'react';

import { parsePlanText } from '../../../lib/planText';

interface PlanFormattedTextProps {
  text: string;
  compact?: boolean;
  className?: string;
}

export const PlanFormattedText: React.FC<PlanFormattedTextProps> = ({
  text,
  compact = false,
  className = '',
}) => {
  const blocks = parsePlanText(text);
  if (blocks.length === 0) return null;

  const bodyClass = compact
    ? 'text-[11px] leading-relaxed text-text-muted'
    : 'text-sm leading-relaxed text-text-secondary';
  const labelClass = compact
    ? 'text-[9px] font-bold uppercase tracking-widest text-text-muted'
    : 'text-[10px] font-bold uppercase tracking-widest text-text-muted';

  return (
    <div className={`flex min-w-0 flex-col gap-2 ${bodyClass} ${className}`.trim()}>
      {blocks.map((block, index) => {
        if (block.type === 'paragraph') {
          return <p key={`paragraph-${index}`} className="whitespace-normal break-words">{block.text}</p>;
        }

        if (block.type === 'label') {
          return (
            <dl key={`label-${index}`} className="grid min-w-0 gap-0.5">
              <dt className={labelClass}>{block.label}</dt>
              <dd className="min-w-0 whitespace-normal break-words text-text-secondary">{block.value}</dd>
            </dl>
          );
        }

        return (
          <div key={`list-${index}`} className="grid min-w-0 gap-1">
            {block.label && <div className={labelClass}>{block.label}</div>}
            <ul className="list-disc space-y-1 pl-4 text-text-secondary">
              {block.items.map((item, itemIndex) => (
                <li key={`${index}-${itemIndex}`} className="break-words pl-0.5">{item}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

export default PlanFormattedText;
```

- [ ] **Step 4: Run the renderer and parser tests**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts src/components/islands/features/PlanFormattedText.test.tsx
```

Expected: 13 tests PASS.

- [ ] **Step 5: Commit the renderer**

Run:

```powershell
git add web/src/components/islands/features/PlanFormattedText.tsx web/src/components/islands/features/PlanFormattedText.test.tsx
git commit -m "feat(web): render structured plan text"
```

Expected: one commit containing only the renderer and its tests.

### Task 3: Integrate Formatting into Editable Main-Plan Fields

**Files:**
- Modify: `web/src/components/islands/features/PlanView.tsx:1-25`
- Modify: `web/src/components/islands/features/PlanView.tsx:647-739`
- Modify: `web/src/components/islands/features/PlanView.tsx:1260-1283`
- Modify: `web/src/components/islands/features/PlanView.tsx:1388-1429`
- Modify: `web/src/components/islands/features/PlanView.tsx:1769-1790`
- Modify: `web/src/components/islands/features/PlanView.tsx:2337-2360`

- [ ] **Step 1: Import the shared renderer**

Add next to the existing local component imports:

```tsx
import { PlanFormattedText } from './PlanFormattedText';
```

- [ ] **Step 2: Extend `renderEditableText` with an optional read-only formatter**

Change the signature:

```tsx
  const renderEditableText = (
    text: string,
    type: string,
    id?: string,
    index?: number,
    field?: string,
    isTextArea = false,
    className = "",
    placeholder?: string,
    displayFormatter?: (value: string) => React.ReactNode
  ) => {
```

Immediately after `isEditing`, add:

```tsx
    const displayValue = text
      ? displayFormatter?.(text) ?? text
      : resolvedPlaceholder;
```

Replace the non-approver body:

```tsx
    if (!isApprover) {
      return (
        <div className={`${className} ${!text ? 'italic text-text-muted text-xs' : ''}`}>
          {displayValue}
        </div>
      );
    }
```

Replace the read-only clickable body inside the final wrapper:

```tsx
        <div className={`min-w-0 flex-1 ${!text ? 'italic text-text-muted text-xs' : ''}`}>
          {displayValue}
        </div>
```

Keep the existing `<textarea>` and `<input>` branches unchanged. This is the key guarantee that editing still uses `editingField.value`, which is the original source string.

- [ ] **Step 3: Format the project description only in display mode**

Update the existing `activePlan.description` call by adding the final argument:

```tsx
                  (value) => <PlanFormattedText text={value} />
```

The complete tail of the call must be:

```tsx
                  true,
                  "text-sm text-text-secondary leading-relaxed",
                  "Summarize the project scope, goals, and constraints...",
                  (value) => <PlanFormattedText text={value} />
                )}
```

- [ ] **Step 4: Format phase goal and description displays**

Update the tail of the `phase.goal` call:

```tsx
                            false,
                            "text-sm text-text-secondary italic",
                            undefined,
                            (value) => <PlanFormattedText text={value} />
                          )}
```

Update the tail of the `phase.description` call:

```tsx
                            true,
                            "text-sm text-text-muted leading-relaxed",
                            undefined,
                            (value) => <PlanFormattedText text={value} />
                          )}
```

Do not add formatters to phase title or timeframe fields.

- [ ] **Step 5: Format expanded task descriptions**

Update the `task.description` call so its final arguments are:

```tsx
                                      true,
                                      "text-sm text-text-secondary leading-relaxed",
                                      "Describe the task, expected output, and any constraints...",
                                      (value) => <PlanFormattedText text={value} />
                                    )}
```

Acceptance criteria remain separate editable rows because they are already structured and independently editable.

- [ ] **Step 6: Format risk description and mitigation displays**

Update the tail of the `risk.description` call:

```tsx
                          true,
                          "text-sm text-text-secondary leading-relaxed",
                          undefined,
                          (value) => <PlanFormattedText text={value} />
                        )}
```

Update the tail of the `risk.mitigation` call:

```tsx
                            false,
                            "italic text-text-secondary text-xs",
                            "Describe how the team should reduce or respond to this risk...",
                            (value) => <PlanFormattedText text={value} compact />
                          )}
```

- [ ] **Step 7: Run focused tests and TypeScript/Astro validation**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts src/components/islands/features/PlanFormattedText.test.tsx
npx astro check
```

Expected: tests PASS and Astro reports no new TypeScript errors.

- [ ] **Step 8: Commit main-plan integration**

Run:

```powershell
git add web/src/components/islands/features/PlanView.tsx
git commit -m "feat(web): format plan details in read-only views"
```

Expected: one commit that wires display formatting without changing editor values or mutation calls.

### Task 4: Format Embedded Proposal Previews and Pending Changes

**Files:**
- Modify: `web/src/components/islands/features/PlanView.tsx:791-887`
- Modify: `web/src/components/islands/features/PlanView.tsx:1038-1214`

- [ ] **Step 1: Format generic proposal-card title, detail, and justification**

In `renderProposalCards`, replace the title body:

```tsx
            <PlanFormattedText
              text={change.title}
              compact
              className="mt-1 font-semibold text-text-primary"
            />
```

Replace the `change.detail` body:

```tsx
            {change.detail && (
              <PlanFormattedText text={change.detail} compact className="mt-1" />
            )}
```

Add justification before the source quote:

```tsx
            {change.justification && (
              <PlanFormattedText
                text={`Notes: ${change.justification}`}
                compact
                className="mt-2 rounded-lg border border-border-subtle bg-background/30 p-2"
              />
            )}
```

Keep source quotes in the existing blockquote-style presentation; quoted evidence should not be heuristically restructured.

- [ ] **Step 2: Use accurate action labels and formatted content in Pending Changes**

Remove the hardcoded `actionPrefix` branching from `renderPendingReviewCard`.

Use the existing section-aware helper:

```tsx
            {getSectionActionLabel(change)}
```

Replace the quoted title block with:

```tsx
        <PlanFormattedText
          text={change.title}
          compact
          className="font-bold text-text-primary"
        />
```

Render detail only when nonblank:

```tsx
        {change.detail && (
          <PlanFormattedText text={change.detail} compact />
        )}
```

Render justification when present:

```tsx
        {change.justification && (
          <PlanFormattedText
            text={`Notes: ${change.justification}`}
            compact
            className="rounded-lg border border-border-subtle bg-surface-raised/30 p-2"
          />
        )}
```

Leave Accept, Reject, View only, source quote, and mutation handlers unchanged.

- [ ] **Step 3: Format normalized task preview descriptions and change details**

In `renderProposedTaskRows`:

```tsx
            {change.detail && (
              <PlanFormattedText text={change.detail} compact className="mt-2" />
            )}
            {task.description && (
              <PlanFormattedText text={task.description} compact className="mt-2" />
            )}
```

Keep `task.acceptanceCriteria` as the current explicit `<ul>` because it is already normalized into an array.

- [ ] **Step 4: Format normalized phase preview goal and description**

In `renderProposedPhaseBlocks`, replace the combined goal/detail span:

```tsx
              {(phase.goal || phase.change.detail) && (
                <PlanFormattedText
                  text={`Goal: ${phase.goal || phase.change.detail}`}
                  className="italic"
                />
              )}
```

Replace the description span:

```tsx
              {phase.description && (
                <PlanFormattedText text={phase.description} />
              )}
```

- [ ] **Step 5: Format normalized risk preview text**

In `renderProposedRiskRows`, replace risk description:

```tsx
          <PlanFormattedText text={risk.description} />
```

Replace mitigation:

```tsx
          <PlanFormattedText
            text={`Mitigation: ${risk.mitigation || 'No mitigation defined.'}`}
            compact
            className="mt-1"
          />
```

Replace `change.detail`:

```tsx
          {change.detail && (
            <PlanFormattedText text={change.detail} compact />
          )}
```

- [ ] **Step 6: Remove obsolete legacy render helpers**

Delete these unused functions after confirming `rg` finds no call sites:

```text
_renderProposedTaskRowsLegacy
_renderProposedPhaseBlocksLegacy
_renderProposedRiskRowsLegacy
asArray
```

Run:

```powershell
rg -n "_renderProposed|asArray" web/src/components/islands/features/PlanView.tsx
```

Expected after deletion: no matches.

- [ ] **Step 7: Run focused tests and static validation**

Run:

```powershell
Set-Location web
npm test -- src/lib/planText.test.ts src/components/islands/features/PlanFormattedText.test.tsx src/lib/planProposal.test.ts
npx astro check
```

Expected: all focused tests PASS and Astro reports no new TypeScript errors.

- [ ] **Step 8: Commit proposal and review-panel integration**

Run:

```powershell
git add web/src/components/islands/features/PlanView.tsx
git commit -m "feat(web): format pending plan changes"
```

Expected: one commit covering main embedded proposal previews and both desktop/mobile Pending Changes render paths.

### Task 5: Full Verification and Visual Regression Check

**Files:**
- Verify: `web/src/lib/planText.ts`
- Verify: `web/src/components/islands/features/PlanFormattedText.tsx`
- Verify: `web/src/components/islands/features/PlanView.tsx`

- [ ] **Step 1: Run the complete web test suite**

Run:

```powershell
Set-Location web
npm test
```

Expected: all Vitest suites PASS with no unhandled errors.

- [ ] **Step 2: Run Astro static checks**

Run:

```powershell
Set-Location web
npx astro check
```

Expected: no new errors. If the checkout has pre-existing diagnostics, record the exact baseline and prove none originate from the files changed by this feature.

- [ ] **Step 3: Build the production web application**

Run:

```powershell
Set-Location web
npm run build
```

Expected: Astro production build completes successfully.

- [ ] **Step 4: Start or reuse the local web server**

If port 4321 is not already serving the current checkout, run:

```powershell
Set-Location web
npm run dev -- --host 127.0.0.1
```

Expected: the project is available at `http://127.0.0.1:4321`.

- [ ] **Step 5: Verify the main plan in a browser**

Use the browser-verification workflow against a project with dense plan text.

Confirm:

- Project, phase, task, and risk descriptions show readable paragraphs, labels, and lists.
- Short plain prose still appears as normal prose.
- Long strings wrap without horizontal overflow.
- Clicking an editable formatted field opens the editor with the exact original string.
- Cancel leaves the original value unchanged.
- Saving continues to use the existing mutation behavior.

- [ ] **Step 6: Verify desktop and mobile Pending Changes**

Confirm:

- Desktop review cards and the mobile review drawer use the same structured formatting.
- Action labels match the change action and section.
- Accept and Reject controls still work.
- Source quotes remain visually distinct and unchanged.
- Review cards remain usable at narrow width.

- [ ] **Step 7: Verify inert HTML rendering**

Display a plan value containing:

```text
<img src=x onerror=alert(1)>
```

Expected: the literal text is visible; no image element is created and no script/event handler executes.

- [ ] **Step 8: Inspect the final diff**

Run:

```powershell
git diff --check 53f0b12..HEAD -- web/src
git status --short
```

Expected: no whitespace errors. Preserve the user's unrelated untracked `context-factory/docs/vendara_chat_test_script.md` and any unrelated working-tree changes.

- [ ] **Step 9: Commit any verification-only correction**

Only if verification required a focused correction:

```powershell
git add web/src/lib/planText.ts web/src/lib/planText.test.ts web/src/components/islands/features/PlanFormattedText.tsx web/src/components/islands/features/PlanFormattedText.test.tsx web/src/components/islands/features/PlanView.tsx
git commit -m "fix(web): finalize plan text formatting"
```

Expected: no commit is created when verification requires no code change.
