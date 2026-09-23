/* Proprietary / All Rights Reserved - Genesis OS */
// Voice guide + product reachability smoke (Playwright, real Chromium, production server).
import { test, expect, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

async function openMoreMenu(page: Page): Promise<void> {
  const more = page.locator('.shell-nav-more');
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

async function gotoViaMenu(page: Page, label: string, expectHeading: string | RegExp): Promise<void> {
  await page.goto('/#/');
  await openMoreMenu(page);
  await page.getByRole('button', { name: label }).first().click();
  await expect(page.getByText(expectHeading).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Voice guide + product reachability', () => {
  test('existing scientific surfaces are reachable from the real sidebar menu', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

    await gotoViaMenu(page, 'Kompleks CERN', /SCIENTIFIC OS|CERN/i);
    expect(page.url()).toContain('#/cern-complex');
    await gotoViaMenu(page, 'Cyber', /Cyber/i);
    expect(page.url()).toContain('#/cyber');
    await gotoViaMenu(page, 'Genesis Mirror', /Mirror/i);
    expect(page.url()).toContain('#/mirror');
    await gotoViaMenu(page, 'World Director', /World Director/i);
    expect(page.url()).toContain('#/world-director');
    await gotoViaMenu(page, 'Virtual Lab', /Virtual Bio Lab|Wirtualne laboratorium|B-CELL|B-PBPK/i);
    expect(page.url()).toContain('#/virtual-bio');
    await gotoViaMenu(page, 'Government Drug Discovery', /Government Drug Discovery/i);
    expect(page.url()).toContain('#/gov-campaign');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the voice guide starts, captions, mutes, and stops', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/research-console');
    await expect(page.getByTestId('start-guide')).toBeVisible({ timeout: 20_000 });

    const speechAvailable = await page.evaluate(() => {
      if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
      try { window.speechSynthesis.getVoices(); return true; } catch { return false; }
    });

    await page.getByTestId('start-guide').click();
    const overlay = page.getByTestId('guide-overlay');
    const caption = page.getByTestId('guide-caption');
    await expect(overlay).toBeVisible({ timeout: 10_000 });
    await expect(caption).toBeVisible();
    expect(((await caption.textContent()) ?? '').trim().length).toBeGreaterThan(0);

    const voiceToggle = page.getByTestId('guide-voice-toggle');
    const wasOn = (await voiceToggle.getAttribute('aria-pressed')) === 'true';
    await voiceToggle.click();
    await expect(voiceToggle).toHaveAttribute('aria-pressed', wasOn ? 'false' : 'true');
    await expect(caption).toBeVisible();
    await voiceToggle.click();
    await expect(voiceToggle).toHaveAttribute('aria-pressed', wasOn ? 'true' : 'false');
    await page.locator('.guide-close').click();
    await expect(overlay).toBeHidden({ timeout: 5_000 });
    expect(errors, errors.join('\n')).toEqual([]);
    test.info().annotations.push({ type: 'speechSynthesis-available', description: String(speechAvailable) });
  });
});
