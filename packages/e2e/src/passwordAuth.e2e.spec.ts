/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test, type Page } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

/**
 * D-166 — the show/hide password toggle driven by REAL key presses, and the
 * forgotten-password flow through the real backend.
 *
 * Why this file exists: the vitest suite renders without a DOM
 * (`renderToStaticMarkup`), so it can prove the toggle is a native
 * `<button type="button">` with the right ARIA, but not that a browser
 * actually activates it with Enter and Space. That is what these cases do.
 *
 * Run it against the production server (see playwright.config.ts):
 *   npm run build && npm start
 *   npx playwright test packages/e2e/src/passwordAuth.e2e.spec.ts
 */

const MOBILE = { width: 390, height: 844 } as const;

async function openLogin(page: Page): Promise<void> {
  await page.goto('/#/konto');
  await expect(page.getByRole('tab', { name: 'Zaloguj się' })).toBeVisible();
}

function toggle(page: Page) {
  return page.locator('.password-toggle').first();
}

function passwordInput(page: Page) {
  return page.locator('.password-wrap input').first();
}

test.describe('show/hide password is operable by keyboard', () => {
  test('Tab reaches the toggle and Enter reveals, then hides, the password', async ({ page }) => {
    await openLogin(page);
    const input = passwordInput(page);
    await input.fill('sekretneHaslo1');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    const hiddenLabel = await toggle(page).getAttribute('aria-label');

    // From the password field, the very next tab stop is the toggle.
    await input.focus();
    await page.keyboard.press('Tab');
    await expect(toggle(page)).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');
    const shownLabel = await toggle(page).getAttribute('aria-label');
    expect(shownLabel).not.toBe(hiddenLabel);

    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type', 'password');
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'false');
    expect(await toggle(page).getAttribute('aria-label')).toBe(hiddenLabel);

    // The value itself survived both toggles unchanged.
    await expect(input).toHaveValue('sekretneHaslo1');
  });

  test('Space operates it too, and does not scroll or submit the form', async ({ page }) => {
    await openLogin(page);
    const input = passwordInput(page);
    await input.fill('sekretneHaslo1');
    await toggle(page).focus();
    await page.keyboard.press('Space');
    await expect(input).toHaveAttribute('type', 'text');
    await page.keyboard.press('Space');
    await expect(input).toHaveAttribute('type', 'password');
    // Still on the account screen: Space did not submit anything.
    await expect(page.getByRole('tab', { name: 'Zaloguj się' })).toBeVisible();
  });

  test('Enter inside the password field submits the form instead of clicking the eye', async ({ page }) => {
    await openLogin(page);
    await page.locator('input[type="email"]').first().fill('nie-ma-takiego@lab.org');
    const input = passwordInput(page);
    await input.fill('zleHaslo1234');
    await input.press('Enter');
    // The form was sent: the server answers with its one credentials message.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(input).toHaveAttribute('type', 'password', { timeout: 5_000 });
  });

  test('on a phone the toggle is a comfortable tap target and works by tap', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await openLogin(page);
    const input = passwordInput(page);
    await input.fill('sekretneHaslo1');
    const box = await toggle(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    expect(box!.height).toBeGreaterThanOrEqual(36);
    await toggle(page).tap();
    await expect(input).toHaveAttribute('type', 'text');
  });
});

test.describe('forgotten password', () => {
  test('the login form offers the link, and the request step reports the delivery status honestly', async ({ page }) => {
    await openLogin(page);
    await page.getByTestId('account-forgot-password').click();
    await page.getByRole('textbox').first().fill('ktokolwiek@lab.org');
    await page.getByRole('button', { name: /zmian/i }).click();

    const requested = page.getByTestId('reset-requested');
    await expect(requested).toBeVisible();
    const status = page.getByTestId('reset-delivery-status');
    await expect(status).toBeVisible();
    // The delivery status is whatever the server reported; with no mail
    // provider configured that is EXTERNAL_BLOCKED, and the page says so
    // instead of claiming a message went out.
    const reported = await status.getAttribute('data-delivery-status');
    expect(reported).toBe('EXTERNAL_BLOCKED');
    await expect(status).not.toContainText(/wysłal|wysłano|sprawdź skrzynkę/i);
  });

  test('a token of the wrong shape is refused on the client, with no request sent', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/auth/password-reset/confirm')) calls.push(r.url()); });
    await page.goto('/#/konto?tryb=nowe-haslo');
    await page.getByRole('textbox').first().fill('to-nie-jest-token');
    const fields = page.locator('.password-wrap input');
    await fields.nth(0).fill('noweHaslo123');
    await fields.nth(1).fill('noweHaslo123');
    await page.getByRole('button', { name: /hasł/i }).last().click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(calls).toEqual([]);
  });

  test('an unknown but well-shaped token is refused by the server with one plain sentence', async ({ page }) => {
    await page.goto(`/#/konto?tryb=nowe-haslo&token=${'f'.repeat(64)}`);
    const fields = page.locator('.password-wrap input');
    await fields.nth(0).fill('noweHaslo123');
    await fields.nth(1).fill('noweHaslo123');
    await page.getByRole('button', { name: /hasł/i }).last().click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    // No stack trace, no table name, no SQL — one sentence for the user.
    await expect(alert).not.toContainText(/sqlite|SELECT|password_resets|\.mjs|at /i);
  });
});
