# Astro + React — Performance Contracts
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

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

## Image Handling

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
