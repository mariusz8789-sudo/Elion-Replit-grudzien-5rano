/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

function collectUnexpectedErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
});

test('Cyber runs the canonical adaptive investigation and exposes real observations', async ({ page }) => {
  const errors = collectUnexpectedErrors(page);
  await page.goto('/#/cyber');
  await expect(page.getByRole('heading', { name: 'Dochodzenie bezpieczeństwa' })).toBeVisible();
  await expect(page.getByText(/syntetyczna aplikacja/i).first()).toBeVisible();

  await page.getByRole('button', { name: /Uruchom dochodzenie/i }).click();
  await expect(page.getByText('Powierzchnia ataku')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Przebieg adaptacyjny' })).toBeVisible();
  await expect(page.getByText('SIMULATED', { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Government campaign executes its pinned source-backed candidate funnel', async ({ page }) => {
  const errors = collectUnexpectedErrors(page);
  await page.goto('/#/gov-campaign');
  await expect(page.getByRole('heading', { name: /Government Drug Discovery/i })).toBeVisible();
  await expect(page.getByText(/ChEMBL \+ ClinicalTrials\.gov/i)).toBeVisible();

  await page.getByRole('button', { name: 'Uruchom kampanię' }).click();
  await expect(page.getByRole('heading', { name: 'Problem rządowy' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Shortlist/i })).toBeVisible();
  await expect(page.getByText(/Evidence.*provenance|Źródła.*status/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Government services exposes the pinned comparison, claim audit and frozen trigger', async ({ page }) => {
  const errors = collectUnexpectedErrors(page);
  await page.goto('/#/research-console');
  await page.getByText(/Inne eksperymenty i usługi/i).click();
  const services = page.locator('section.settings-section').filter({ hasText: 'D-063 — Government Services' });
  await expect(services.getByText(/D-063 — Government Services/i)).toBeVisible({ timeout: 30_000 });
  await expect(services.getByText(/Nothing is computed until you click/i)).toBeVisible();

  await services.getByRole('button', { name: /Run all three \(PRODUCTION\)/i }).click();

  await expect(services.getByRole('heading', { name: /Candidate vs frozen baseline/i })).toBeVisible({ timeout: 30_000 });
  await expect(services.getByRole('heading', { name: /Claim substantiation audit/i })).toBeVisible();
  await expect(services.getByRole('heading', { name: /Sovereign parametric trigger/i })).toBeVisible();
  await expect(services.getByText(/not a regulatory or derived number/i)).toBeVisible();
  await expect(services.getByText(/Nothing is computed until you click/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
