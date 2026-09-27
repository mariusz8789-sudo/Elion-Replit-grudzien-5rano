/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test('a new user sees one product story and enters the real Laboratory', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.removeItem('genesis-os:onboarding/v1'));
  await page.goto('/');

  const intro = page.getByRole('dialog', { name: 'Wprowadzenie do Genesis OS' });
  await expect(intro).toBeVisible();
  await expect(intro).toContainText('ONE CHAT · ONE LABORATORY');
  await expect(intro).toContainText('LIVE COMPUTATIONAL');
  await expect(intro).toContainText('EDUCATIONAL MODEL');
  await expect(intro).toContainText('REAL OBSERVATION');
  await expect(intro).not.toContainText('Przykładowy parametr');

  await intro.getByRole('button', { name: 'Wejdź do Laboratorium' }).click();
  await expect(page).toHaveURL(/#\/scientific-worlds$/);
  await expect(page.getByTestId('scientific-worlds')).toBeVisible();
});

test('the ready example enters the one Chat and creates a canonical titration plan', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('/');

  await expect(page.getByTestId('start-hero')).toBeVisible();
  await expect(page.locator('.ws-stage')).toHaveCount(0);
  await page.getByTestId('door-guided-demo').click();

  const chat = page.locator('.science-chat-inline');
  await expect(chat).toContainText('Oblicz miareczkowanie kwasowo-zasadowe NaOH.');
  await expect(chat).toContainText(/chemistry-titration|miareczkowanie/i);
});

test('one Chat opens the existing live black-hole model in its 3D laboratory', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('/');

  const chat = page.getByTestId('science-chat-inline');
  await chat.getByLabel('Wiadomość do Science Chat').fill('Pokaż czarną dziurę');
  await chat.getByRole('button', { name: 'Wyślij' }).click();
  await expect(page).toHaveURL(/#\/lab\/einstein$/);
  await expect(page.getByRole('img', { name: /Scena 3D: Einstein Lab/i })).toBeVisible();
});
