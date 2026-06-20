# Astro + React — Mental Model
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

```
┌─────────────────────────────────────────────────────────┐
│                    ASTRO BUILD LAYER                    │
│  (runs at build time or on the server, ships no JS)     │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Pages   │  │ Layouts  │  │  Static Components   │  │
│  │ .astro   │  │ .astro   │  │       .astro         │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│                                                         │
│  ╔══════════════════════════════════════════════════╗   │
│  ║              REACT ISLANDS (opt-in JS)           ║   │
│  ║                                                  ║   │
│  ║  <SearchBar client:load />                       ║   │
│  ║  <ShoppingCart client:idle />                    ║   │
│  ║  <Modal client:visible />                        ║   │
│  ╚══════════════════════════════════════════════════╝   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SHARED LAYER (no framework, no DOM)             │   │
│  │  lib/ · stores/ · types/ · content/              │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Core philosophy:** Astro owns the document. React owns the interactions. Nothing ships JavaScript by accident.

**Rule of thumb for agents:** If you are deciding where a file goes, ask "does this need the DOM at runtime?" If no → `.astro`. If yes and it manages its own state → React island. If it's pure logic → `lib/`.
