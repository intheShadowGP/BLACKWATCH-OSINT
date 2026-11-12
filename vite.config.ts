/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { buildCsp } from './src/config/csp.ts';

// GitHub Pages serves the app under /<repository>/. The workflow injects
// BASE_PATH; locally we default to "/" so `npm run dev` just works.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'blackwatch-csp',
      // Pages cannot set HTTP headers, so the CSP is delivered via <meta>.
      // It is generated from the source catalogue so it never drifts.
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          const dev = !!ctx.server;
          return html.replace('%BLACKWATCH_CSP%', buildCsp({ dev }));
        },
      },
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
