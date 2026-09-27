// Canonical Laboratory visual verification — real screenshots from the real production build in a real
// (headless, software-rendered) browser, one command per room, navigating the agent through the actual
// door graph via the same chat command bar a person would use. No DOM mocking, no synthetic state.
import { chromium } from 'playwright';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/d135/screenshots';
const t0 = Date.now();
const mark = (label) => console.log(`[mark] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const CLICK_TIMEOUT = 240_000;

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

async function visitAndShoot(page, root, label, command, shotName, idleTimeout = 900_000) {
  await step(`send: ${label}`, async () => { await sendCommand(page, command); });
  await step(`arrive: ${label}`, async () => { await waitAgentState(page, 'IDLE', idleTimeout); await settled(page, root, 2); });
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

// 1. Main hall — spawn, VISOR (default), before any command.
await step('r1-main-hall', async () => { await shoot(page, 'canon-r1-main-hall.png'); });

// Door-crossing proof: fire the human-study command, grab the agent mid-walk (SPECTATOR chase camera
// frames the doorway better than VISOR while the character is small on screen), well before it arrives.
await step('send: door-crossing command (main-hall -> human-study)', async () => { await sendCommand(page, 'Idź do konsoli neuro.'); });
await step('r-nav1-spectator-on', async () => { await setCamera(page, root, 'SPECTATOR'); });
await step('r-nav2-in-transit-t15s', async () => { await page.waitForTimeout(15_000); await shoot(page, 'canon-r-nav-door-crossing-t15s.png'); });
await step('r-nav3-in-transit-t45s', async () => { await page.waitForTimeout(30_000); await shoot(page, 'canon-r-nav-door-crossing-t45s.png'); });
await step('r-nav4-back-to-visor', async () => { await setCamera(page, root, 'VISOR'); });

// 2/8. Human Study — arrival shot: neuro console + sign.neuro in its corrected position.
await step('r2-human-study-arrive', async () => { await waitAgentState(page, 'IDLE', 900_000); await settled(page, root, 2); await shoot(page, 'canon-r2-human-study-sign-neuro.png'); });

// 3/9. Microscopy.
await visitAndShoot(page, root, 'microscopy', 'Idź do mikroskopu.', 'canon-r3-microscopy-sign-micro.png');

// 4. Histology.
await visitAndShoot(page, root, 'histology', 'Przygotuj preparat histologiczny.', 'canon-r4-histology.png');

// 5. Imaging.
await visitAndShoot(page, root, 'imaging', 'Uruchom obrazowanie.', 'canon-r5-imaging.png');

// 6. Wet Lab — has no station in this pilot layout (stationIds: []), so there is no in-product command
// target inside it. Best-effort: go to the nearest main-hall console and look toward the wet-lab door,
// then honestly report what the frame actually shows rather than claim a room visit that isn't possible
// through the real product UI today.
await visitAndShoot(page, root, 'wet-lab-attempt (nearest reachable console)', 'Idź do konsoli bezpieczeństwa.', 'canon-r6-wet-lab-attempt.png');

// 7/10. Experimental / ORPHEUS.
await visitAndShoot(page, root, 'experimental-orpheus', 'Zbadaj próbkę przez Orpheus.', 'canon-r7-experimental-sign-orpheus.png');

await page.close();
await browser.close();
mark('done');
