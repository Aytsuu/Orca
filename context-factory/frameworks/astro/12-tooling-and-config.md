# Astro + React — Tooling & Config
<!-- agent-doc: v2.1 | last-updated: 2025-06 | audience: LLM agents, senior engineers -->

## `astro.config.mjs`

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

## `tsconfig.json`

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

## Required Dependencies

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
