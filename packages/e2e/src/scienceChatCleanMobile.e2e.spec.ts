/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
  test(`home is one clean visual and one chat at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/');

    const chat = page.getByTestId('science-chat-inline');
    await expect(chat.getByRole('heading', { name: 'Co chcesz zbadać?' })).toBeVisible();
    await expect(chat).not.toContainText('Cześć! Jestem Science Chat');
    await expect(chat.locator('.next-move-panel')).toHaveCount(0);
    await expect(chat.locator('.science-chat-examples')).toHaveCount(0);
    await expect(page.locator('.start-primary-actions')).toBeHidden();

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
