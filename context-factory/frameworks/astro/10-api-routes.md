# Astro + React — API Routes
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## Endpoint Structure

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

## Conventions

- Validate input with **Zod** at the endpoint boundary — never trust `request.json()` raw.
- Return `{ ok: true }` on success and `{ error: string, issues?: ... }` on failure.
- Keep API routes thin; delegate to `lib/` functions.
- Use HTTP verbs correctly: `GET` (read), `POST` (create), `PUT`/`PATCH` (update), `DELETE`.
