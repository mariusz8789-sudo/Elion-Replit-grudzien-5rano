/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test('the 3D experiment stays primary while numeric controls remain optional', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('/#/lab/einstein');

  const stage = page.locator('.sim-stage');
  const advanced = page.locator('.lab-advanced-controls');

  await expect(stage.locator('canvas')).toBeVisible();
  await expect(advanced).not.toHaveAttribute('open', '');
  await expect(advanced.locator('input[type="range"]').first()).toBeHidden();

  await advanced.getByText('Parametry i analiza', { exact: true }).click();
  await expect(advanced).toHaveAttribute('open', '');
  await expect(advanced.locator('input[type="range"]').first()).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});
