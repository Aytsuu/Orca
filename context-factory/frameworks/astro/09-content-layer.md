# Astro + React — Content Layer
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Content Collections Config

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

## Querying Content

```typescript
// List with filter
const posts = await getCollection('blog', ({ data }) => !data.draft)

// Single entry (throws if not found — catch upstream)
const post = await getEntry('blog', slug)

// With author resolved
const { remarkPluginFrontmatter } = await post.render()
const author = await getEntry(post.data.author)
```
