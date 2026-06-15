# Astro + React Frontend Architecture
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Overview

This document describes a production-grade architecture for an **Astro + React** frontend. It is structured for agent readability: each section contains a machine-parseable `decision` block, a rationale, and concrete implementation patterns.

**Core philosophy:** Astro owns the document. React owns the interactions. Nothing ships JavaScript by accident.

---

## 1. Mental Model

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

**Rule of thumb for agents:** If you are deciding where a file goes, ask "does this need the DOM at runtime?" If no → `.astro`. If yes and it manages its own state → React island. If it's pure logic → `lib/`.

---

## 2. Directory Structure

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

---

## 3. Component Taxonomy

Components fall into exactly one of four tiers. Classify before creating.

| Tier | Location | Renders in | Hydrated | Ships JS |
|------|----------|------------|----------|----------|
| **Static** | `components/static/` | Astro (build/SSR) | Never | No |
| **Island** | `components/islands/` | Browser | Yes (explicit directive) | Yes |
| **Provider** | `components/islands/providers/` | Browser only | `client:only="react"` | Yes |
| **Shared** | `lib/` | Anywhere | — | No |

### Classification decision tree

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

---

## 4. Hydration Strategy

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

### Directive reference

| Directive | When hydrates | Use for |
|-----------|--------------|---------|
| `client:load` | Immediately on load | Critical above-fold UI |
| `client:idle` | After `requestIdleCallback` | Non-critical visible UI |
| `client:visible` | When entering viewport | Below-fold components |
| `client:media="(query)"` | When media query matches | Responsive-only components |
| `client:only="react"` | Browser only, no SSR | Components with browser-only deps |
| _(none)_ | Never | Static render only |

**Anti-pattern:** Using `client:load` on every React component. This negates Astro's performance model.

---

## 5. State Management

### Tier 1 — Component-local state
Use `useState` / `useReducer` inside an island. Do not lift unless shared across islands.

### Tier 2 — Cross-island state (Nano Stores)
Use `nanostores` for any value that two or more islands need to read or write.

```typescript
// src/stores/cart.ts
import { atom, map, computed } from 'nanostores'

export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export const cartItems = map<Record<string, CartItem>>({})

export const cartCount = computed(cartItems, (items) =>
  Object.values(items).reduce((sum, item) => sum + item.quantity, 0)
)

export const cartTotal = computed(cartItems, (items) =>
  Object.values(items).reduce((sum, item) => sum + item.price * item.quantity, 0)
)

export function addItem(item: CartItem) {
  const existing = cartItems.get()[item.id]
  if (existing) {
    cartItems.setKey(item.id, { ...existing, quantity: existing.quantity + 1 })
  } else {
    cartItems.setKey(item.id, item)
  }
}
```

```tsx
// src/components/islands/features/CartIcon.tsx
import { useStore } from '@nanostores/react'
import { cartCount } from '@/stores/cart'

export function CartIcon() {
  const count = useStore(cartCount)
  return <button aria-label={`Cart, ${count} items`}>🛒 {count}</button>
}
```

### Tier 3 — Server/URL state
Use `Astro.url.searchParams` (in `.astro` files) or `URLSearchParams` in islands for filter/sort state that should survive navigation. Prefer URL state over store state for shareable views.

### What NOT to use
- **Zustand / Redux / Jotai**: Too heavy; Nano Stores are isomorphic, 1KB, and work across any framework Astro supports.
- **React Context for cross-island state**: Context does not cross island boundaries. Islands are separate React roots.

---

## 6. Data Layer

### Server-side data (in `.astro` frontmatter)

```astro
---
// src/pages/blog/[slug].astro
import { getEntry } from 'astro:content'
import { getRelatedPosts } from '@/lib/api/posts'

const { slug } = Astro.params
const post = await getEntry('blog', slug!)
if (!post) return Astro.redirect('/404')

// Data fetched at build time (static) or request time (SSR)
const related = await getRelatedPosts(post.data.tags)
---
```

### Client-side data (in React islands)

Use a minimal fetch wrapper. Do not add React Query or SWR unless the app has >10 distinct remote data shapes.

