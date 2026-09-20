// Canonical Laboratory integration — real screenshots from a real running browser against the real
// production build, showing the seven-room building, a door crossing, and the agent physically
// navigating room-to-room to run an experiment. Same resilient pattern as tmp-d135-screenshots.mjs:
// every step is wrapped so one slow/stuck interaction logs a warning and the run continues.
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

{
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
  const root = page.getByTestId('scientific-worlds');
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
  await settled(page, root, 3);
  mark('loaded, settled');

  await step('canon-01-visor-main-hall-spawn', async () => { await shoot(page, 'canon-01-visor-main-hall-spawn.png'); });

  await step('canon-02-spectator-main-hall', async () => {
    await page.getByTestId('sw-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'SPECTATOR', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, 'canon-02-spectator-main-hall.png');
  });

  // One command, three rooms: NAVIGATE to human-study (open the twin, focus the brain), NAVIGATE to
  // microscopy (Hyperscope capture), NAVIGATE to experimental (Orpheus scan), then the evidence report —
  // the exact acceptance sentence scientificWorldsBiology.test.ts already proves deterministic.
  await step('send acceptance command (navigates through 3 rooms)', async () => {
    await sendCommand(page, 'Otwórz wirtualnego człowieka, pokaż mózg, przejdź do Hyperscope, powiększ 5×, a potem zbadaj próbkę przez Orpheus i pokaż mi Evidence.');
  });

  await step('canon-03-in-transit-t20s', async () => { await page.waitForTimeout(20_000); await shoot(page, 'canon-03-in-transit-t20s.png'); });
  await step('canon-04-in-transit-t60s', async () => { await page.waitForTimeout(40_000); await shoot(page, 'canon-04-in-transit-t60s.png'); });
  await step('canon-05-in-transit-t150s', async () => { await page.waitForTimeout(90_000); await shoot(page, 'canon-05-in-transit-t150s.png'); });
  await step('canon-06-in-transit-t300s', async () => { await page.waitForTimeout(150_000); await shoot(page, 'canon-06-in-transit-t300s.png'); });

  await step('canon-07-idle-arrived', async () => {
    await waitAgentState(page, 'IDLE', 900_000);
    await settled(page, root, 2);
    await shoot(page, 'canon-07-idle-arrived.png');
  });

  await step('canon-08-visor-back-to-agent-pov', async () => {
    await page.getByTestId('sw-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'VISOR', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, 'canon-08-visor-back-to-agent-pov.png');
  });

  await step('canon-09-evidence-session', async () => {
    await shoot(page, 'canon-09-evidence-session.png');
  });

  await page.close();
}

await browser.close();
mark('done');
