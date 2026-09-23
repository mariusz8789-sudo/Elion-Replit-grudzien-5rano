/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

const ROUTES = [
  '#/research-console',
  '#/virtual-bio',
  '#/campaign',
  '#/human-biology-lab',
  '#/cern-complex',
  '#/world-director',
] as const;

function primaryContent(page: Page, route: typeof ROUTES[number]) {
  switch (route) {
    case '#/research-console': return page.getByLabel('Pytanie badawcze');
    case '#/virtual-bio': return page.getByRole('heading', { name: 'Virtual Bio Lab' });
    case '#/campaign': return page.getByRole('heading', { name: 'Silnik Przyspieszenia Naukowego' });
    case '#/human-biology-lab': return page.getByTestId('scientific-worlds');
    case '#/cern-complex': return page.getByTestId('cern-complex');
    case '#/world-director': return page.getByTestId('world-director');
  }
}

async function expectInsideViewport(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.documentWidth, `document overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth, `body overflow: ${JSON.stringify(metrics)}`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
});

for (const viewport of VIEWPORTS) {
  test(`mobile layers remain bounded at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

    for (const route of ROUTES) {
      await page.goto(`/${route}`);
      await expect(primaryContent(page, route)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('mobile-navigation')).toBeVisible();
      await expectInsideViewport(page);
    }

    await page.goto('/#/research-console');
    await expect(primaryContent(page, '#/research-console')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('genesis:open-science-chat')));

    const drawer = page.getByTestId('science-chat-drawer');
    const navigation = page.getByTestId('mobile-navigation');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Zamknij Science Chat' })).toBeVisible();

    const [drawerBox, navigationBox] = await Promise.all([drawer.boundingBox(), navigation.boundingBox()]);
    expect(drawerBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    if (drawerBox && navigationBox) {
      expect(drawerBox.x).toBeGreaterThanOrEqual(0);
      expect(drawerBox.x + drawerBox.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(drawerBox.y).toBeGreaterThanOrEqual(0);
      expect(drawerBox.y + drawerBox.height, 'drawer must end above mobile navigation').toBeLessThanOrEqual(navigationBox.y + 1);
    }

    const nextMove = drawer.getByLabel('Next Move');
    await expect(nextMove).toBeVisible();
    const nextMoveBox = await nextMove.boundingBox();
    if (drawerBox && nextMoveBox) {
      expect(nextMoveBox.y).toBeGreaterThanOrEqual(drawerBox.y);
      expect(nextMoveBox.y + nextMoveBox.height).toBeLessThanOrEqual(drawerBox.y + drawerBox.height + 1);
    }
    await expectInsideViewport(page);
    await drawer.getByRole('button', { name: 'Zamknij Science Chat' }).click();
    await expect(drawer).toHaveCount(0);
    await expect(primaryContent(page, '#/research-console')).toBeVisible();

    const unexpected = errors.filter((entry) => !entry.includes('Failed to load resource'));
    expect(unexpected, errors.join('\n')).toEqual([]);
  });
}

test('desktop Research Console layout remains unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/research-console');
  await expect(primaryContent(page, '#/research-console')).toBeVisible();
  await expect(page.getByTestId('mobile-navigation')).toBeHidden();
  await expectInsideViewport(page);
});
