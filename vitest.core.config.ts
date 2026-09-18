import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * packages/core and packages/ui are source-only packages (no package.json of their own): the
 * frontend consumes them through the `@genesis/core` alias and the backend through an esbuild
 * bundle. This config runs their vitest suites from the repo root: `npm run test:core`.
 */
export default defineConfig({
  resolve: {
    alias: { '@genesis/core': resolve(__dirname, 'packages/core/src') },
  },
  test: {
    include: ['packages/core/src/**/*.test.ts', 'packages/ui/src/**/*.test.ts', 'packages/ui/src/**/*.test.tsx', 'packages/e2e/src/**/*.test.ts'],
    environment: 'node',
  },
});
