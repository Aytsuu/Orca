# Astro + React — Data Layer
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Server-Side Data (in `.astro` frontmatter)

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

## Client-Side Data (in React Islands)

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

## Data Flow Rules

```
Build-time static data:    Content Collections → .astro frontmatter
Request-time server data:  External API       → .astro frontmatter (SSR mode)
Client-side mutations:     React island       → /api/* endpoint → external API
Cross-island reads:        Nano Store         ← seeded from .astro or API response
```

**Agent rule:** Never call an external API directly from a React island. Route through `/api/*` to keep credentials server-side and to enable rate-limiting.
