import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  base: './', // relative, so the site works under any GitHub Pages repo path
  plugins: [preact()],
  worker: { format: 'es' },
  test: { environment: 'jsdom' },
});
