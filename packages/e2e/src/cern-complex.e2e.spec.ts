/* Proprietary / All Rights Reserved - Genesis OS */
// CERN complex e2e (Playwright) against the production server. Delivered spec kept in shape; the fixed
// `waitForTimeout` sleeps were replaced by waiting for rendered frames (`data-frames` on the route root),
// because a composer frame under software WebGL can take longer than any fixed sleep — the screenshots
// must show the mode they claim. Four artifacts land in artifacts/ and the VisualFidelityHarness ("the Eyes")
// rejects any of them that is flat, black, wireframe-dominated or colour-poor.
import { test, expect, type Page } from '@playwright/test';
import { VisualFidelityHarness } from './visual/VisualFidelityHarness.js';
const SHOTS = {
  walk: 'artifacts/walk-5d.png',
  glass: 'artifacts/glass-refraction.png',
  console: 'artifacts/console-pbr.png',
  tunnel: 'artifacts/tunnel-volumetric.png',
} as const;
const settled = async (page: Page, frames = 2): Promise<void> => {
  const root = page.getByTestId('cern-complex');
  const before = Number(await root.getAttribute('data-frames'));
  await expect.poll(async () => Number(await root.getAttribute('data-frames')), { timeout: 120_000 }).toBeGreaterThanOrEqual(before + frames);
};
test.describe('CERN Complex 5D — cameras, physics, visual fidelity gate', () => {
  test.setTimeout(1500000);
  test('4 camera modes + high-res artifacts must pass the Eyes (PBR depth)', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/cern-complex');
    await page.waitForSelector('.cern-stage canvas');
    await expect(page.getByText('SCIENTIFIC OS', { exact: true })).toBeVisible();
    await settled(page, 3);
    await page.keyboard.press('1'); await settled(page);
    await expect(page.getByText('MODE: WALK')).toBeVisible();
    await page.screenshot({ path: SHOTS.walk });
    await page.keyboard.press('2'); await settled(page);
    await expect(page.getByText('MODE: GLASS')).toBeVisible();
    await page.screenshot({ path: SHOTS.glass });
    await page.keyboard.press('3'); await settled(page);
    await expect(page.getByText('MODE: CONSOLE')).toBeVisible();
    await page.keyboard.press('q'); await settled(page);
    await expect(page.getByText(/contentHash:/).first()).toBeVisible();
    await expect(page.getByTestId('cern-event-origin')).toContainText('TOY_MC_MODEL');
    await page.getByTestId('cern-event-2').click();
    await page.getByTestId('cern-detail-RESEARCH').click();
    await expect(page.getByTestId('cern-event-readout')).toContainText(/EVT-[0-9A-F]+/);
    await page.getByTestId('cern-replay').click();
    await expect(page.getByTestId('cern-replay-status')).toHaveText('REPLAY: MATCH');
    await page.screenshot({ path: SHOTS.console });
    // The HUD panels are the honest readout of the same providers: 13 TeV alone forms nothing, the ADD scenario is labelled speculative.
    // (Done before TUNNEL: entering the ring requests pointer lock, which is where mouse clicks stop being ordinary.)
    await page.getByTestId('cern-sqrts').fill('13000');
    await page.getByTestId('cern-add').fill('');
    await page.getByTestId('cern-simulate').click();
    await expect(page.getByTestId('cern-bh-readout')).toHaveAttribute('data-formed', '0');
    await page.getByTestId('cern-add').fill('5');
    await page.getByTestId('cern-simulate').click();
    await expect(page.getByTestId('cern-bh-label')).toContainText('ADD_TEV_SPECULATIVE · speculative');
    await expect(page.getByTestId('cern-bh-ledger-hash')).toContainText(/contentHash [0-9a-f]{64}/);
    await expect(page.getByText('MODE: CONSOLE')).toBeVisible(); // digits typed into the HUD never switch the camera
    await page.getByTestId('cern-preset').selectOption('SrTiO3');
    await page.getByTestId('cern-synthesize').click();
    await expect(page.getByTestId('cern-mat-readout')).toContainText('perovskite');
    await expect(page.getByTestId('cern-mat-ledger-hash')).toContainText(/contentHash [0-9a-f]{64}/);
    // Leave the panel (its key events stay inside it by design) before the camera keys.
    await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); });
    await page.keyboard.press('4'); await settled(page);
    await expect(page.getByText('MODE: TUNNEL')).toBeVisible();
    await page.screenshot({ path: SHOTS.tunnel });
    await page.keyboard.press('e'); await settled(page);
    await expect(page.getByText('HORIZON: FORMED')).toBeVisible();
    await expect(page.getByText(/r_s:/).first()).toBeVisible();
    const harness = new VisualFidelityHarness();
    for (const path of Object.values(SHOTS)) {
      const report = harness.inspectFile(path);
      expect(report.ok, `Eyes reject ${path}: ${report.reason ?? 'OK'} (var=${report.metrics?.lumaVariance}, colors=${report.metrics?.uniqueColors16}, edge=${report.metrics?.edgeDensity})`).toBe(true);
    }
    expect(pageErrors).toEqual([]);
  });
});
