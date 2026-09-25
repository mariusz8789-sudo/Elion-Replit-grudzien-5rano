/* Proprietary / All Rights Reserved - Genesis OS */
import { expect, test } from '@playwright/test';

const chromiumPath = process.env.CHROME ?? process.env.GENESIS_CHROMIUM_PATH;
test.use({ launchOptions: { ...(chromiumPath ? { executablePath: chromiumPath } : {}) } });

const API = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';

async function post(path: string, token: string | null, body: unknown): Promise<Record<string, any>> {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return r.json() as Promise<Record<string, any>>;
}

/**
 * QUESTION → HYPOTHESIS → PLAN → CONFIRM → LIVE LAB: the ONE chat grounds the question, freezes the
 * hypothesis and shows the plan BEFORE any engine runs; confirming opens the drug bench of the ONE
 * laboratory, where the real campaign starts in front of the user.
 */
test('the one chat freezes the hypothesis and plan, then confirmation runs it live at the lab bench', async ({ page }) => {
  test.setTimeout(420_000);
  const reg = await post('/api/auth/register', null, { email: `live-chat-${Date.now()}@lab.org`, password: 'password123' });
  await post('/api/projects', reg.token, { name: 'Live chat drug run' });
  await page.addInitScript(({ t, u }) => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
    window.localStorage.setItem('genesis-os:session/v1', JSON.stringify({ token: t, user: u }));
  }, { t: reg.token, u: reg.user });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  const chat = page.getByTestId('science-chat-inline');
  await chat.getByLabel('Wiadomość do Science Chat').fill('Find drug candidates for Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1');
  await chat.getByRole('button', { name: 'Wyślij' }).click();

  const hypothesis = page.getByTestId('drug-hypothesis');
  await expect(hypothesis).toBeVisible({ timeout: 120_000 });
  await expect(hypothesis).toContainText('HIPOTEZA');
  await expect(hypothesis).toContainText('AutoDock Vina');
  await expect(hypothesis).toContainText('PDB 1IEP');
  await expect(hypothesis).toContainText('krytyczne — falsyfikator');
  expect(await hypothesis.getAttribute('data-fingerprint')).toMatch(/^[0-9a-f]{8}$/);

  await page.getByTestId('drug-open-live-lab').click();
  await expect(page).toHaveURL(/#\/scientific-worlds\?.*station=st-drug-bench/);
  const live = page.getByTestId('drug-bench-live');
  await expect(live).toBeVisible({ timeout: 300_000 });
  await expect(live).toHaveAttribute('data-phase', /RUNNING_CAMPAIGN|RUNNING_STAGE|DONE/);
});
