# Plan Content Display Formatting Design

## Objective

Make plan content easier to scan in both the main Project Plan view and the Pending Changes review panel. The change is presentation-only: it must not rewrite persisted plan text, proposal payloads, inline-edit values, or acceptance behavior.

## Current Problem

`PlanView.tsx` sometimes renders long AI-generated descriptions and proposal details as one dense paragraph. The underlying plan and proposal models already contain useful structure, but free-form text can still include headings, labeled fields, requirements, notes, or sentence lists that are difficult to distinguish visually.

The main plan and review panel also use separate rendering paths. Improving only one would leave the same content inconsistent across the page.

## Chosen Approach

Introduce a small, reusable structured-text presentation layer and use it from both rendering paths.

The formatter will:

- Accept the original text as an immutable input.
- Normalize display whitespace without changing the source value.
- Preserve explicit line-based lists.
- Recognize conservative labeled sections such as `Goal:`, `Description:`, `Requirements:`, `Notes:`, and `Done When:`.
- Split only clearly list-like prose into bullet items.
- Render unrecognized content as ordinary paragraphs.
- Never interpret or render raw HTML.

This approach provides better readability for existing content without requiring Markdown input or changing the API contract.

## Alternatives Considered

### CSS-only wrapping

Improving width, line height, and spacing is low risk but does not create hierarchy inside a dense paragraph.

### Markdown rendering

Markdown would provide rich formatting, but current stored content is not consistently authored as Markdown. Adding it would create inconsistent output and an unnecessary rendering/security surface.

### Structured display parser

This is the selected option. It can make conservative improvements to existing text while retaining a safe paragraph fallback.

## Component Design

### Pure formatting helper

Add a focused helper module under `web/src/lib/` that converts a string into a small display model:

- paragraph
- labeled section
- unordered list

The helper will contain no React, persistence, or API logic. This keeps parsing deterministic and directly unit-testable.

The parser must be conservative. Ambiguous prose remains a paragraph instead of being aggressively split.

### Reusable React renderer

Add a compact plan text display component under the existing Plan view component area. It will:

- Render the helper's display model with semantic paragraphs, headings/labels, and lists.
- Accept class-name options needed by the main plan and compact review cards.
- Preserve the current visual theme, borders, typography tokens, and responsive behavior.
- Avoid introducing a general-purpose rich-text dependency.

### Main plan integration

Use the renderer for read-only displays of:

- Project descriptions.
- Phase goals and descriptions.
- Task descriptions and acceptance criteria where applicable.
- Proposal previews embedded in the main plan.
- Risk descriptions, mitigation text, and other proposal detail text where dense content can occur.

Inline editors continue to receive and save the original string. The formatted renderer is not used while a field is being edited.

### Pending Changes integration

Use the same renderer for:

- Change details.
- Justifications when present.
- Source context where appropriate.
- Structured task, phase, risk, and acceptance-criteria previews derived from proposal content.

Each review card will retain its action label, title, source quote, and Accept/Reject controls. Formatting changes only the body hierarchy.

## Formatting Rules

1. Empty or whitespace-only input renders nothing.
2. Existing dash, asterisk, or Unicode bullet markers become unordered-list items.
3. Multiple explicit lines remain separate blocks.
4. Recognized `Label: value` text renders the label separately from its value.
5. A recognized plural/list label followed by multiple clear items renders a list.
6. Ordinary prose remains a paragraph with readable line height.
7. No text is removed, rewritten, summarized, or sent back to the API.
8. No `dangerouslySetInnerHTML` or raw HTML parsing is permitted.

## Data Flow

1. Plan and proposal data continue to load through the existing query hooks.
2. Existing proposal normalization helpers continue extracting structured task, phase, and risk fields.
3. Read-only text is passed to the formatting helper.
4. The display component renders the returned blocks.
5. Editing and mutation handlers continue using the untouched source values.

## Error and Fallback Behavior

- The formatter must be total for string input and return a safe empty result for blank text.
- Unsupported or malformed formatting falls back to a paragraph.
- Proposal content that cannot be normalized continues using existing title/detail fallbacks.
- Rendering failure must not affect accepting, rejecting, or editing a plan change.

## Testing

Use test-driven development for the formatting helper:

- Blank input returns no blocks.
- Plain prose remains one paragraph.
- Explicit bullets become list items.
- Recognized labels become labeled sections.
- Mixed labeled content and bullets preserves order.
- Ambiguous punctuation is not incorrectly split.
- HTML-like input remains inert text.
- Original input is not mutated.

Extend proposal-helper tests only where necessary to prove the Pending Changes renderer receives normalized structured fields. Run the web unit tests and production build after integration.

## Scope Boundaries

Included:

- Display formatting in the main plan and Pending Changes panel.
- A reusable parser and renderer.
- Unit tests and build verification.

Excluded:

- Database, API, AI prompt, or proposal schema changes.
- Automatic rewriting or Markdown conversion of saved content.
- New editing controls.
- Changes to proposal acceptance/rejection semantics.
- Unrelated Plan view redesign or refactoring.

## Acceptance Criteria

- Dense plan text is displayed with clear spacing, labels, and bullets when safely detectable.
- Both the main plan and Pending Changes use consistent formatting.
- Plain prose still renders naturally.
- Editing shows the exact original source text.
- Saving, accepting, and rejecting preserve existing payloads and behavior.
- User-provided text cannot inject executable HTML.
- Relevant unit tests and the web production build pass.
