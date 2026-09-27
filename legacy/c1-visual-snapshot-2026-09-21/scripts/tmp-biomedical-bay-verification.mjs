// Biomedical Intervention Bay — mandatory 5-point real-browser verification, against the real
// production build (npm run build + npm run start), same resilient pattern as
// tmp-canonical-lab-screenshots.mjs: every step wrapped so one slow interaction logs a warning
// and the run continues, real screenshots saved to disk, no PASS declared from unit tests alone.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/biomedical-bay/screenshots';
fs.mkdirSync(OUT, { recursive: true });
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
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console.error]', msg.text()); });
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
  const root = page.getByTestId('scientific-worlds');
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
  await settled(page, root, 3);
  mark('loaded, settled');

  // Free camera to inspect the physical apparatus and the room independent of the agent's own position.
  await step('switch to spectator camera', async () => {
    await page.getByTestId('sw-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'SPECTATOR', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
  });

  // POINT 3 (Human Twin data-handoff, checked FIRST and independently of the Bay to prove nothing there
  // regressed): confirm the twin badge still reports the same provenance/tier as before this session's
  // Bay work — a data-level fact, not a rendered duplicate figure at the Bay.
  await step('bio-00-twin-badge-baseline', async () => {
    const twinBadge = await page.getByTestId('sw-twin').textContent().catch(() => null);
    console.log('[twin-badge]', twinBadge);
    await shoot(page, 'bio-00-twin-badge-baseline.png');
  });

  // POINT 1 + 2 + 4: SPECTATOR camera tracks the real agent (established behaviour), so it will follow
  // the agent physically walking into the new 'biomedical-bay' room and show the real apparatus once
  // there — no invented fly-to mechanism, just the same camera every other verification in this
  // session used.
  await step('bio-01-spectator-main-hall-before-command', async () => { await shoot(page, 'bio-01-spectator-main-hall-before-command.png'); });

  // POINT 4 + 5: send a real natural-language command that must NAVIGATE the real AgentController to
  // the Bay (through main-hall -> histology -> biomedical-bay, the same path this session's placement
  // search proved reachable with the real planPath) and RUN a real experiment there.
  //
  // FIX ON VERIFICATION (round 1): "... i zbierz ..." (no comma) parsed as ONE clause —
  // `biologyCommands.ts`'s own clause-split regex only treats a bare "i"/"and" as a separator when
  // immediately followed by "pokaz/pokaż/show" — only NAVIGATE was recognized.
  //
  // FIX ON VERIFICATION (round 2): splitting into two clauses with a comma DOES split them, but
  // `biologyCommands.ts` calls `parseWorldCommands` separately per clause — `worldCommand.ts`'s own
  // `lastStation` cross-clause carry-over (used by the *existing* acceptance sentence's "then run it")
  // only works WITHIN one `parseWorldCommands` call, not across biology's own separate per-clause
  // calls. "zbierz stan fizjologiczny" alone, with no station named in that same clause, correctly
  // went unresolved ("Nie zrozumiałem"). A single self-contained RUN_EXPERIMENT clause naming the
  // station itself needs no NAVIGATE clause at all — `actionPlanner.ts`'s RUN_EXPERIMENT case already
  // prepends NAVIGATE/ALIGN/REACH automatically when the agent isn't already at the station.
  await step('send command: run baseline physiology at the Biomedical Bay (auto-navigates)', async () => {
    await sendCommand(page, 'Uruchom w Biomedical Intervention Bay baseline fizjologii.');
  });

  await step('bio-02-transcript-after-command', async () => {
    const transcript = await page.getByTestId('sw-transcript').textContent().catch(() => null);
    console.log('[transcript-after-command]', transcript);
    await shoot(page, 'bio-02-transcript-after-command.png');
  });

  await step('bio-03-in-transit-t60s', async () => { await page.waitForTimeout(60_000); await shoot(page, 'bio-03-in-transit-t60s.png'); });
  await step('bio-04-in-transit-t300s', async () => { await page.waitForTimeout(240_000); await shoot(page, 'bio-04-in-transit-t300s.png'); });
  await step('bio-05-in-transit-t600s', async () => { await page.waitForTimeout(300_000); await shoot(page, 'bio-05-in-transit-t600s.png'); });

  await step('bio-06-idle-arrived-experiment-run', async () => {
    await waitAgentState(page, 'IDLE', 900_000);
    await settled(page, root, 2);
    await shoot(page, 'bio-06-idle-arrived-experiment-run.png');
  });

  await step('bio-07-close-explorer-wide-room-shot', async () => {
    await page.getByTestId('sw-explorer-toggle').click({ timeout: CLICK_TIMEOUT }).catch(() => {});
    await page.waitForTimeout(500);
    await shoot(page, 'bio-07-close-explorer-wide-room-shot.png');
  });

  await step('bio-08-visor-agent-pov-at-bay', async () => {
    await page.getByTestId('sw-camera').click({ timeout: CLICK_TIMEOUT });
    await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'VISOR', { timeout: CLICK_TIMEOUT });
    await settled(page, root, 2);
    await shoot(page, 'bio-08-visor-agent-pov-at-bay.png');
  });

  await step('bio-09-session-panel', async () => {
    const sessionId = await page.getByTestId('sw-session').getAttribute('data-session-id').catch(() => null);
    const epistemic = await page.getByTestId('sw-epistemic').textContent().catch(() => null);
    const outputs = await page.getByTestId('sw-outputs').textContent().catch(() => null);
    const transcript = await page.getByTestId('sw-transcript').textContent().catch(() => null);
    console.log('[session]', JSON.stringify({ sessionId, epistemic, outputs }));
    console.log('[transcript-final]', transcript);
    await shoot(page, 'bio-09-session-panel.png');
  });

  await step('bio-10-twin-badge-after', async () => {
    const twinBadge = await page.getByTestId('sw-twin').textContent().catch(() => null);
    console.log('[twin-badge-after]', twinBadge);
  });

  await page.close();
}

await browser.close();
mark('done');
