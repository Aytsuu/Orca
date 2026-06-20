# Astro + React — Decision Log
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

Agents should consult this before proposing changes.

## ADR-001: Nano Stores over Zustand/Jotai
**Decision:** Use `nanostores` for cross-island state.
**Rationale:** Nano Stores are framework-agnostic (works across React, Svelte, Vue, Solid islands in same Astro project), ~1KB, and have zero runtime coupling to React's lifecycle. Zustand couples to React hooks; Jotai uses React Context which doesn't cross island boundaries.
**Tradeoff:** Less ecosystem tooling (no devtools extension). Acceptable for most content sites.

## ADR-002: No React Router / Next-style client navigation
**Decision:** Use Astro's native MPA routing. No client-side routing.
**Rationale:** Astro's View Transitions API handles page transitions without shipping a router. Client routing adds complexity and >20KB of JS.
**Exception:** If the product is predominantly a SPA dashboard (>80% interactions, rarely full navigations), wrap the entire app in a single `client:only="react"` island and use React Router within it.

## ADR-003: Validate all API input with Zod at the endpoint
**Decision:** Every `APIRoute` must parse `request.json()` through a Zod schema before use.
**Rationale:** TypeScript types are erased at runtime. Zod is the only guarantee of shape at the network boundary.

## ADR-004: `astro:assets` for all images
**Decision:** No raw `<img>` tags. All images via `<Image />` from `astro:assets`.
**Rationale:** Automatic WebP conversion, srcset generation, LCP optimization. Enforced with an ESLint rule.

## ADR-005: Scoped styles in Astro, Tailwind in React
**Decision:** `.astro` components may use `<style>` (scoped). React islands use Tailwind utility classes only.
**Rationale:** Scoped styles in Astro compile to attribute selectors with zero specificity problems. CSS Modules in React add build complexity without benefit when Tailwind is already in the stack.

## ADR-006: `navigate()` for programmatic navigation; plain `<a>` for declarative links
**Decision:** React islands use `navigate` from `astro:transitions/client` for programmatic navigation and plain `<a href>` anchors for declarative links. React Router is not installed.
**Rationale:** The app uses Astro's MPA router, not a client-side router. React Router's `<Link>` requires a `<Router>` context that does not exist in this architecture. Astro's View Transitions intercepts standard anchor clicks automatically, so `<a>` works correctly and ships no extra JS.
**Corollary:** View Transitions animations on shell-level routes (those inside a persistent Navbar + TabBar layout) must have `animation-duration: 0ms` to prevent a visible flicker as the shell DOM re-animates on every route change.
