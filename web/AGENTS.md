# Agent Instructions — web/

This is the **Astro + React + TypeScript + Tailwind** frontend for Orca.

## Architecture Reference

Read these before making any structural, component, or routing decisions:

| Topic | File |
|---|---|
| Mental model (Astro vs React split) | [`context-factory/frameworks/astro/01-mental-model.md`](../context-factory/frameworks/astro/01-mental-model.md) |
| Directory structure | [`context-factory/frameworks/astro/02-directory-structure.md`](../context-factory/frameworks/astro/02-directory-structure.md) |
| Component taxonomy (Static vs Island) | [`context-factory/frameworks/astro/03-component-taxonomy.md`](../context-factory/frameworks/astro/03-component-taxonomy.md) |
| Hydration directives (`client:*`) | [`context-factory/frameworks/astro/04-hydration-strategy.md`](../context-factory/frameworks/astro/04-hydration-strategy.md) |
| State management (Nano Stores) | [`context-factory/frameworks/astro/05-state-management.md`](../context-factory/frameworks/astro/05-state-management.md) |
| Data layer (server vs client fetching) | [`context-factory/frameworks/astro/06-data-layer.md`](../context-factory/frameworks/astro/06-data-layer.md) |
| Routing, layouts, View Transitions | [`context-factory/frameworks/astro/07-routing-and-layouts.md`](../context-factory/frameworks/astro/07-routing-and-layouts.md) |
| Styling (Tailwind + `cn()` + scoped) | [`context-factory/frameworks/astro/08-styling-system.md`](../context-factory/frameworks/astro/08-styling-system.md) |
| API routes | [`context-factory/frameworks/astro/10-api-routes.md`](../context-factory/frameworks/astro/10-api-routes.md) |
| Architectural decisions (ADR-001–006) | [`context-factory/frameworks/astro/13-decision-log.md`](../context-factory/frameworks/astro/13-decision-log.md) |
| Anti-patterns (must not generate) | [`context-factory/frameworks/astro/14-anti-patterns.md`](../context-factory/frameworks/astro/14-anti-patterns.md) |
| Quick reference checklist | [`context-factory/frameworks/astro/15-quick-reference.md`](../context-factory/frameworks/astro/15-quick-reference.md) |

## Non-Negotiable Rules

- **Astro owns the document. React owns interactions.** Never put `client:*` on a component that has no interactivity.
- **New component?** Classify first: `static/` (.astro) or `islands/` (.tsx). See `03-component-taxonomy.md`.
- **Cross-island state** → Nano Stores (`src/stores/`). Never React Context across island boundaries.
- **Navigation in islands** → `navigate()` from `astro:transitions/client` (programmatic) or plain `<a href>` (declarative). Never `react-router-dom`.
- **Shell layouts + View Transitions** → set `animation-duration: 0ms` to prevent flicker.
- **External API calls** → always through `/api/*` endpoints, never directly from a React island.
- **Images** → always `<Image />` from `astro:assets`. No raw `<img>` tags.
- **Secrets** → never in `PUBLIC_` env vars.

## Stack

- **Framework:** Astro 4.x
- **Islands:** React 18 (`@astrojs/react`)
- **Styling:** Tailwind CSS (`@astrojs/tailwind`)
- **Cross-island state:** Nano Stores (`nanostores` + `@nanostores/react`)
- **Class merging:** `clsx` + `tailwind-merge` via `src/lib/utils/cn.ts`
- **Realtime:** Supabase JS client (subscriptions in React islands)
- **TypeScript:** strict mode (`astro/tsconfigs/strict`)
