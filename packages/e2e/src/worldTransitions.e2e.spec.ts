/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
});

test('supported prompt becomes a canonical WorldGraph and a visible World Director scene', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });

  await page.goto('/#/world-proposal');
  await page.getByTestId('world-proposal-prompt').fill('Miasto badawcze z laboratorium, siecią wodną i epidemiologią.');
  await page.getByTestId('population-count').fill('2500');
  await page.getByTestId('propose-world').click();
  await expect(page.getByTestId('world-proposal-result')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('resolved-via')).toContainText(/MODEL JĘZYKOWY|DETERMINISTYCZNY FALLBACK/);
  await expect(page.getByTestId('proposed-specification')).toContainText('2500');
  await expect(page.getByTestId('world-created')).toContainText('OK');

  await page.goto('/#/world-director');
  await expect(page.getByTestId('world-director-status')).toContainText('LIVE · CANONICAL', { timeout: 30_000 });
  await page.getByTestId('world-director-prompt').fill('Create a Mars research world.');
  await page.getByTestId('world-director-generate').click();
  await expect(page.getByTestId('world-director-product-world')).toContainText('MARS_RESEARCH', { timeout: 30_000 });
  await expect(page.getByTestId('world-director-product-proof')).not.toContainText('—');
  await page.getByTestId('world-director-local-video-check').click();
  await expect(page.getByTestId('world-director-generative-status')).toContainText(/BLOCKED_MODEL_UNAVAILABLE|BLOCKED_GPU_UNAVAILABLE|BLOCKED_RUNTIME/);
  await expect(page.getByTestId('world-director-generative-status')).toContainText('VISUALIZATION ONLY');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Reality Navigator branches one real model state and compares it without claiming another universe', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/#/reality');
  const panel = page.locator('.reality-panel');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel).toContainText('Scientific Model Graph');
  await expect(panel).toContainText('warstwa reżyserska');

  const mass = panel.locator('input[type="range"]').first();
  await mass.fill('2');
  await expect(panel.locator('.reality-log')).toContainText('bo zmieniło się', { timeout: 10_000 });
  await panel.getByRole('button', { name: /Utwórz gałąź/ }).click();
  const compare = panel.getByRole('button', { name: /porównaj/ }).first();
  await compare.click();
  await expect(panel.locator('.reality-compare')).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('Multiverse Nexus is reachable and labels portals as a navigation metaphor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/#/lab/multiverse');
  await page.getByRole('tab', { name: 'Multiverse Nexus' }).click();
  await expect(page.locator('.sim-stage canvas')).toBeVisible({ timeout: 20_000 });
  // The honesty note is collapsed behind its question (90660e64); a learner opens it to read the boundary.
  await page.getByText('Co dokładnie liczy ten model?').first().click();
  await expect(page.getByText(/metafora nawigacyjna Genesis OS/i)).toBeVisible();
  await expect(page.getByText(/Wszystkie portale w tej sali/i)).toBeVisible();
  await expect(page.getByText(/Universe Lab z realnymi, obliczonymi parametrami/i)).toBeVisible();

  expect(errors, errors.join('\n')).toEqual([]);
});
