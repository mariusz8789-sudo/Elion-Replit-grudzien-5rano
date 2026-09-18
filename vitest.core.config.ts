import { defineConfig } from 'vitest/config';

/**
 * packages/core and packages/ui are source-only packages (no package.json of their own): the
 * frontend consumes them through the `@genesis/core` alias and the backend through an esbuild
 * bundle. This config runs their vitest suites from the repo root: `npm run test:core`.
 */
export default defineConfig({
  test: {
    include: ['packages/core/src/**/*.test.ts', 'packages/ui/src/**/*.test.ts', 'packages/ui/src/**/*.test.tsx'],
    environment: 'node',
  },
});
