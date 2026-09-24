/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

async function openLab(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('/#/scientific-worlds');
  await expect(page.getByTestId('scientific-worlds')).toBeVisible();
}

for (const viewport of VIEWPORTS) {
  test(`main laboratory stays world-first at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await openLab(page);

    const controls = page.getByTestId('sw-controls');
    const primary = page.locator('.sw-lab-primary');
    const navigation = page.getByTestId('mobile-navigation');
    await expect(controls).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('sw-evidence').getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: 'Strefy laboratorium' })).toContainText('Drug Discovery');
    await expect(page.getByRole('navigation', { name: 'Strefy laboratorium' })).toContainText('Chemistry');
    await expect(page.getByRole('navigation', { name: 'Strefy laboratorium' })).toContainText('Physics');

    const [primaryBox, navigationBox] = await Promise.all([primary.boundingBox(), navigation.boundingBox()]);
    expect(primaryBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    if (primaryBox && navigationBox) {
      expect(primaryBox.height).toBeLessThan(viewport.height * 0.3);
      expect(primaryBox.y + primaryBox.height).toBeLessThanOrEqual(navigationBox.y + 1);
    }

    await controls.click();
    await expect(controls).toHaveAttribute('aria-expanded', 'true');
    const advanced = page.locator('#sw-advanced-controls');
    await expect(advanced).toBeVisible();
    const advancedBox = await advanced.boundingBox();
    if (advancedBox && navigationBox) expect(advancedBox.y + advancedBox.height).toBeLessThanOrEqual(navigationBox.y + 1);

    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
    expect(errors.filter((entry) => !entry.includes('Failed to load resource'))).toEqual([]);
  });
}

test('canonical titration runs in the laboratory and replays without fake progress', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openLab(page);
  await page.getByTestId('sw-controls').click();
  await page.getByTestId('sw-quick-miareczkowanie').click();
  const result = page.getByTestId('sw-titration-context');
  await expect(result).toBeVisible({ timeout: 240_000 });
  await expect(result).toContainText('CHEMIA · MODEL OBLICZENIOWY');
  await expect(result).toContainText('pH');
  await expect(result).toContainText('rekonstrukcją edukacyjną');

  await page.getByTestId('sw-evidence').getByRole('button').click();
  await expect(page.getByTestId('sw-session')).toBeVisible();
  await page.getByTestId('sw-replay').click();
  await expect(page.getByTestId('sw-replay-verdict')).toHaveText(/MATCH/);
});
