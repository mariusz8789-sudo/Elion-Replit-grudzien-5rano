/* Proprietary / All Rights Reserved - Genesis OS */
// Genesis Mirror e2e (Playwright) on the production server. Proves both the fail-closed
// no-permission path and the real browser stream-capability path under the site's scoped
// `camera=(self)` policy. An open stream proves consent and device access only: Mirror must
// remain SYNTHETIC_FALLBACK / NOT_CALIBRATED until landmark extraction and physical calibration
// are independently validated.
import { test, expect, type Page } from '@playwright/test';

// Chromium launch args must be file-top-level (Playwright forces a fresh worker for any
// per-describe launchOptions override). The fake video device is harmless for the
// permission-denied test below — no permission is ever granted there, so no device is opened.
// Do NOT add `--use-fake-ui-for-media-stream`: Chromium treats it as automatic consent and that
// would invalidate the negative case once the production policy correctly allows camera=(self).
// `test.use({ launchOptions })` REPLACES the whole object rather than merging with
// playwright.config.ts's own `use.launchOptions.executablePath` — re-declared here so the same
// pre-installed Chromium binary (CHROME/GENESIS_CHROMIUM_PATH) is still used, never triggering a
// browser download.
const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream'],
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

test.describe('Genesis Mirror — no OS/browser camera permission granted to this context', () => {
  // Headless Chromium leaves an ungranted getUserMedia prompt pending forever (the UI then honestly
  // stays NOT_REQUESTED). A user who refuses answers the prompt; --deny-permission-prompts is that answer.
  test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}), args: ['--deny-permission-prompts'] } });
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

    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('Genesis Mirror — full OS/browser camera permission + fake device granted', () => {
  test.use({ permissions: ['camera'] });

  test('opens the real browser stream but never upgrades it to tracking or calibration evidence', async ({ page }) => {
    const errors = collectErrors(page);
    await skipOnboarding(page);
    await page.goto('/#/mirror');
    await page.getByTestId('mirror-enter-zone').click();
    await page.getByTestId('mirror-grant-consent').click();

    await expect(page.getByTestId('mirror-camera-status')).toContainText('STREAM_OPEN', { timeout: 15_000 });
    await expect(page.getByTestId('mirror-state')).toHaveText('SYNCING');
    await expect(page.locator('.pilot-provenance')).toContainText('SYNTHETIC_FALLBACK');
    await expect(page.locator('.pilot-provenance')).not.toContainText('MEDIAPIPE');
    await expect(page.getByTestId('mirror-status')).toContainText('NOT_CALIBRATED');

    expect(errors, errors.join('\n')).toEqual([]);
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

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
