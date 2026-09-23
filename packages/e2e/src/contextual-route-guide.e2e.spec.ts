/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
});

test('one voice guide explains model boundaries across all governed product surfaces', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await page.goto('/#/cern-complex');
  await expect(page.getByTestId('context-guide-start')).toBeVisible();
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('TOY_MC_MODEL');
  await page.getByTestId('context-guide-next').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('tory cząstek');
  await page.getByTestId('context-guide-voice-toggle').click();
  await expect(page.getByTestId('context-guide-voice-toggle')).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/#/world-director');
  await expect(page.getByTestId('context-guide')).toHaveCount(0);
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('WorldGraph');
  await page.getByTestId('context-guide-next').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('AI cinematic');

  await page.goto('/#/mirror');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('kalibracji');
  await page.getByTestId('context-guide-next').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('nie jest kopią medyczną');

  await page.goto('/#/cyber');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('kontrolowane dochodzenie');

  await page.goto('/#/gov-campaign');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('nie rekomendacją refundacyjną');

  await page.goto('/#/virtual-bio');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('eksperymenty obliczeniowe');

  await page.goto('/#/campaign');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('Wybierz kandydata');

  await page.goto('/#/human-biology-lab');
  await page.getByTestId('context-guide-start').click();
  await expect(page.getByTestId('context-guide-caption')).toContainText('Nie przedstawia anatomii konkretnego pacjenta');

  const unexpected = errors.filter((entry) => !entry.includes('Failed to load resource'));
  expect(unexpected, errors.join('\n')).toEqual([]);
});
