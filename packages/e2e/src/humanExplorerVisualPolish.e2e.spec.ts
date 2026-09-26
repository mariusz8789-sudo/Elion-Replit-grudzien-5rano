/* Proprietary / All Rights Reserved - Genesis OS */
// Human Explorer visual polish (Playwright, real Chromium, production server). Geometry and DOM only:
// this spec deliberately takes NO screenshots and records NO video.
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) }, screenshot: 'off', video: 'off', trace: 'off' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
});

async function openExplorer(page: Page): Promise<void> {
  await page.goto('/#/human-biology-lab');
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-world', 'biology', { timeout: 60_000 });
  await expect(page.getByTestId('sw-explorer')).toBeVisible({ timeout: 60_000 });
}

async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`${testId} has no layout box`);
  return b;
}

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }] as const) {
  test(`mobile ${viewport.width}×${viewport.height}: world-first hero, drawer, no overflow`, async ({ page }) => {
    test.setTimeout(600_000);
    page.setDefaultTimeout(240_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewportSize(viewport);
    await openExplorer(page);

    await expect(page.getByTestId('human-inspector')).toBeHidden();
    await expect(page.getByTestId('human-hero-organ')).toBeVisible();

    const overflow = await page.evaluate(() => ({ vw: window.innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(overflow.doc, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.vw + 1);
    expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.vw + 1);

    // The world-first hero may span the scene, but its controls stay collapsed and above navigation.
    const nav = await box(page, 'mobile-navigation');
    const toggle = await box(page, 'human-inspector-toggle');
    expect(toggle.y + toggle.height).toBeLessThanOrEqual(nav.y + 1);

    // The drawer opens the grouped controls and stays inside the viewport, above the bottom navigation.
    await page.getByTestId('human-inspector-toggle').click();
    await expect(page.getByTestId('human-inspector')).toBeVisible();
    await expect(page.getByTestId('sw-explorer-organ-heart')).toBeVisible();
    const open = await box(page, 'human-inspector');
    expect(open.height / viewport.height, `inspector ${open.height}px of ${viewport.height}px`).toBeLessThanOrEqual(0.31);
    expect(open.y).toBeGreaterThanOrEqual(0);
    expect(open.y + open.height).toBeLessThanOrEqual(nav.y + 1);
    expect(open.x + open.width).toBeLessThanOrEqual(viewport.width + 1);
    await page.getByTestId('human-inspector-toggle').click();
    await expect(page.getByTestId('human-inspector')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('desktop: grouped controls stay reachable; presentation changes never seal a session', async ({ page }) => {
  // Software GL in CI renders a frame every few seconds at this size (the same on the base commit);
  // actions wait for the main thread, exactly as in scientific-worlds.e2e.spec.ts.
  test.setTimeout(900_000);
  page.setDefaultTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExplorer(page);
  await expect.poll(async () => Number(await page.getByTestId('scientific-worlds').getAttribute('data-frames')), { timeout: 300_000 }).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('human-inspector-toggle')).toBeVisible();
  await page.getByTestId('human-inspector-toggle').click();
  await expect(page.getByTestId('sw-explorer-organ-heart')).toBeVisible();
  await expect(page.getByTestId('sw-explorer-provenance')).toBeHidden();
  await page.getByTestId('human-tab-research').click();
  await expect(page.getByTestId('sw-explorer-provenance')).toBeVisible();

  const capture = await page.getByTestId('sw-explorer-scope').getAttribute('data-capture');
  await page.getByTestId('human-tab-section').click();
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');
  await page.getByTestId('sw-explorer-twin-camera').click();
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'SPECTATOR');
  await page.getByTestId('sw-explorer-twin-camera').click();
  await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');
  await page.getByTestId('sw-explorer-cut-toggle').click();
  await expect(page.getByTestId('sw-explorer-section')).toHaveAttribute('data-cutaway', 'on');
  await page.getByTestId('sw-explorer-axis-coronal').click();
  await page.getByTestId('sw-explorer-surface-xray').click();
  await expect(page.getByTestId('sw-explorer-surface')).toHaveAttribute('data-surface', 'XRAY');
  await expect(page.getByTestId('sw-explorer-observation-status')).toContainText('No validated subject observation attached');
  await expect(page.getByTestId('sw-explorer-tier')).toContainText('MODEL');
  await expect(page.getByTestId('sw-explorer-scope')).toHaveAttribute('data-capture', capture ?? '');
  expect(errors).toEqual([]);
});
