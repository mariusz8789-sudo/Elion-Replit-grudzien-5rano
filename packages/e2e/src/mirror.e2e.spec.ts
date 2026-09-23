/* Proprietary / All Rights Reserved - Genesis OS */
// Genesis Mirror e2e (Playwright) on the production server: the REAL browser camera adapter's
// no-camera-permission and permission-denied states. Proves the UI never claims CONNECTED or
// CALIBRATED without real adapter evidence.
//
// REAL, SITE-WIDE FINDING (not a bug in this file): `packages/backend/src/lib.mjs`'s
// `SECURITY_HEADERS['permissions-policy']` is `'camera=(), microphone=(), geolocation=(), ...'`
// — camera is disabled for the ENTIRE origin, unconditionally, on every response. This means
// `getUserMedia` can NEVER succeed on this site today, for ANY page, REGARDLESS of browser/OS
// camera permission grants. Both scenarios below prove the adapter's real, honest behavior under
// that actual constraint: even with Chromium's fake video device AND explicit context
// `permissions: ['camera']` (both scenarios below), the response header still wins and the
// adapter still, correctly, reports a failure — never a fabricated STREAM_OPEN. Enabling a real
// camera-based Mirror flow for users would require the header to be scoped (e.g.
// `camera=(self)`) — a change to shared, security-relevant infrastructure this task does not own
// and therefore does not make; see the final handoff report's blockers.
import { test, expect, type Page } from '@playwright/test';

// Chromium launch args must be file-top-level (Playwright forces a fresh worker for any
// per-describe launchOptions override). The fake video device is harmless for the
// permission-denied test below — no permission is ever granted there, so no device is opened
// regardless of this flag; it only matters once the second describe block also grants 'camera'.
// `test.use({ launchOptions })` REPLACES the whole object rather than merging with
// playwright.config.ts's own `use.launchOptions.executablePath` — re-declared here so the same
// pre-installed Chromium binary (CHROME/GENESIS_CHROMIUM_PATH) is still used, never triggering a
// browser download.
const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  },
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function skipOnboarding(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
}

/** The one expected console message under the site's current `permissions-policy: camera=()` header — a real browser enforcement notice, not a script error. */
const EXPECTED_PERMISSIONS_POLICY_MESSAGE = 'Permissions policy violation: camera is not allowed in this document.';
function unexpectedErrors(errors: readonly string[]): string[] {
  return errors.filter((e) => e !== EXPECTED_PERMISSIONS_POLICY_MESSAGE);
}

test.describe('Genesis Mirror — no OS/browser camera permission granted to this context', () => {
  test('the UI reports PERMISSION_DENIED/ERROR and never claims a connected camera', async ({ page }) => {
    const errors = collectErrors(page);
    await skipOnboarding(page);
    await page.goto('/#/mirror');
    await expect(page.getByTestId('mirror-status')).toBeVisible();
    await expect(page.getByTestId('mirror-state')).toHaveText('MIRROR_IDLE');

    await page.getByTestId('mirror-enter-zone').click();
    await expect(page.getByTestId('mirror-state')).toHaveText('CONSENT_REQUIRED');

    await page.getByTestId('mirror-grant-consent').click();
    await expect(page.getByTestId('mirror-camera-status')).toContainText(/PERMISSION_DENIED|ERROR|UNAVAILABLE/, { timeout: 15_000 });
    await expect(page.getByTestId('mirror-blocked')).toBeVisible();
    await expect(page.getByTestId('mirror-camera-status')).not.toContainText('STREAM_OPEN');

    expect(unexpectedErrors(errors), errors.join('\n')).toEqual([]);
  });
});

test.describe('Genesis Mirror — full OS/browser camera permission + fake device granted', () => {
  test.use({ permissions: ['camera'] });

  test("the site's own permissions-policy still wins: never a fabricated STREAM_OPEN, never MEDIAPIPE, even with full browser-level consent", async ({ page }) => {
    const errors = collectErrors(page);
    await skipOnboarding(page);
    await page.goto('/#/mirror');
    await page.getByTestId('mirror-enter-zone').click();
    await page.getByTestId('mirror-grant-consent').click();

    // Real defense-in-depth: even though this context already granted 'camera' and Chromium has a
    // fake video device available, the SITE's own `permissions-policy: camera=()` response header
    // still blocks getUserMedia at the document level. The adapter must still — and does — report
    // an honest failure, never a fabricated STREAM_OPEN/SYNTHETIC_FALLBACK signal built on top of
    // access it never actually had.
    await expect(page.getByTestId('mirror-camera-status')).toContainText(/PERMISSION_DENIED|ERROR/, { timeout: 15_000 });
    await expect(page.getByTestId('mirror-camera-status')).not.toContainText('STREAM_OPEN');
    await expect(page.locator('.pilot-provenance')).not.toContainText('MEDIAPIPE');

    expect(unexpectedErrors(errors), errors.join('\n')).toEqual([]);
  });
});

test.describe('Genesis Mirror — mobile viewport', () => {
  test('mobile: the panel stays usable and honest at a phone viewport, no layout overflow', async ({ page }) => {
    // Same mobile viewport convention as scientific-worlds.e2e.spec.ts's own mobile test.
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = collectErrors(page);
    await skipOnboarding(page);
    await page.goto('/#/mirror');
    await expect(page.getByTestId('mirror-status')).toBeVisible();
    await expect(page.getByTestId('mirror-state')).toHaveText('MIRROR_IDLE');

    const enterZone = page.getByTestId('mirror-enter-zone');
    await expect(enterZone).toBeVisible();
    const enterZoneBox = await enterZone.boundingBox();
    expect(enterZoneBox && enterZoneBox.x + enterZoneBox.width).toBeLessThanOrEqual(390 + 1);

    await enterZone.click();
    await expect(page.getByTestId('mirror-state')).toHaveText('CONSENT_REQUIRED');
    await expect(page.getByTestId('mirror-grant-consent')).toBeVisible();
    await expect(page.getByTestId('mirror-decline-consent')).toBeVisible();

    // No horizontal scroll/overflow at the phone width.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(390 + 1);

    expect(unexpectedErrors(errors), errors.join('\n')).toEqual([]);
  });
});
