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

// The lab is world-first (d02c93fd): evidence and the command controls are collapsed until asked for.
// The tests open them exactly as a user would — through their own toggles.
const setPanel = async (page: Page, panel: 'evidence' | 'controls', open: boolean): Promise<void> => {
  const toggle = panel === 'controls' ? page.getByTestId('sw-controls') : page.getByTestId('sw-evidence').locator('button[aria-expanded]').first();
  if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', String(open));
};
// Human Explorer (biology) keeps its tools in inspector tabs: explore (organs, zoom ladder), microscope,
// section (cutaway, surface, twin camera) and research (commands, evidence) — the test opens the tab a
// person would use for each step.
const humanTab = async (page: Page, tab: 'explore' | 'microscope' | 'section' | 'research'): Promise<void> => {
  const toggle = page.getByTestId('human-inspector-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const tabButton = page.getByTestId(`human-tab-${tab}`);
  if ((await tabButton.getAttribute('aria-selected')) !== 'true') await tabButton.click();
  await expect(tabButton).toHaveAttribute('aria-selected', 'true');
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
    await setPanel(page, 'evidence', true);
    await expect(page.getByTestId('sw-no-session')).toBeVisible();
    await settled(page, 3);
    await page.screenshot({ path: SHOTS.visorIdle });

    // The acceptance sentence.
    await setPanel(page, 'controls', true);
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
    await setPanel(page, 'controls', true);
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
    // The proxy twin shows 'Ładowanie modelu człowieka…' until its first body is built (heavy in software GL).
    await expect(page.getByTestId('sw-twin')).toContainText('NORMAL', { timeout: 400_000 });
    // The twin starts on the proxy, or directly on the licensed body when that asset has already loaded (biologyLabKit).
    await expect(page.getByTestId('sw-twin')).toHaveAttribute('data-lod', /^(PROXY_LOW|FULL_ASSET)$/);
    await settled(page, 3);
    await page.screenshot({ path: SHOTS.bioIdle });

    // Run the two experiments as two observable stages. A single compound sentence is accepted,
    // but the second result can replace the first card before a learner has time to inspect it.
    await humanTab(page, 'research');
    await setPanel(page, 'controls', true);
    await page.getByTestId('sw-input').fill('Otwórz wirtualnego człowieka, pokaż mózg, przejdź do Hyperscope i powiększ 5×.');
    await page.getByTestId('sw-send').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Rozumiem');
    await waitState(page, ['MOVING_TO_TARGET']);
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioWalking });
    // The anatomy table: OPEN_TWIN then FOCUS_ANATOMY → the twin's display mode becomes BRAIN (V3 anatomyView reducers).
    await expect.poll(async () => root.getAttribute('data-twin-mode'), { timeout: 400_000 }).toBe('BRAIN');
    await expect(page.getByTestId('sw-twin')).toContainText('BRAIN · brain');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioBrain });
    // Hyperscope 5×: a MODEL session (digital zoom of the model — never an observation).
    const evidence = page.getByTestId('sw-evidence');
    const evidenceToggle = evidence.locator('button[aria-expanded]').first();
    if ((await evidenceToggle.getAttribute('aria-expanded')) !== 'true') await evidenceToggle.click();
    await expect(page.getByTestId('sw-session')).toBeVisible({ timeout: 400_000 });
    await expect(page.getByTestId('sw-epistemic')).toHaveText('MODEL');
    await expect(page.getByTestId('sw-outputs')).toContainText('magnification: 5');
    await expect(page.getByTestId('sw-outputs')).toContainText('mode: DIGITAL_ZOOM');
    await expect(page.getByTestId('sw-ledger-hash').first()).toContainText(/contentHash [0-9a-f]{64}/);
    const first = await page.getByTestId('sw-session').getAttribute('data-session-id');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioHyperscope });
    // ORPHEUS: a SIMULATION session on the same contract, biosafety ACCESS_RESTRICTED (conceptual-only protocol).
    await waitState(page, ['IDLE'], 400_000);
    await page.getByTestId('sw-input').fill('Zbadaj próbkę przez Orpheus i pokaż mi Evidence.');
    await page.getByTestId('sw-send').click();
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
    // The biology world opens on the twin camera (926e6b43); the camera button cycles TWIN → VISOR → SPECTATOR.
    await page.getByTestId('sw-camera').click();
    if ((await root.getAttribute('data-camera')) !== 'SPECTATOR') await page.getByTestId('sw-camera').click();
    await expect(root).toHaveAttribute('data-camera', 'SPECTATOR');
    await settled(page, 2);
    await page.screenshot({ path: SHOTS.bioSpectator });
    // Human Explorer (D-130): the dock is open, empty of stock images until a session exists; a click on the CELL rung walks the
    // agent to histology and the Hyperscope (100×) and the microscope field is drawn from that sealed session only.
    const explorer = page.getByTestId('sw-explorer');
    await expect(explorer).toBeVisible();
    await expect(page.getByTestId('sw-explorer-evidence')).toContainText('NOT_DIRECT_OBSERVATION');
    // The evidence drawer deliberately floats over the world. Close it before operating the
    // anatomy dock, exactly as a user would, so the acceptance path tests real hit targets.
    if ((await evidenceToggle.getAttribute('aria-expanded')) === 'true') {
      await evidenceToggle.click();
      await expect(evidenceToggle).toHaveAttribute('aria-expanded', 'false');
    }
    await setPanel(page, 'controls', false);
    await humanTab(page, 'explore');
    await page.getByTestId('sw-explorer-organ-heart').click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Narząd: Heart');
    // The organ card with data-organ was merged away (7c262fa9); the chosen organ is the selected chip.
    await expect(page.getByTestId('sw-explorer-organ-heart')).toHaveAttribute('aria-selected', 'true');
    const cellRung = page.getByTestId('sw-explorer-rung-cell');
    await expect(cellRung).toBeDisabled({ timeout: 10_000 });
    await expect(cellRung).toBeEnabled({ timeout: 400_000 });
    await cellRung.click();
    await expect(page.getByTestId('sw-transcript')).toContainText('Komórka');
    // Evidence is collapsed so the anatomy controls remain clickable. The Explorer's capture ID is
    // the same sealed session identity projected into the visible microscope surface.
    await expect.poll(async () => page.getByTestId('sw-explorer-scope').getAttribute('data-capture'), { timeout: 400_000 }).not.toBe('');
    await expect.poll(async () => explorer.getAttribute('data-level'), { timeout: 400_000 }).toBe('cell');
    await expect(page.getByTestId('sw-explorer-capture')).toContainText('hyperscope-capture');
    await expect(page.getByTestId('sw-explorer-scale')).toContainText('10 µm');
    await waitState(page, ['IDLE'], 400_000);
    const cellCaptureId = await page.getByTestId('sw-explorer-scope').getAttribute('data-capture');
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
    await humanTab(page, 'section');
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
    await expect(page.getByTestId('sw-explorer-scope')).toHaveAttribute('data-capture', cellCaptureId ?? '');


    const harness = new VisualFidelityHarness();
    for (const path of [SHOTS.bioIdle, SHOTS.bioWalking, SHOTS.bioBrain, SHOTS.bioHyperscope, SHOTS.bioOrpheus, SHOTS.bioSpectator, SHOTS.bioExplorer, SHOTS.bioTwinCc0, SHOTS.bioXray, SHOTS.bioCutaway]) {
      const report = harness.inspectFile(path);
      expect(report.ok, `Eyes reject ${path}: ${report.reason ?? 'OK'}`).toBe(true);
    }
    expect(errors).toEqual([]);
  });
});
