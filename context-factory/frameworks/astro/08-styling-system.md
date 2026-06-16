# Astro + React — Styling System
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Design Tokens (CSS Custom Properties)

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

## Styling Approach

Use **Tailwind CSS** for utility classes in both `.astro` and `.tsx` files. Use the `cn()` utility to merge classes conditionally:

```typescript
// src/lib/utils/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

## Scoped Styles in Astro

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