```typescript
// src/lib/api/client.ts
export async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`/api/${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json() as Promise<T>
}
```

### Data flow rules

```
Build-time static data:    Content Collections → .astro frontmatter
Request-time server data:  External API       → .astro frontmatter (SSR mode)
Client-side mutations:     React island       → /api/* endpoint → external API
Cross-island reads:        Nano Store         ← seeded from .astro or API response
```

**Agent rule:** Never call an external API directly from a React island. Route through `/api/*` to keep credentials server-side and to enable rate-limiting.

---

## 7. Routing & Layouts

### File-based routing

```
src/pages/index.astro          →  /
src/pages/blog/index.astro     →  /blog
src/pages/blog/[slug].astro    →  /blog/:slug
src/pages/[...path].astro      →  /* (catch-all 404)
src/pages/api/contact.ts       →  POST /api/contact
```

### Navigation from React islands

React islands **cannot** use `<Link>` from React Router — there is no React Router in this architecture. Use `navigate` from `astro:transitions/client` for programmatic navigation.

```tsx
// ✅ CORRECT — works inside any React island
import { navigate } from 'astro:transitions/client';

export function GoHomeButton() {
  return (
    <button onClick={() => navigate('/')}>← Projects</button>
  );
}
```

For declarative in-page links inside React islands, use a plain `<a>` tag. Astro's View Transitions router intercepts standard anchor clicks automatically.

```tsx
// ✅ CORRECT — plain anchor, intercepted by Astro
export function TabLink({ href, label }: { href: string; label: string }) {
  return <a href={href}>{label}</a>;
}

// ❌ WRONG — React Router Link has no router to bind to
import { Link } from 'react-router-dom'; // never add this package
export function TabLink({ href, label }: { href: string; label: string }) {
  return <Link to={href}>{label}</Link>; // throws at runtime
}
```

### View Transitions and the flicker anti-pattern

Astro's View Transitions (`<ViewTransitions />`) adds animated page transitions. These can cause a **visible flash/flicker** between routes because the outgoing page's state animates out before the incoming page fully mounts.

**Resolution:** Disable or keep the transition duration minimal (or use `transition:name` only on specific elements) for app-like SPA views where instant navigation is preferable.

```astro
<!-- Base.astro or layout -->
<!-- Option A: Remove ViewTransitions entirely for app routes -->
<!-- <ViewTransitions /> ← omit this -->

<!-- Option B: Set instant transition for specific routes -->
<style is:global>
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0ms; /* kills the flicker */
  }
</style>
```

**Agent rule:** If a page route is inside a persistent-shell layout (Navbar + TabBar always visible), suppress View Transitions for those routes. The shell should not animate out on navigation — only the page content area should change.

### Layout composition

```astro
---
// src/layouts/BlogPost.astro
import Base from './Base.astro'
import { type CollectionEntry } from 'astro:content'

interface Props {
  post: CollectionEntry<'blog'>
}
const { post } = Astro.props
---

<Base title={post.data.title} description={post.data.description}>
  <article class="prose mx-auto">
    <h1>{post.data.title}</h1>
    <slot />  <!-- MDX content renders here -->
  </article>
</Base>
```

### Layout hierarchy

```
Base.astro          (HTML, <head>, global scripts, fonts)
└── Page.astro      (Header + main + Footer chrome)
    ├── BlogPost.astro    (article container, reading width)
    └── Dashboard.astro   (sidebar + main two-column)
```

---

## 8. Styling System

### Design tokens (CSS custom properties)

```css
/* src/styles/tokens.css */
:root {
  /* Spacing (4px base grid) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-8: 2rem;
  --space-16: 4rem;

  /* Type scale */
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-4xl: 2.25rem;

  /* Color primitives */
  --color-neutral-50: #f9fafb;
  --color-neutral-900: #111827;

  /* Semantic aliases (swap for dark mode) */
  --bg-surface: var(--color-neutral-50);
  --text-primary: var(--color-neutral-900);
  --border-subtle: #e5e7eb;
}
```

### Styling approach

Use **Tailwind CSS** for utility classes in both `.astro` and `.tsx` files. Use the `cn()` utility to merge classes conditionally:

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### Scoped styles in Astro

For complex layout-specific styles that don't belong in Tailwind:

```astro
<div class="hero-grid">
  <slot />
</div>

<style>
  /* Scoped by default — no leakage */
  .hero-grid {
    display: grid;
    grid-template-columns: 1fr min(65ch, 100%) 1fr;
  }
</style>
```

**Agent note:** Do not use CSS Modules in `.tsx` files. Use Tailwind classes or a `<style>` block in the wrapping `.astro` file instead. Keeps the bundle smaller and avoids class name collisions.

---

## 9. Content Layer

### Content Collections config

```typescript
// src/content/config.ts
import { defineCollection, z, reference } from 'astro:content'

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().max(160),
    publishDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: reference('authors'),
    tags: z.array(z.string()),
    image: z.object({ src: z.string(), alt: z.string() }).optional(),
    draft: z.boolean().default(false),
  }),
})

const authors = defineCollection({
  type: 'data',   // JSON/YAML, not markdown
  schema: z.object({
    name: z.string(),
    avatar: z.string(),
    bio: z.string(),
    links: z.object({
      twitter: z.string().url().optional(),
      github: z.string().url().optional(),
    }).optional(),
  }),
})

