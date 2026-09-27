/* Proprietary / All Rights Reserved - Genesis OS */
// Molecule World Smart UI e2e (Playwright) — D-133: proves the real-browser WORLD VIEW -> hover ->
// CONTEXTUAL POPUP -> RESEARCH -> RESEARCH DRAWER -> EXPAND/COLLAPSE -> CLOSE -> clean WORLD VIEW
// sequence against the production server, plus the mobile bottom-sheet contract. Uses the SAME
// settled()-on-data-frames pattern `cern-complex.e2e.spec.ts` / `scientific-worlds.e2e.spec.ts`
// already established — no new synchronisation mechanism — and the same VisualFidelityHarness gate.
import { test, expect, type Page } from '@playwright/test';
import { VisualFidelityHarness } from './visual/VisualFidelityHarness.js';

const SHOT = 'artifacts/molecule-world.png';

const settled = async (page: Page, frames = 2): Promise<void> => {
  const root = page.getByTestId('molecule-world');
  const before = Number(await root.getAttribute('data-frames'));
  await expect.poll(async () => Number(await root.getAttribute('data-frames')), { timeout: 120_000 }).toBeGreaterThanOrEqual(before + frames);
};

/**
 * Scans a small grid inside the canvas for a screen point that lands on a real atom mesh. The scene
 * renders a real materialised RDKit molecule — there is no fixed, hardcoded atom position to click —
 * so this finds one the same way a human pointer would: by moving over the rendered geometry until
 * the hover hint (driven by the scene's own real raycast, `moleculeScene3D.ts`'s `handleHover`)
 * appears.
 */
async function findHoveredAtomPoint(page: Page): Promise<{ x: number; y: number; label: string }> {
  const canvas = page.locator('.gsc-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no layout box');
  const hint = page.getByTestId('gx-hover-hint');
  // Dense enough to reliably land on a real atom sphere (small relative to a desktop-width canvas
  // once the app shell's sidebar/topbar chrome is subtracted from it) without guessing any fixed
  // atom coordinate.
  const steps = 30;
  for (let iy = 1; iy < steps; iy++) {
    for (let ix = 1; ix < steps; ix++) {
      const x = box.x + (box.width * ix) / steps;
      const y = box.y + (box.height * iy) / steps;
      await page.mouse.move(x, y);
      if (await hint.isVisible().catch(() => false)) {
        const text = (await hint.textContent()) ?? '';
        return { x, y, label: text };
      }
    }
  }
  throw new Error('no atom mesh found under the pointer across the scan grid — scene may have failed to materialise');
}

