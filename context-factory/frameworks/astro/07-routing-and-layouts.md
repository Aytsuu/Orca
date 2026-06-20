# Astro + React — Routing & Layouts
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## File-Based Routing

```
src/pages/index.astro          →  /
src/pages/blog/index.astro     →  /blog
src/pages/blog/[slug].astro    →  /blog/:slug
src/pages/[...path].astro      →  /* (catch-all 404)
src/pages/api/contact.ts       →  POST /api/contact
```

## Navigation from React Islands

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

## View Transitions and the Flicker Anti-Pattern

Astro's View Transitions (`<ViewTransitions />`) adds animated page transitions. These can cause a **visible flash/flicker** between routes because the outgoing page's state animates out before the incoming page fully mounts.

**Resolution:** Disable or keep the transition duration minimal for app-like SPA views where instant navigation is preferable.

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

## Layout Composition

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

## Layout Hierarchy

```
Base.astro          (HTML, <head>, global scripts, fonts)
└── Page.astro      (Header + main + Footer chrome)
    ├── BlogPost.astro    (article container, reading width)
    └── Dashboard.astro   (sidebar + main two-column)
```
