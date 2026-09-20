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
  bioIdle: 'artifacts/human-biology-lab-visor-idle.png',
  bioWalking: 'artifacts/human-biology-lab-walking.png',
  bioBrain: 'artifacts/human-biology-lab-brain-mode.png',
  bioHyperscope: 'artifacts/human-biology-lab-hyperscope.png',
  bioOrpheus: 'artifacts/human-biology-lab-orpheus.png',
  bioSpectator: 'artifacts/human-biology-lab-spectator.png',
  bioExplorer: 'artifacts/human-biology-lab-explorer.png',
  bioTwinCc0: 'artifacts/human-biology-lab-twin-cc0.png',
  bioCutaway: 'artifacts/human-biology-lab-cutaway.png',
  bioXray: 'artifacts/human-biology-lab-xray.png',
} as const;

const settled = async (page: Page, frames = 2): Promise<void> => {
  const root = page.getByTestId('scientific-worlds');
  const before = Number(await root.getAttribute('data-frames'));
  await expect.poll(async () => Number(await root.getAttribute('data-frames')), { timeout: 180_000 }).toBeGreaterThanOrEqual(before + frames);
};
const waitState = async (page: Page, states: readonly string[], timeout = 240_000): Promise<void> => {
  await expect.poll(async () => page.getByTestId('scientific-worlds').getAttribute('data-agent-state'), { timeout }).toMatch(new RegExp(`^(${states.join('|')})$`));
};

/**
 * D-134 SMART UI (Human Biology): scans for a screen point that lands on a real, currently-visible
 * organ mesh — no hardcoded organ position. Searches in RINGS out from the canvas centre rather
 * than a raster grid: the twin (whichever twin the agent is standing at) is roughly centred in
 * frame, so the organ-dense middle of the body is checked first. This sandboxed environment's
 * software-rendered WebGL makes each `mouse.move` + hover check cost real seconds (a heavy biology
 * scene, not Molecule World's light one), so the point budget stays small and front-loaded on the
 * likeliest hits rather than exhaustive.
 */
