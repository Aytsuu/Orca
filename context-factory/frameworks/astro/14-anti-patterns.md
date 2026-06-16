# Astro + React — Anti-Patterns
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

Agents must refuse to generate code matching these patterns.

## ❌ Using `client:load` on non-critical components
```astro
<!-- WRONG -->
<Footer client:load />
<StaticBlogCard client:load />
```
Footers and static cards have no interactivity. `client:load` ships their entire React bundle for no reason.

## ❌ Calling external APIs from React islands directly
```tsx
// WRONG — exposes API keys, no rate limiting, no CORS control
const res = await fetch('https://api.stripe.com/v1/...', {
  headers: { Authorization: `Bearer ${import.meta.env.PUBLIC_STRIPE_KEY}` }
})
```
Route through `/api/*` endpoints.

## ❌ Using React Context for cross-island state
```tsx
// WRONG — Context does not cross island boundaries
// CartContext in Island A is invisible to CartIcon in Island B
```
Use Nano Stores.

## ❌ Importing React in `.astro` component frontmatter
```astro
---
// WRONG — unnecessary, Astro doesn't need React imported
import React from 'react'
---
```

## ❌ Storing secrets in `PUBLIC_` env vars
```
# WRONG — visible in browser bundle
PUBLIC_DATABASE_URL=postgres://...
PUBLIC_STRIPE_SECRET_KEY=sk_live_...
```
`PUBLIC_` prefix exposes env vars to the client. Use unprefixed vars (server-only) for secrets.

## ❌ Large React subtrees where most content is static
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

## ❌ Using React Router `<Link>` inside an island
```tsx
// WRONG — no React Router context exists; throws at runtime
import { Link } from 'react-router-dom'
export function Tab({ href, label }) {
  return <Link to={href}>{label}</Link>
}
```
Use a plain `<a href={href}>` or `navigate(href)` from `astro:transitions/client`.

## ❌ Leaving View Transitions enabled on persistent-shell routes
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
