/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test('CERN exposes selectable toy-MC events, deterministic replay, and a separate real CMS path', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

  await page.goto('/#/cern-complex');
  await expect(page.getByTestId('cern-complex')).toBeVisible();
  await page.getByTestId('cern-collide').click();
  await expect(page.getByTestId('cern-event-origin')).toContainText('TOY_MC_MODEL');
  await expect(page.getByTestId('cern-event-origin')).toContainText('NIE DANE DETEKTORA');

  await page.getByTestId('cern-event-2').click();
  await page.getByTestId('cern-detail-UNIVERSITY').click();
  await expect(page.getByTestId('cern-event-readout')).toContainText('Parametry modelu');
  await page.getByTestId('cern-detail-RESEARCH').click();
  await expect(page.getByTestId('cern-event-readout')).toContainText(/EVT-[0-9A-F]+/);

  await page.getByTestId('cern-replay').click();
  await expect(page.getByTestId('cern-replay-status')).toHaveText('REPLAY: MATCH');

  await page.getByTestId('cern-cms-open-data').click();
  await expect(page).toHaveURL(/#\/physics\/cms-z$/);
  await expect(page.getByText(/CMS|Z.*mumu|Open Data/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});
