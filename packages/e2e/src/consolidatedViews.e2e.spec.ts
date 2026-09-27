/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
});

test('Looking Glass is asked from the one Science Chat and has no composer of its own', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const chat = page.getByTestId('science-chat-inline');
  await chat.getByLabel('Wiadomość do Science Chat').fill('/świat Pokaż epidemię przez 60 dni z perspektywy człowieka na ulicy');
  await chat.getByRole('button', { name: 'Wyślij' }).click();
  await expect(page).toHaveURL(/#\/looking-glass\?q=/);
  await expect(page.locator('.lg-turn')).toHaveCount(1);
  await expect(page.locator('.lg-ask')).toContainText('epidemię przez 60 dni');
  await expect(page.locator('.lg-card-status')).toBeVisible();
  await expect(page.locator('.lg-input')).toHaveCount(0);
});

test('old hashes open the consolidated views', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/#/collider');
  await expect(page.getByTestId('collider-chamber')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Kompleks CERN' }).getByRole('button', { name: 'Komora detektora' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/#/city');
  await expect(page.getByRole('navigation', { name: 'Widok miasta' }).getByRole('button', { name: '2D (wydajnościowy)' })).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/#/pilot');
  await expect(page.getByRole('button', { name: 'Zwykły tekst → czat' })).toBeVisible();
  await expect(page.getByPlaceholder(/symuluj epidemię w mieście/)).toHaveCount(0);

  await page.goto('/#/world-director?mode=temporal&place=Warsaw&year=1900&road=1&duration=3');
  await expect(page.getByTestId('temporal-cinematic-canvas')).toBeVisible();
});
