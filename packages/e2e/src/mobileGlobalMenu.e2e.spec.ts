/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test, type Page } from '@playwright/test';

/**
 * Genesis navigation (IA of 3 Oct 2026) in a real browser.
 * Phone: a tab bar (Start · Zapytaj · Przebiegi · Dowody · Więcej) and a full-screen More explorer.
 * Desktop: a collapsible sidebar with six capability groups, and the same explorer beside it.
 * Runs against any server of the built app (`GENESIS_BASE_URL`, e.g. `vite preview`).
 */

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const PHONES = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  return errors;
}

/** Errors that are not the absent backend (a static preview has no /api). */
function realErrors(errors: readonly string[]): string[] {
  return errors.filter((entry) => !/Failed to load resource|\/api\/|ERR_CONNECTION|status of 404|status of 50\d/.test(entry));
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
  expect(widths.body).toBeLessThanOrEqual(widths.viewport + 1);
}

async function expectTargetsAtLeast44(page: Page, selector: string): Promise<void> {
  const small = await page.locator(selector).evaluateAll((els) => els
    .filter((el) => (el as HTMLElement).offsetParent !== null)
    .map((el) => { const r = el.getBoundingClientRect(); return { text: (el.textContent ?? '').trim().slice(0, 40), w: r.width, h: r.height }; })
    .filter((b) => b.w < 44 || b.h < 44));
  expect(small, JSON.stringify(small)).toEqual([]);
}

test.describe('phone', () => {
  test.use({ hasTouch: true, isMobile: true });
for (const viewport of PHONES) {
  test(`phone ${viewport.width}: tab bar, full-screen More explorer, search`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = collectErrors(page);
    await page.goto('/#/');

    const bar = page.getByTestId('mobile-navigation');
    await expect(bar).toBeVisible();
    await expect(page.getByTestId('desktop-navigation')).toBeHidden();
    await expect(bar.locator('.gn-tab')).toHaveCount(5);
    await expectTargetsAtLeast44(page, '[data-testid="mobile-navigation"] .gn-tab');
    await expectNoHorizontalOverflow(page);

    // Real taps on the tab bar.
    await bar.getByRole('link', { name: 'Dowody' }).tap();
    await expect(page).toHaveURL(/#\/evidence$/);
    await expect(bar.getByRole('link', { name: 'Dowody' })).toHaveAttribute('aria-current', 'page');
    await bar.getByRole('link', { name: 'Przebiegi' }).tap();
    await expect(page).toHaveURL(/#\/research-console$/);
    await bar.getByRole('link', { name: 'Start' }).tap();
    await expect(bar.getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');

    // More opens a full-screen explorer; focus lands on Close; Escape closes and returns focus.
    const more = page.getByTestId('mobile-more');
    await more.tap();
    const explorer = page.getByRole('dialog', { name: 'Więcej' });
    await expect(explorer).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('nav-explorer-close')).toBeFocused();
    const box = await explorer.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(box?.height).toBeGreaterThanOrEqual(viewport.height - 1);
    for (const group of ['Badania', 'Eksploruj', 'Dowody', 'Operacje', 'Rezultaty', 'DEMO · pokazy i eksperymenty']) {
      await expect(explorer.getByRole('heading', { name: group })).toBeVisible();
    }
    await expectTargetsAtLeast44(page, '[data-testid="nav-explorer"] a, [data-testid="nav-explorer"] button');
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press('Escape');
    await expect(explorer).toHaveCount(0);
    await expect(more).toBeFocused();

    // Search is always one tap away from More.
    await more.tap();
    await page.getByTestId('explorer-search').tap();
    await expect(page.getByTestId('nav-explorer')).toHaveCount(0);
    const search = page.getByRole('dialog', { name: 'Search Genesis' });
    await expect(search).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);

    // A place in the explorer navigates and closes it.
    await more.tap();
    await page.getByTestId('nav-explorer').getByRole('link', { name: /Fizyka i CERN/ }).tap();
    await expect(page).toHaveURL(/#\/physics\/cms-z$/);
    await expect(page.getByTestId('nav-explorer')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    expect(realErrors(errors), errors.join('\n')).toEqual([]);
  });
}

});

test('desktop 1366: collapsible sidebar, folding groups, explorer, search', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const errors = collectErrors(page);
  await page.goto('/#/');

  const side = page.getByTestId('desktop-navigation');
  await expect(side).toBeVisible();
  await expect(page.getByTestId('mobile-navigation')).toBeHidden();
  await expectNoHorizontalOverflow(page);

  await side.getByRole('link', { name: 'Kontrola lotów nauki' }).click();
  await expect(page).toHaveURL(/#\/flight-control$/);
  await expect(side.getByRole('link', { name: 'Kontrola lotów nauki' })).toHaveAttribute('aria-current', 'page');

  // A group folds (the group of the current page stays open).
  const proof = side.getByRole('button', { name: 'Dowody' });
  await expect(proof).toHaveAttribute('aria-expanded', 'true');
  await proof.click();
  await expect(proof).toHaveAttribute('aria-expanded', 'false');
  await expect(side.getByRole('link', { name: 'Pokój recenzenta' })).toBeHidden();
  await proof.click();

  // Collapse to an icon rail, remembered across a reload.
  const collapse = page.getByTestId('nav-collapse');
  await collapse.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await side.boundingBox())!.width).toBeLessThan(90);
  await page.reload();
  await expect(page.getByTestId('nav-collapse')).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('nav-collapse').click();
  await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(200);

  // More explorer beside the sidebar; Escape closes it and focus returns.
  const more = page.getByTestId('nav-more');
  await more.click();
  const explorer = page.getByRole('dialog', { name: 'Więcej' });
  await expect(explorer).toBeVisible();
  await expect(explorer.getByRole('link', { name: /Cyber/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(explorer).toHaveCount(0);
  await expect(more).toBeFocused();

  await page.getByTestId('nav-search').click();
  await expect(page.getByRole('dialog', { name: 'Search Genesis' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expectNoHorizontalOverflow(page);

  expect(realErrors(errors), errors.join('\n')).toEqual([]);
});