test.describe('Molecule World — Smart UI (D-133): WORLD VIEW -> hover -> popup -> research -> drawer -> close', () => {
  test.setTimeout(600000);

  test('desktop: hover identifies a real atom, click opens the popup, BADAJ opens the drawer, close restores a clean world view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

    await page.goto('/#/molecule');
    await page.waitForSelector('.gsc-canvas');
    // `molecule-world` (the frame counter, polled by `settled()`) and `.gx-world-first-shell`
    // (WorldViewShell's own root, carrying `data-world-id`/`data-state`) are two different elements —
    // the screen's outer wrapper and the reusable shell it renders inside — never conflated into one
    // testid.
    const shell = page.locator('.gx-world-first-shell');
    await expect(shell).toHaveAttribute('data-world-id', 'molecular');
    await expect(shell).toHaveAttribute('data-state', 'world');
    await settled(page, 3);
    // Rendered frames alone don't prove atoms exist yet — materialisation is a real, separate
    // network round trip to the RDKit backend (`createBackendGeometrySource`). Wait for the scene's
    // own honest status line before scanning for a hoverable atom mesh.
    await expect(page.getByText(/GEOMETRIA · RDKit/)).toBeVisible({ timeout: 60_000 });

    // WORLD VIEW is dominant by default: no popup, no drawer.
    await expect(page.getByTestId('gx-contextual-popup')).toHaveCount(0);
    await expect(page.getByTestId('gx-research-drawer')).toHaveCount(0);

    // HOVER — a real raycast against real RDKit atom meshes, never a scripted/faked highlight.
    const atom = await findHoveredAtomPoint(page);
    expect(atom.label.length).toBeGreaterThan(0);

    await page.screenshot({ path: SHOT });

    // CLICK — selects the same atom, opens the Contextual Popup, clamped fully inside the viewport
    // (D-133 audit fix: the popup no longer centres blindly above the anchor and can no longer be
    // clipped by the stage's own overflow:hidden).
    await page.mouse.click(atom.x, atom.y);
    const popup = page.getByTestId('gx-contextual-popup');
    await expect(popup).toBeVisible();
    const viewport = page.viewportSize()!;
    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();
    expect(popupBox!.x).toBeGreaterThanOrEqual(0);
    expect(popupBox!.y).toBeGreaterThanOrEqual(0);
    expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(viewport.height);
    // The epistemic badge is honest — a materialised RDKit atom reads REAL, never invented.
    await expect(popup).toContainText(/REAL \(RDKit\)|NOT_MODELLED/);

    // RESEARCH — BADAJ opens the drawer; the world stays visible underneath (D-133 contract), and
    // the popup yields to the drawer rather than the two stacking.
    await page.getByRole('button', { name: 'BADAJ' }).click();
    const drawer = page.getByTestId('gx-research-drawer');
    await expect(drawer).toBeVisible();
    await expect(shell).toHaveAttribute('data-state', 'research');
    await expect(page.getByTestId('gx-contextual-popup')).toHaveCount(0);
    await expect(drawer).toContainText('RESEARCH');

    // EXPAND / COLLAPSE
    await page.getByRole('button', { name: 'Expand' }).click();
    await expect(drawer).toHaveClass(/gx-world-research-drawer--expanded/);
    await page.getByRole('button', { name: 'Collapse' }).click();
    await expect(drawer).not.toHaveClass(/gx-world-research-drawer--expanded/);

    // CLOSE — restores a clean WORLD VIEW: no popup, no drawer, selection cleared.
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('gx-research-drawer')).toHaveCount(0);
    await expect(page.getByTestId('gx-contextual-popup')).toHaveCount(0);
    await expect(shell).toHaveAttribute('data-state', 'world');

    // Scientific state is untouched by any UI interaction above — still the same materialised RDKit
    // molecule and its honest status line, never reset or re-generated by opening/closing UI chrome.
    await expect(page.getByText(/GEOMETRIA · RDKit|RDKit ·/)).toBeVisible();

    const harness = new VisualFidelityHarness();
    const report = harness.inspectFile(SHOT);
    expect(report.ok, `Eyes reject ${SHOT}: ${report.reason ?? 'OK'} (var=${report.metrics?.lumaVariance}, colors=${report.metrics?.uniqueColors16}, edge=${report.metrics?.edgeDensity})`).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  test('mobile: the research drawer becomes a bottom sheet, not a shrunk desktop side rail', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

    await page.goto('/#/molecule');
    await page.waitForSelector('.gsc-canvas');
    await settled(page, 3);
    await expect(page.getByText(/GEOMETRIA · RDKit/)).toBeVisible({ timeout: 60_000 });

    const atom = await findHoveredAtomPoint(page);
    await page.mouse.click(atom.x, atom.y);
    await expect(page.getByTestId('gx-contextual-popup')).toBeVisible();
    await page.getByRole('button', { name: 'BADAJ' }).click();

    const drawer = page.getByTestId('gx-research-drawer');
    await expect(drawer).toBeVisible();
    const box = await drawer.boundingBox();
    // The drawer is `position: absolute` inside `.gx-world-first-shell`, not the raw viewport — on
    // this route that shell sits below `TopBar` and above the mobile tab bar (`.shell-mobilebar`,
    // the same real chrome `scientific-worlds.e2e.spec.ts`'s own mobile test already accounts for),
    // so "pinned to the bottom" means the bottom of THAT container, not `window.innerHeight`.
    const shellBox = await page.locator('.gx-world-first-shell').boundingBox();
    expect(box).not.toBeNull();
    expect(shellBox).not.toBeNull();
    // Bottom sheet: spans (close to) the full viewport width and is pinned to the bottom of its
    // container, not the desktop drawer's own `min(30vw, 480px)` side-rail formula shrunk to fit a
    // 390px screen.
    expect(box!.width).toBeGreaterThan(360);
    expect(box!.y + box!.height).toBeGreaterThanOrEqual(shellBox!.y + shellBox!.height - 4);

    await page.screenshot({ path: 'artifacts/molecule-world-mobile.png' });
    const report = new VisualFidelityHarness().inspectFile('artifacts/molecule-world-mobile.png');
    expect(report.ok, `Eyes reject mobile: ${report.reason ?? 'OK'}`).toBe(true);

    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByTestId('gx-research-drawer')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });
});
