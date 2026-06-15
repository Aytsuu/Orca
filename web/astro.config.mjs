import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://example.com',
  output: 'static',

  integrations: [
    react(),
    mdx(),
    sitemap(),
  ],

  vite: {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  },
});