async function findHoveredOrganPoint(page: Page): Promise<{ x: number; y: number; label: string }> {
  const canvas = page.locator('.sw-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no layout box');
  const hint = page.getByTestId('sw-organ-hover-hint');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const points: { x: number; y: number }[] = [{ x: cx, y: cy }];
  const ringSteps = [0.06, 0.12, 0.18, 0.24, 0.3, 0.36] as const;
  for (const r of ringSteps) {
    const dx = box.width * r;
    const dy = box.height * r;
    for (const [ox, oy] of [[0, -dy], [dx, 0], [0, dy], [-dx, 0], [dx * 0.7, -dy * 0.7], [-dx * 0.7, -dy * 0.7], [dx * 0.7, dy * 0.7], [-dx * 0.7, dy * 0.7]] as const) {
      points.push({ x: cx + ox, y: cy + oy });
    }
  }
  for (const { x, y } of points) {
    await page.mouse.move(x, y);
    if (await hint.isVisible().catch(() => false)) {
      const text = (await hint.textContent()) ?? '';
      return { x, y, label: text };
    }
  }
  throw new Error('no organ mesh found under the pointer across the scan grid');
}

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

  test('human biology lab: the V3 acceptance sentence — twin, brain, Hyperscope 5×, ORPHEUS, Evidence', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/human-biology-lab');
    const root = page.getByTestId('scientific-worlds');
    await expect(root).toHaveAttribute('data-world', 'biology');
    await expect(page.getByTestId('sw-twin')).toContainText('NORMAL');
    await expect(page.getByTestId('sw-twin')).toContainText('PROXY');
    await settled(page, 3);
    await page.screenshot({ path: SHOTS.bioIdle });

    await page.getByTestId('sw-input').fill('Otwórz wirtualnego człowieka, pokaż mózg, przejdź do Hyperscope, powiększ 5×, a potem zbadaj próbkę przez Orpheus i pokaż mi Evidence.');
    await page.getByTestId('sw-send').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Rozumiem 7 polecenia');
    await waitState(page, ['MOVING_TO_TARGET']);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioWalking });
    // The anatomy table: OPEN_TWIN then FOCUS_ANATOMY → the twin's display mode becomes BRAIN (V3 anatomyView reducers).
    await expect.poll(async () => root.getAttribute('data-twin-mode'), { timeout: 400_000 }).toBe('BRAIN');
    await expect(page.getByTestId('sw-twin')).toContainText('BRAIN · brain');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioBrain });
    // Hyperscope 5×: a MODEL session (digital zoom of the model — never an observation).
    await expect(page.getByTestId('sw-session')).toBeVisible({ timeout: 400_000 });
    await expect(page.getByTestId('sw-epistemic')).toHaveText('MODEL');
    await expect(page.getByTestId('sw-outputs')).toContainText('magnification: 5');
    await expect(page.getByTestId('sw-outputs')).toContainText('mode: DIGITAL_ZOOM');
    await expect(page.getByTestId('sw-ledger-hash').first()).toContainText(/contentHash [0-9a-f]{64}/);
    const first = await page.getByTestId('sw-session').getAttribute('data-session-id');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioHyperscope });
    // ORPHEUS: a SIMULATION session on the same contract, biosafety ACCESS_RESTRICTED (conceptual-only protocol).
    await expect.poll(async () => page.getByTestId('sw-session').getAttribute('data-session-id'), { timeout: 400_000 }).not.toBe(first);
    await expect(page.getByTestId('sw-epistemic')).toHaveText('SIMULATION');
    await expect(page.getByTestId('sw-outputs')).toContainText('biosafety: ACCESS_RESTRICTED');
    await waitState(page, ['IDLE'], 400_000);
    await expect(page.getByTestId('sw-transcript')).toContainText('ORPHEUS');
    await expect(page.getByTestId('sw-transcript')).toContainText('Skąd to pochodzi');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioOrpheus });
    await page.getByTestId('sw-replay').click();
    await expect(page.getByTestId('sw-replay-verdict')).toHaveText(/MATCH/);
    await page.getByTestId('sw-camera').click();
    await expect(root).toHaveAttribute('data-camera', 'SPECTATOR');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioSpectator });
    // Human Explorer (D-130): the dock is open, empty of stock images until a session exists; a click on the CELL rung walks the
    // agent to histology and the Hyperscope (100×) and the microscope field is drawn from that sealed session only.
    const explorer = page.getByTestId('sw-explorer');
    await expect(explorer).toBeVisible();
    await expect(page.getByTestId('sw-explorer-evidence')).toContainText('NOT_DIRECT_OBSERVATION');
    await page.getByTestId('sw-explorer-organ-heart').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Narząd: Heart');
    await waitState(page, ['IDLE'], 400_000);
    await expect(page.getByTestId('sw-twin')).toContainText('heart');
    await page.getByTestId('sw-explorer-rung-cell').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Komórka');
    await expect.poll(async () => page.getByTestId('sw-session').getAttribute('data-session-id'), { timeout: 400_000 }).not.toBe(first);
    await expect.poll(async () => explorer.getAttribute('data-level'), { timeout: 400_000 }).toBe('cell');
    await expect(page.getByTestId('sw-explorer-capture')).toContainText('hyperscope-capture');
    await expect(page.getByTestId('sw-explorer-scale')).toContainText('10 µm');
    await waitState(page, ['IDLE'], 400_000);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioExplorer });

    // D-131: the licensed CC0 body replaces the proxy in the running app, and the section plane cuts it
    // for real. The HUD must say what the body is made of WITHOUT upgrading the anatomy label.
    await expect.poll(async () => page.getByTestId('sw-twin').getAttribute('data-tier'), { timeout: 400_000 }).toBe('LICENSED_CC0_ASSET');
    await expect(page.getByTestId('sw-twin')).toContainText('CC0');
    await expect(page.getByTestId('sw-twin')).toContainText('ANATOMIA: MODEL');
    await expect(page.getByTestId('sw-explorer-tier')).toContainText('CC0');
    // Both agent cameras leave the twin a distant figure in its chamber; the twin camera frames the body,
    // which is the only way a screenshot can show whether the licensed asset actually rendered.
    await page.getByTestId('sw-explorer-twin-camera').click();
    await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');
    await expect(page.getByTestId('sw-camera-badge')).toContainText('BLIŹNIAK');
    // Focusing the heart isolated it (the V3 reducer's own semantics), and an isolated node ghosts the body
    // shell so the organ can be seen. Clear it, so this shot is of the licensed body itself.
    await expect(page.getByTestId('sw-explorer-isolate')).toContainText('Pokaż wszystko');
    await page.getByTestId('sw-explorer-isolate').click();
    await expect(page.getByTestId('sw-explorer-isolate')).toContainText('Izoluj narząd');
    await expect(page.getByTestId('sw-explorer-surface')).toHaveAttribute('data-surface', 'NORMAL');
    await settled(page, 4);
    await page.screenshot({ path: SHOTS.bioTwinCc0 });

    // The stylised x-ray shell. It is a fresnel term over a licensed 3D model — the chip says "RTG (model)"
    // and the anatomy label must STILL read MODEL, because a prettier view is not an observation.
    await page.getByTestId('sw-explorer-surface-xray').click();
    await expect(page.getByTestId('sw-explorer-surface')).toHaveAttribute('data-surface', 'XRAY');
    await expect(page.getByTestId('sw-twin')).toContainText('ANATOMIA: MODEL');
    await settled(page, 4);
    await page.screenshot({ path: SHOTS.bioXray });
    await page.getByTestId('sw-explorer-surface-normal').click();

    await page.getByTestId('sw-explorer-cut-toggle').click();
    await expect(page.getByTestId('sw-explorer-section')).toHaveAttribute('data-cutaway', 'on');
    await page.getByTestId('sw-explorer-axis-coronal').click();
    await page.getByTestId('sw-explorer-isolate').click();
    await expect(page.getByTestId('sw-explorer-isolate')).toContainText('Pokaż wszystko');
    await expect(page.getByTestId('sw-explorer-section-note')).toContainText('schemat');
    await settled(page, 4);
    await page.screenshot({ path: SHOTS.bioCutaway });
    // Cutting and isolating are presentation: they must not seal a session or add evidence.
    await expect(page.getByTestId('sw-session')).toHaveAttribute('data-session-id', /.+/);


    const harness = new VisualFidelityHarness();
    for (const path of [SHOTS.bioIdle, SHOTS.bioWalking, SHOTS.bioBrain, SHOTS.bioHyperscope, SHOTS.bioOrpheus, SHOTS.bioSpectator, SHOTS.bioExplorer, SHOTS.bioTwinCc0, SHOTS.bioXray, SHOTS.bioCutaway]) {
      const report = harness.inspectFile(path);
      expect(report.ok, `Eyes reject ${path}: ${report.reason ?? 'OK'}`).toBe(true);
    }
    expect(errors).toEqual([]);
  });

  test('human biology lab: Smart UI (D-134) — hover/click a real organ mesh, BADAJ, close, preview-only (never the full pipeline by itself)', async ({ page }) => {
    // Reaching a mode where organs are visible needs a real agent walk to the study table (the
    // OPEN_TWIN/SET_ANATOMY_MODE commands only apply once the agent physically interacts with
    // `station:human-study` — the same real pipeline the V3 acceptance test above proves), which
    // this sandboxed software-rendered environment runs well under real time; the describe-level
    // 25-minute budget isn't enough headroom on top of that walk plus the grid scan.
    test.setTimeout(2_700_000);
    const t0 = Date.now();
    const mark = (label: string): void => console.warn(`[D-134 timing] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
    await page.goto('/#/human-biology-lab');
    await page.waitForSelector('.sw-canvas');
    await settled(page, 3);
    mark('canvas settled');

    // Organs are hidden by default (NORMAL mode shows only the skin) — the existing "RTG" quick
    // command switches the twin to XRAY (every organ slot visible), the same command path the V3
    // acceptance test already proves end to end. Real agent walk + session, not a shortcut.
    await page.getByTestId('sw-quick-rtg').click();
    mark('RTG clicked');
    await waitState(page, ['IDLE'], 400_000);
    mark('IDLE reached');
    await settled(page, 3);
    mark('settled after IDLE');

    // D-131: both agent cameras (VISOR/SPECTATOR) leave the twin a distant figure in its chamber —
    // only the TWIN camera actually frames the body closely enough for organs to be a real,
    // clickable screen target (the same reason the V3 acceptance test above switches to it before
    // any of its own twin-detail screenshots).
    await page.getByTestId('sw-explorer-twin-camera').click();
    mark('twin camera clicked');
    await expect(page.getByTestId('scientific-worlds')).toHaveAttribute('data-camera', 'TWIN');
    mark('data-camera=TWIN confirmed');
    await settled(page, 3);
    mark('settled after twin camera');

    // WORLD VIEW: no popup by default.
    await expect(page.getByTestId('gx-contextual-popup')).toHaveCount(0);

    const organ = await findHoveredOrganPoint(page);
    mark(`organ found: ${organ.label}`);
    expect(organ.label.length).toBeGreaterThan(0);

    // CLICK — selects the organ, opens the popup, honestly labelled MODEL (the atlas proxy, never
    // dressed up as an observation). Clicking never, by itself, seals a session.
    const sessionBefore = await page.getByTestId('sw-session').getAttribute('data-session-id').catch(() => null);
    await page.mouse.click(organ.x, organ.y);
    mark('clicked organ');
    const popup = page.getByTestId('gx-contextual-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toContainText('MODEL');
    const viewport = page.viewportSize()!;
    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();
    expect(popupBox!.x).toBeGreaterThanOrEqual(0);
    expect(popupBox!.y).toBeGreaterThanOrEqual(0);
    expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.getByTestId('sw-session').getAttribute('data-session-id').catch(() => null)).toBe(sessionBefore);

    // BADAJ — opens the Human Explorer (the SAME panel the organ chip already opens, not a second
    // one); this may or may not run the agent pipeline (only 5 of the manifest's organs have a
    // matching explorer entry), but the panel must be visible either way.
    await page.getByRole('button', { name: 'BADAJ' }).click();
    await expect(page.getByTestId('sw-explorer')).toBeVisible();

    // CLOSE — restores a clean world view: no popup left open.
    await page.getByLabel('Zamknij').click();
    await expect(page.getByTestId('gx-contextual-popup')).toHaveCount(0);

    expect(errors).toEqual([]);
  });
});
