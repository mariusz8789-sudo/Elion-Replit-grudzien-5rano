/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test('central laboratory doors open real existing Genesis rooms', async ({ page }) => {
  // Walks several WebGL rooms; in headless software GL each actionability check waits on ~1 s frames.
  // Same budget convention as the other 3D specs (cernLiveExecution, mainLaboratoryProduct).
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

  await page.goto('/#/lab-fpv');
  await expect(page.getByTestId('lab-campus-doors')).toBeVisible();
  await page.getByTestId('lab-door-cern').click();
  await expect(page).toHaveURL(/#\/cern-complex$/);
  await expect(page.getByTestId('cern-complex')).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/lab-fpv');
  await page.getByTestId('lab-door-human').click();
  await expect(page).toHaveURL(/#\/human-biology-lab$/);
  await expect(page.locator('body')).toContainText(/Human|Człowiek/i);

  await page.goto('/#/lab-fpv');
  await page.getByTestId('lab-door-cell').click();
  await expect(page).toHaveURL(/#\/cell-lab$/);
  await expect(page.getByTestId('cell-lab-panel')).toBeVisible({ timeout: 15_000 });

  expect(errors).toEqual([]);
});
