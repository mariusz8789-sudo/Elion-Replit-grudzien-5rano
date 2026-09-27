/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
});

for (const viewport of VIEWPORTS) {
  test(`global menu is a bounded, closable drawer at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    await page.goto('/#/');
    const navigation = page.getByTestId('mobile-navigation');
    await expect(navigation).toBeVisible();
    await navigation.getByRole('button', { name: 'Menu' }).click();

    const drawer = page.getByRole('dialog', { name: 'Pełne menu Genesis' });
    const close = drawer.getByRole('button', { name: 'Zamknij menu' });
    await expect(drawer).toBeVisible();
    await expect(close).toBeVisible();
    await expect(close).toBeFocused();

    const [drawerBox, navigationBox] = await Promise.all([drawer.boundingBox(), navigation.boundingBox()]);
    expect(drawerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    if (drawerBox && navigationBox) {
      expect(drawerBox.x).toBeGreaterThanOrEqual(0);
      expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(drawerBox.height, 'menu must leave the scientific scene visible').toBeLessThanOrEqual(viewport.height * 0.66);
      expect(drawerBox.y + drawerBox.height, 'menu must stop above the bottom navigation').toBeLessThanOrEqual(navigationBox.y + 1);
    }

    const visibleItems = drawer.locator('.shell-nav-item:visible, .shell-nav-more:visible');
    const itemBoxes = await visibleItems.evaluateAll((items) => items.slice(0, 8).map((item) => {
      const box = item.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    }));
    for (let index = 0; index < itemBoxes.length; index += 1) {
      expect(itemBoxes[index].height).toBeGreaterThanOrEqual(40);
      if (index > 0) expect(itemBoxes[index].top).toBeGreaterThanOrEqual(itemBoxes[index - 1].bottom - 1);
    }

    const widths = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);

    await close.click();
    await expect(drawer).toHaveCount(0);

    await navigation.getByRole('button', { name: 'Menu' }).click();
    await expect(page.getByRole('dialog', { name: 'Pełne menu Genesis' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Pełne menu Genesis' })).toHaveCount(0);

    const unexpected = errors.filter((entry) => !entry.includes('Failed to load resource'));
    expect(unexpected, errors.join('\n')).toEqual([]);
  });
}
