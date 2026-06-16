# Astro + React — Hydration Strategy
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

<!-- agent-decision: hydration -->
**Rule:** Every `client:*` directive must be justified in a comment on the line above it.

```astro
---
// Only add client:load for above-the-fold, interaction-critical UI
---

<!-- Search is visible on load and immediately usable -->
<SearchBar client:load />

<!-- Cart icon: hydrate during browser idle time, not blocking -->
<CartIcon client:idle />

<!-- Comments are below the fold — no need to hydrate until visible -->
<CommentThread client:visible />

<!-- Providers that use browser-only APIs (localStorage, matchMedia) -->
<ThemeProvider client:only="react">
  <slot />
</ThemeProvider>
```

## Directive Reference

| Directive | When hydrates | Use for |
|-----------|--------------|---------|
| `client:load` | Immediately on load | Critical above-fold UI |
| `client:idle` | After `requestIdleCallback` | Non-critical visible UI |
| `client:visible` | When entering viewport | Below-fold components |
| `client:media="(query)"` | When media query matches | Responsive-only components |
| `client:only="react"` | Browser only, no SSR | Components with browser-only deps |
| _(none)_ | Never | Static render only |

**Anti-pattern:** Using `client:load` on every React component. This negates Astro's performance model.