export const collections = { blog, authors }
```

### Querying content

```typescript
// List with filter
const posts = await getCollection('blog', ({ data }) => !data.draft)

// Single entry (throws if not found — catch upstream)
const post = await getEntry('blog', slug)

// With author resolved
const { remarkPluginFrontmatter } = await post.render()
const author = await getEntry(post.data.author)
```

---

## 10. API Routes

### Endpoint structure

```typescript
// src/pages/api/contact.ts
import type { APIRoute } from 'astro'
import { z } from 'zod'

const ContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  message: z.string().min(10).max(2000),
})

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json()
  const result = ContactSchema.safeParse(body)

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', issues: result.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Business logic here — never exposed to client
  await sendEmail(result.data)

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

### API route conventions

- Validate input with **Zod** at the endpoint boundary — never trust `request.json()` raw.
- Return `{ ok: true }` on success and `{ error: string, issues?: ... }` on failure.
- Keep API routes thin; delegate to `lib/` functions.
- Use HTTP verbs correctly: `GET` (read), `POST` (create), `PUT`/`PATCH` (update), `DELETE`.

---

## 11. Performance Contracts

These are hard constraints, not aspirations.

| Metric | Target | Enforced by |
|--------|--------|-------------|
| JS shipped (static pages) | < 50 KB (gzip) | Bundle analyzer in CI |
| JS shipped (interactive pages) | < 150 KB (gzip) | Bundle analyzer in CI |
| LCP | < 2.5 s (p75) | Lighthouse CI |
| CLS | < 0.1 | Lighthouse CI |
| Images | Always use `astro:assets` `<Image />` | ESLint rule (no `<img>`) |
| Fonts | Preloaded, `font-display: swap` | `Base.astro` enforced |
| Third-party scripts | Deferred or `client:idle` | Code review |

### Image handling

```astro
---
import { Image } from 'astro:assets'
import heroImg from '@/assets/hero.jpg'
---

<!-- astro:assets handles: format conversion (WebP), srcset, lazy loading -->
<Image
  src={heroImg}
  alt="Descriptive alt text"
  width={1200}
  height={630}
  loading="eager"   <!-- Use eager only for above-fold images -->
  fetchpriority="high"
/>
```

---

## 12. Tooling & Config

### `astro.config.mjs`

```javascript
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwind from '@astrojs/tailwind'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'

export default defineConfig({
  site: 'https://example.com',
  output: 'static',       // or 'server' for SSR, 'hybrid' for mixed

  integrations: [
    react(),
    tailwind({ applyBaseStyles: false }), // We manage global.css manually
    mdx(),
    sitemap(),
  ],

  image: {
    domains: ['cdn.example.com'], // Allow remote images from known hosts only
  },

  vite: {
    resolve: {
      alias: { '@': '/src' },
    },
  },
})
```

### `tsconfig.json`

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

### Required dependencies

```json
{
  "dependencies": {
    "astro": "^4.x",
    "@astrojs/react": "^3.x",
    "@astrojs/tailwind": "^5.x",
    "@astrojs/mdx": "^3.x",
    "nanostores": "^0.10.x",
    "@nanostores/react": "^0.7.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.x",
    "typescript": "^5.x",
    "tailwindcss": "^3.x"
  }
}
```

---

## 13. Decision Log

This section records key architectural decisions and their rationale. Agents should consult this before proposing changes.

### ADR-001: Nano Stores over Zustand/Jotai
**Decision:** Use `nanostores` for cross-island state.
**Rationale:** Nano Stores are framework-agnostic (works across React, Svelte, Vue, Solid islands in same Astro project), ~1KB, and have zero runtime coupling to React's lifecycle. Zustand couples to React hooks; Jotai uses React Context which doesn't cross island boundaries.
**Tradeoff:** Less ecosystem tooling (no devtools extension). Acceptable for most content sites.

### ADR-002: No React Router / Next-style client navigation
**Decision:** Use Astro's native MPA routing. No client-side routing.
**Rationale:** Astro's View Transitions API handles page transitions without shipping a router. Client routing adds complexity and >20KB of JS.
**Exception:** If the product is predominantly a SPA dashboard (>80% interactions, rarely full navigations), wrap the entire app in a single `client:only="react"` island and use React Router within it.

### ADR-003: Validate all API input with Zod at the endpoint
**Decision:** Every `APIRoute` must parse `request.json()` through a Zod schema before use.
**Rationale:** TypeScript types are erased at runtime. Zod is the only guarantee of shape at the network boundary.

