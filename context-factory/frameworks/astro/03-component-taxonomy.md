# Astro + React — Component Taxonomy
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

Components fall into exactly one of four tiers. Classify before creating.

| Tier | Location | Renders in | Hydrated | Ships JS |
|------|----------|------------|----------|----------|
| **Static** | `components/static/` | Astro (build/SSR) | Never | No |
| **Island** | `components/islands/` | Browser | Yes (explicit directive) | Yes |
| **Provider** | `components/islands/providers/` | Browser only | `client:only="react"` | Yes |
| **Shared** | `lib/` | Anywhere | — | No |

## Classification Decision Tree

```
Does the component use useState, useEffect, or browser APIs?
│
├─ No  →  Is it ever used inside a React island?
│          ├─ No  →  static/ (.astro)
│          └─ Yes →  Can be .astro with <slot> OR a .tsx without hooks
│
└─ Yes →  Does it need to run before any user interaction?
           ├─ Yes →  island/ with client:load
           └─ No  →  island/ with client:idle or client:visible
```
