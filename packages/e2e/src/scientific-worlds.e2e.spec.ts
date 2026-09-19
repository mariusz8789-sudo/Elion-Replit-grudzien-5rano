/* Proprietary / All Rights Reserved - Genesis OS */
// Scientific Worlds e2e (Playwright) on the production server: the acceptance sentence typed into the
// HUD, the suited agent walking to the synthesizer and working the console (watched through the visor),
// ONE ExperimentSession sealed with ledger hashes, the result rendered in the world, replay MATCH, and
// the same flow at the epidemiology desk. Desktop and mobile screenshots land in artifacts/ and pass
// the VisualFidelityHarness ("the Eyes").
import { test, expect, type Page } from '@playwright/test';
import { VisualFidelityHarness } from './visual/VisualFidelityHarness.js';

const SHOTS = {
  visorIdle: 'artifacts/scientific-worlds-visor-idle.png',
  walking: 'artifacts/scientific-worlds-walking.png',
  hands: 'artifacts/scientific-worlds-hands-console.png',
  result: 'artifacts/scientific-worlds-result.png',
  spectator: 'artifacts/scientific-worlds-spectator.png',
  epidemic: 'artifacts/scientific-worlds-epidemic.png',
  mobile: 'artifacts/scientific-worlds-mobile.png',
} as const;

const settled = async (page: Page, frames = 2): Promise<void> => {
  const root = page.getByTestId('scientific-worlds');
  const before = Number(await root.getAttribute('data-frames'));
  await expect.poll(async () => Number(await root.getAttribute('data-frames')), { timeout: 180_000 }).toBeGreaterThanOrEqual(before + frames);
};
const waitState = async (page: Page, states: readonly string[], timeout = 240_000): Promise<void> => {
  await expect.poll(async () => page.getByTestId('scientific-worlds').getAttribute('data-agent-state'), { timeout }).toMatch(new RegExp(`^(${states.join('|')})$`));
};

test.describe('Scientific Worlds — command → agent → session → evidence → replay', () => {
  test.setTimeout(1_500_000);
  test('desktop: the acceptance sentence end to end, through the visor', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/scientific-worlds');
    const root = page.getByTestId('scientific-worlds');
    await expect(root).toBeVisible();
    await expect(page.getByTestId('sw-canvas')).toBeVisible();
    await expect(page.getByTestId('sw-no-session')).toBeVisible();
    await settled(page, 3);
    await page.screenshot({ path: SHOTS.visorIdle });

    // The acceptance sentence.
    await page.getByTestId('sw-input').fill('Idź do laboratorium i uruchom eksperyment na syntezie kryształu. Potem pokaż mi, co otrzymałeś i skąd to pochodzi.');
    await page.getByTestId('sw-send').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Rozumiem 3 polecenia: NAVIGATE → ALIGN → REACH → INTERACT → EXECUTE → OBSERVE → REPORT');
    await waitState(page, ['MOVING_TO_TARGET']);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.walking });
    await waitState(page, ['REACHING', 'INTERACTING', 'EXECUTING', 'OBSERVING']);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.hands });
    await expect(page.getByTestId('sw-session')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('sw-epistemic')).toHaveText('MODEL');
    await expect(page.getByTestId('sw-ledger-hash').first()).toContainText(/contentHash [0-9a-f]{64}/);
    await expect(page.getByTestId('sw-content-hash')).toContainText(/^[0-9a-f]{64}$/);
    await expect(page.getByTestId('sw-outputs')).toContainText('lattice: rock-salt');
    await waitState(page, ['IDLE']);
    await expect(page.getByTestId('sw-transcript')).toContainText('Otrzymałem strukturę');
    await expect(page.getByTestId('sw-transcript')).toContainText('Skąd to pochodzi');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.result });
    const sessionId = await page.getByTestId('sw-session').getAttribute('data-session-id');

    // Replay: rebuilt, rerun, compared.
    await page.getByTestId('sw-replay').click();
    await expect(page.getByTestId('sw-replay-verdict')).toHaveText(/MATCH/);
    await expect(page.getByTestId('sw-transcript')).toContainText('MATCH');
    expect(await page.getByTestId('sw-session').getAttribute('data-session-id')).toBe(sessionId);

    // Spectator camera shows the suited body from outside.
    await page.getByTestId('sw-camera').click();
    await expect(root).toHaveAttribute('data-camera', 'SPECTATOR');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.spectator });
    await page.getByTestId('sw-camera').click();
    await expect(root).toHaveAttribute('data-camera', 'VISOR');

    // Second world station: the epidemiology desk (SEIRD), same contract.
    await page.getByTestId('sw-quick-epidemia').click();
    await waitState(page, ['MOVING_TO_TARGET']);
    await expect.poll(async () => page.getByTestId('sw-session').getAttribute('data-session-id'), { timeout: 300_000 }).not.toBe(sessionId);
    await expect(page.getByTestId('sw-epistemic')).toHaveText('SIMULATION');
    await expect(page.getByTestId('sw-outputs')).toContainText('peakInfected');
    await waitState(page, ['IDLE']);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.epidemic });

    const harness = new VisualFidelityHarness();
    for (const path of [SHOTS.visorIdle, SHOTS.walking, SHOTS.hands, SHOTS.result, SHOTS.spectator, SHOTS.epidemic]) {
      const report = harness.inspectFile(path);
      expect(report.ok, `Eyes reject ${path}: ${report.reason ?? 'OK'} (var=${report.metrics?.lumaVariance}, colors=${report.metrics?.uniqueColors16})`).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('mobile: HUD stays usable, command bar above the bottom navigation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/scientific-worlds');
    await expect(page.getByTestId('scientific-worlds')).toBeVisible();
    await settled(page, 2);
    const input = page.getByTestId('sw-input');
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    const bar = await page.locator('.shell-mobilebar').boundingBox();
    expect(box && bar ? box.y + box.height <= bar.y + 1 : true).toBe(true);
    await page.getByTestId('sw-quick-okno').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Rozumiem 1 polecenie: NAVIGATE');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.mobile });
    const report = new VisualFidelityHarness().inspectFile(SHOTS.mobile);
    expect(report.ok, `Eyes reject mobile: ${report.reason ?? 'OK'}`).toBe(true);
    expect(errors).toEqual([]);
  });
});
