# Astro + React — Quick Reference
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

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
