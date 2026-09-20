// Lighting-polish re-capture: Main Hall Safety and Human Study Neuro only. Fresh page per station,
// waits for BOTH agent-state===IDLE and the correct STANOWISKO label before shooting (same
// race-free pattern as tmp-canonical-lab-recheck.mjs). No geometry/position/navigation changed —
// local station-light tuning only.
import { chromium } from 'playwright';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/d135/screenshots';
const t0 = Date.now();
const mark = (label) => console.log(`[mark] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const CLICK_TIMEOUT = 240_000;
const IDLE_TIMEOUT = 1_200_000;

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });

async function settled(page, root, frames = 2, timeout = 180_000) {
  const before = Number(await root.getAttribute('data-frames'));
  await page.waitForFunction(
    ([sel, target]) => Number(document.querySelector(sel)?.getAttribute('data-frames')) >= target,
    [`[data-testid="scientific-worlds"]`, before + frames],
    { timeout },
  );
}

async function step(label, fn) {
  try { await fn(); } catch (e) { console.log(`[warn] step "${label}" failed: ${e.message.split('\n')[0]}`); }
  mark(label);
}

async function visitFreshAndShoot(label, command, expectedLabelSubstring, shotName) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
  await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
  const root = page.getByTestId('scientific-worlds');
  await root.waitFor({ state: 'visible', timeout: 60_000 });
  await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
  await settled(page, root, 3);

  await step(`send: ${label}`, async () => {
    await page.getByTestId('sw-input').fill(command);
    await page.getByTestId('sw-send').click({ timeout: CLICK_TIMEOUT });
  });

  await step(`arrive (idle + correct station label): ${label}`, async () => {
    await page.waitForFunction(
      ([sel, needle]) => {
        const el = document.querySelector(sel);
        if (!el || el.getAttribute('data-agent-state') !== 'IDLE') return false;
        return document.body.innerText.includes(needle);
      },
      [`[data-testid="scientific-worlds"]`, expectedLabelSubstring],
      { timeout: IDLE_TIMEOUT },
    );
    await settled(page, root, 3);
    await page.waitForTimeout(1500);
  });

  await step(`shoot: ${label}`, async () => { await page.screenshot({ path: `${OUT}/${shotName}` }); });
  await page.close();
}

await visitFreshAndShoot('main-hall/safety (lighting polish)', 'Idź do konsoli bezpieczeństwa.', 'Konsola bezpieczeństwa', 'room1b-main-hall-safety-station.png');
await visitFreshAndShoot('human-study/neuro (lighting polish)', 'Idź do konsoli neuro.', 'Konsola Neuro Lab', 'room2-human-study-neuro.png');

await browser.close();
mark('done');
