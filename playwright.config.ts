import { defineConfig } from '@playwright/test';

/**
 * Playwright runner config for the `*.e2e.spec.ts` files that live next to
 * their UI package sources (`packages/ui/src/**`) and in `packages/e2e/src/**`. The other e2e flows in
 * `scripts/*-e2e.mjs` drive the `playwright` library directly and do not use
 * this runner.
 *
 * The app under test is the production server (`packages/backend/src/start.mjs`
 * serving `packages/frontend/dist`); start it first, then run
 * `npx playwright test packages/ui/src/matrix/matrix.e2e.spec.ts`.
 * `GENESIS_BASE_URL` overrides the target; `CHROME` / `GENESIS_CHROMIUM_PATH`
 * point at a system Chromium (the same variables the scripts honour).
 */
const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'packages',
  testMatch: /.*\.e2e\.spec\.ts$/,
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // Specs share one production-like API and its real rate limiter.
  // Serial execution prevents artificial 429 responses without hiding coverage.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080',
    browserName: 'chromium',
    headless: true,
    viewport: { width: 1600, height: 900 },
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
});
