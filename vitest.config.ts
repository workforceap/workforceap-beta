import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VITEST_LIBRARY_SPECS } from './scripts/vitest-library-specs.mjs';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/**/*.spec.ts',
      'tests/**/*.test.ts',
      'tests/**/*.spec.tsx',
      'tests/**/*.test.tsx',
      // Shared with the Node runner: each delegated library suite must run here.
      ...VITEST_LIBRARY_SPECS,
      'components/**/*.test.tsx',
      // Colocated vitest route specs. Listed individually (not app/**) so the
      // node:test-runner files under app/ (e.g. app/api/employer/signup/route.test.ts)
      // are not collected by vitest.
      'app/api/apply/signup/route.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      // Playwright suites — they need a running app and the Playwright
      // runner; vitest collecting them only produces phantom failures.
      'tests/e2e/**',
    ],
    setupFiles: ['./tests/setup.ts'],
    // Cascade specs (tests/components/kit-empty-state.spec.tsx) mount the real
    // portal stylesheets in jsdom through `?raw` imports; Vite hands the text
    // back untouched (no PostCSS) and every other CSS import stays stubbed.
    css: { include: [/\/css\/portal(-kit)?\.css\?raw$/] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'tests/empty-module.cjs'),
    },
  },
});
