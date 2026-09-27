/* Proprietary / All Rights Reserved - Genesis OS */
import { test, expect } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) }, screenshot: 'off', video: 'off', trace: 'off' });

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }] as const) {
  test(`Chat handoff opens the reference blood microscope at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(600_000); page.setDefaultTimeout(240_000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.setViewportSize(viewport);
    await page.goto('/#/human-biology-lab?specimen=blood&magnification=500');
    await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-world', 'biology', { timeout: 60_000 });
    await expect(page.getByTestId('human-inspector')).toBeVisible();
    await expect(page.getByTestId('human-tab-microscope')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('human-specimen-blood')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('human-blood-scope-note')).toContainText('erytrocyty bez jąder');
    await expect(page.getByTestId('sw-explorer-capture')).toContainText('hyperscope-capture', { timeout: 240_000 });
    await expect(page.getByTestId('sw-explorer-capture')).toContainText('MODEL');
    const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(overflow.body, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport + 1);
    expect(errors).toEqual([]);
  });
}
