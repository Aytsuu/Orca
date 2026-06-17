import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  output: 'server',
  devToolbar: {
    enabled: false,
  },
  adapter: node({
    mode: 'standalone',
  }),

  integrations: [
    react(),
    mdx(),
    sitemap(),
  ],

  vite: {
    plugins: [tailwindcss()],
    server: {
      port: 4321,
      strictPort: true,
    },
    optimizeDeps: {
      // Force a fresh dependency optimization at each dev start so
      // branch switches and lockfile changes do not leave stale .vite state behind.
      force: true,
      include: [
        '@tanstack/react-query',
        '@nanostores/react',
        'astro/virtual-modules/transitions-router.js',
        'astro/virtual-modules/transitions-types.js',
        'astro/virtual-modules/transitions-events.js',
        'astro/virtual-modules/transitions-swap-functions.js',
        'nanostores',
        'react',
        'react-dom',
        'lucide-react',
      ],
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