### ADR-004: `astro:assets` for all images
**Decision:** No raw `<img>` tags. All images via `<Image />` from `astro:assets`.
**Rationale:** Automatic WebP conversion, srcset generation, LCP optimization. Enforced with an ESLint rule.

### ADR-005: Scoped styles in Astro, Tailwind in React
**Decision:** `.astro` components may use `<style>` (scoped). React islands use Tailwind utility classes only.
**Rationale:** Scoped styles in Astro compile to attribute selectors with zero specificity problems. CSS Modules in React add build complexity without benefit when Tailwind is already in the stack.

### ADR-006: `navigate()` for programmatic navigation; plain `<a>` for declarative links
**Decision:** React islands use `navigate` from `astro:transitions/client` for programmatic navigation and plain `<a href>` anchors for declarative links. React Router is not installed.
**Rationale:** The app uses Astro's MPA router, not a client-side router. React Router's `<Link>` requires a `<Router>` context that does not exist in this architecture. Astro's View Transitions intercepts standard anchor clicks automatically, so `<a>` works correctly and ships no extra JS.
**Corollary:** View Transitions animations on shell-level routes (those inside a persistent Navbar + TabBar layout) must have `animation-duration: 0ms` to prevent a visible flicker as the shell DOM re-animates on every route change.

---

## 14. Anti-Patterns

Agents must refuse to generate code matching these patterns.

### ❌ Using `client:load` on non-critical components
```astro
<!-- WRONG -->
<Footer client:load />
<StaticBlogCard client:load />
```
Footers and static cards have no interactivity. `client:load` ships their entire React bundle for no reason.

### ❌ Calling external APIs from React islands directly
```tsx
// WRONG — exposes API keys, no rate limiting, no CORS control
const res = await fetch('https://api.stripe.com/v1/...', {
  headers: { Authorization: `Bearer ${import.meta.env.PUBLIC_STRIPE_KEY}` }
})
```
Route through `/api/*` endpoints.

### ❌ Using React Context for cross-island state
```tsx
// WRONG — Context does not cross island boundaries
// CartContext in Island A is invisible to CartIcon in Island B
```
Use Nano Stores.

### ❌ Importing React in `.astro` component frontmatter
```astro
---
// WRONG — unnecessary, Astro doesn't need React imported
import React from 'react'
---
```

### ❌ Storing secrets in `PUBLIC_` env vars
```
# WRONG — visible in browser bundle
PUBLIC_DATABASE_URL=postgres://...
PUBLIC_STRIPE_SECRET_KEY=sk_live_...
```
`PUBLIC_` prefix exposes env vars to the client. Use unprefixed vars (server-only) for secrets.

### ❌ Large React subtrees where most content is static
```tsx
// WRONG — ships JS for a component that only has one interactive button
export function BlogPost({ post }) {
  const [liked, setLiked] = useState(false)
  return (
    <article>
      {/* 300 lines of static markup */}
      <button onClick={() => setLiked(true)}>Like</button>
    </article>
  )
}
```
Keep the article in `.astro`. Extract only the `<LikeButton />` as a React island.

### ❌ Using React Router `<Link>` inside an island
```tsx
// WRONG — no React Router context exists; throws at runtime
import { Link } from 'react-router-dom'
export function Tab({ href, label }) {
  return <Link to={href}>{label}</Link>
}
```
Use a plain `<a href={href}>` or `navigate(href)` from `astro:transitions/client`.

### ❌ Leaving View Transitions enabled on persistent-shell routes
```astro
<!-- WRONG — the Navbar + TabBar shell flickers on every route change -->
<!-- because ViewTransitions animates the entire page document out/in -->
<ViewTransitions /> <!-- ← causes flicker in shell-based layouts -->
```
Either remove `<ViewTransitions />` from shell layouts or suppress the animation:
```css
::view-transition-old(root),
::view-transition-new(root) { animation-duration: 0ms; }
```

---

## Appendix: Quick Reference Card

```
New component checklist:
  1. Does it need useState/useEffect?  No → .astro   Yes → .tsx island
  2. Pick hydration directive:         client:load | client:idle | client:visible
  3. Cross-island state needed?        Use nanostores, not React Context
  4. Fetching data?                    Server → .astro frontmatter | Client → /api/* only
  5. Images?                           Always astro:assets <Image />
  6. API endpoint?                     Parse input with Zod. Thin route, fat lib/.
  7. Styling?                          Tailwind classes + cn() | Astro <style> for layout

Navigation checklist (inside a React island):
  1. Programmatic navigation?          navigate(href) from 'astro:transitions/client'
  2. Declarative link?                 Plain <a href={href}> — Astro intercepts it
  3. Never import react-router-dom     No router context exists in this project
  4. Shell layout + ViewTransitions?   Set animation-duration: 0ms to kill flicker
```