/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`home is one clean visual and one chat at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/');
    // Ask is a separate view since the Dashboard decision (2026-09-29): open the one ScienceChat first.
    await page.getByRole('button', { name: 'Otwórz Science Chat' }).click();
    const chat = page.getByTestId('science-chat-drawer');
    await expect(chat.getByRole('heading', { name: 'What do you want to investigate?' })).toBeVisible();
    await expect(chat).not.toContainText('Cześć! Jestem Science Chat');
    await expect(chat.locator('.next-move-panel')).toHaveCount(0);
    await expect(chat.locator('.science-chat-examples')).toHaveCount(0);
    await expect(page.locator('.start-primary-actions')).toBeHidden();

    // Start now reads top to bottom (what Genesis is, the evidence, then the chat), so the chat is the
    // last thing on the page: scroll to it, then its input must still clear the fixed bottom bar.
    await page.evaluate(() => { const s = document.querySelector('.shell-main-split'); if (s) s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(200);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      route: document.querySelector('.shell-route')?.getBoundingClientRect().height ?? 0,
      chat: document.querySelector('.shell-chat')?.getBoundingClientRect().height ?? 0,
      navTop: document.querySelector('[data-testid="mobile-navigation"]')?.getBoundingClientRect().top ?? 0,
      formBottom: document.querySelector('.science-chat-form')?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(geometry.overflow).toBe(false);
    expect(geometry.route).toBeGreaterThan(150);
    expect(geometry.chat).toBeGreaterThan(300);
    expect(geometry.formBottom).toBeLessThanOrEqual(geometry.navTop + 1);
  });
}
