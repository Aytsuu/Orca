# Astro + React — Directory Structure
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

```
project-root/
├── src/
│   ├── components/
│   │   ├── islands/          # React components (hydrated, ship JS)
│   │   │   ├── ui/           # Atomic interactive widgets
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   ├── Combobox.tsx
│   │   │   │   └── Toast.tsx
│   │   │   ├── features/     # Domain-specific composite islands
│   │   │   │   ├── SearchBar.tsx
│   │   │   │   ├── ShoppingCart.tsx
│   │   │   │   └── CommentThread.tsx
│   │   │   └── providers/    # Context providers (client:only)
│   │   │       └── ThemeProvider.tsx
│   │   │
│   │   └── static/           # Astro components (zero JS, server-rendered)
│   │       ├── ui/
│   │       │   ├── Card.astro
│   │       │   ├── Badge.astro
│   │       │   └── Divider.astro
│   │       ├── layout/
│   │       │   ├── Header.astro
│   │       │   ├── Footer.astro
│   │       │   ├── Sidebar.astro
│   │       │   └── Breadcrumbs.astro
│   │       └── sections/
│   │           ├── Hero.astro
│   │           ├── FeatureGrid.astro
│   │           └── Testimonials.astro
│   │
│   ├── layouts/
│   │   ├── Base.astro          # HTML shell: meta, fonts, global CSS
│   │   ├── Page.astro          # Standard page: header + footer + slot
│   │   ├── BlogPost.astro      # MDX blog post layout
│   │   └── Dashboard.astro     # Auth-gated, SSR layout
│   │
│   ├── pages/
│   │   ├── index.astro
│   │   ├── about.astro
│   │   ├── blog/
│   │   │   ├── index.astro
│   │   │   └── [slug].astro
│   │   └── api/                # Server endpoints
│   │       ├── contact.ts
│   │       └── newsletter.ts
│   │
│   ├── content/                # Astro Content Collections
│   │   ├── config.ts           # Collection schemas (Zod)
│   │   ├── blog/               # .md / .mdx files
│   │   └── authors/            # .json or .yaml
│   │
│   ├── lib/                    # Framework-agnostic logic
│   │   ├── api/
│   │   │   ├── client.ts       # Typed fetch wrapper
│   │   │   └── endpoints.ts    # API route constants
│   │   ├── utils/
│   │   │   ├── date.ts
│   │   │   ├── slug.ts
│   │   │   └── cn.ts           # Class name utility (clsx + tailwind-merge)
│   │   └── constants.ts
│   │
│   ├── stores/                 # Nano Stores (cross-island state)
│   │   ├── cart.ts
│   │   ├── ui.ts               # modal open/close, theme
│   │   └── user.ts
│   │
│   ├── types/                  # Global TypeScript types
│   │   ├── api.d.ts
│   │   └── env.d.ts            # Import meta env types
│   │
│   └── styles/
│       ├── global.css          # CSS reset + custom properties
│       ├── tokens.css          # Design tokens as CSS variables
│       └── typography.css      # Base type scale
│
├── public/                     # Static assets (copied verbatim)
│   ├── fonts/
│   └── icons/
│
├── astro.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

**Agent note:** The `islands/` vs `static/` split is the most important naming convention. An agent generating a new component must first classify it before placing it.
