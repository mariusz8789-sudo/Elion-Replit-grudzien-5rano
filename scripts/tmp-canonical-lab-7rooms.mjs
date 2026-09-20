// Canonical Laboratory — full 7-room visual audit. Real production browser, real production build
// (rebuilt after: Wet Lab equipped with 3 physical stations; compute/safety/orpheus facing+position
// bugs fixed — operator standoff points that walked through a wall, caught by the AgentController
// reachability test suite). One command per room, through the real chat command bar, each landing on
// a real operational station. No DOM mocking, no synthetic state.
import { chromium } from 'playwright';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/d135/screenshots';
const t0 = Date.now();
const mark = (label) => console.log(`[mark] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const CLICK_TIMEOUT = 240_000;
const IDLE_TIMEOUT = 1_200_000; // 20 min ceiling per leg — observed real legs range ~80s to ~900s+ under software rendering.

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });

async function settled(page, root, frames = 2, timeout = 180_000) {
  const before = Number(await root.getAttribute('data-frames'));
  await page.waitForFunction(
    ([sel, target]) => Number(document.querySelector(sel)?.getAttribute('data-frames')) >= target,
    [`[data-testid="scientific-worlds"]`, before + frames],
    { timeout },
  );
}

async function waitAgentState(page, state, timeout) {
  await page.waitForFunction(
    ([sel, s]) => document.querySelector(sel)?.getAttribute('data-agent-state') === s,
    [`[data-testid="scientific-worlds"]`, state],
    { timeout },
  );
}

async function step(label, fn) {
  try { await fn(); } catch (e) { console.log(`[warn] step "${label}" failed: ${e.message.split('\n')[0]}`); }
  mark(label);
}

async function shoot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}` });
}

async function sendCommand(page, text) {
  await page.getByTestId('sw-input').fill(text);
  await page.getByTestId('sw-send').click({ timeout: CLICK_TIMEOUT });
}

async function setCamera(page, root, mode) {
  const current = await root.getAttribute('data-camera');
  if (current === mode) return;
  await page.getByTestId('sw-camera').click({ timeout: CLICK_TIMEOUT });
  await page.waitForFunction(([sel, m]) => document.querySelector(sel)?.getAttribute('data-camera') === m, [`[data-testid="scientific-worlds"]`, mode], { timeout: CLICK_TIMEOUT });
  await settled(page, root, 2);
}

async function visitAndShoot(page, root, label, command, shotName) {
  await step(`send: ${label}`, async () => { await sendCommand(page, command); });
  await step(`arrive: ${label}`, async () => { await waitAgentState(page, 'IDLE', IDLE_TIMEOUT); await settled(page, root, 2); });
  await step(`shoot: ${label}`, async () => { await shoot(page, shotName); });
}

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
const root = page.getByTestId('scientific-worlds');
await root.waitFor({ state: 'visible', timeout: 60_000 });
await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
await settled(page, root, 3);
mark('loaded, settled');

// Room 1: MAIN HALL — spawn, VISOR (twin chamber + new interior walls in frame), then an operational
// main-hall console with its corrected facing (safety — was facing through the north wall).
await step('room1a-main-hall-spawn', async () => { await shoot(page, 'room1a-main-hall-spawn.png'); });
await visitAndShoot(page, root, 'main-hall/safety', 'Idź do konsoli bezpieczeństwa.', 'room1b-main-hall-safety-station.png');

// Room 2: HUMAN STUDY — neuro console + sign.neuro in its corrected position.
await visitAndShoot(page, root, 'human-study/neuro', 'Idź do konsoli neuro.', 'room2-human-study-neuro.png');

// Navigation proof: fire a cross-building command, catch the agent mid-walk with the SPECTATOR chase
// camera (frames the doorway better than VISOR while the character is small on screen).
await step('send: door-crossing command (human-study -> microscopy)', async () => { await sendCommand(page, 'Idź do mikroskopu.'); });
await step('nav-spectator-on', async () => { await setCamera(page, root, 'SPECTATOR'); });
await step('nav-in-transit-t20s', async () => { await page.waitForTimeout(20_000); await shoot(page, 'room-nav-door-crossing.png'); });
await step('nav-back-to-visor', async () => { await setCamera(page, root, 'VISOR'); });

// Room 3: MICROSCOPY.
await step('microscopy-arrive', async () => { await waitAgentState(page, 'IDLE', IDLE_TIMEOUT); await settled(page, root, 2); await shoot(page, 'room3-microscopy.png'); });

// Room 4: HISTOLOGY.
await visitAndShoot(page, root, 'histology', 'Przygotuj preparat histologiczny.', 'room4-histology.png');

// Room 5: IMAGING.
await visitAndShoot(page, root, 'imaging', 'Uruchom obrazowanie.', 'room5-imaging.png');

// Room 6: WET LAB — the newly-equipped room; the bench station added this session.
await visitAndShoot(page, root, 'wet-lab/bench', 'Go to the wet lab bench and use the bench.', 'room6-wet-lab-bench.png');

// Room 7: EXPERIMENTAL — ORPHEUS + sign.orpheus, at its corrected (clearance-fixed) position.
await visitAndShoot(page, root, 'experimental/orpheus', 'Zbadaj próbkę przez Orpheus.', 'room7-experimental-orpheus.png');

await page.close();
await browser.close();
mark('done');
