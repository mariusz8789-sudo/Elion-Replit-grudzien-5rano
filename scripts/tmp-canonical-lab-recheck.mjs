// Re-capture, one fresh page load per station: safety/histology/wet-lab-bench now have a practical
// light (were rendering essentially invisible in the dark biology grade); orpheus is re-shot because
// the previous 7-room run's screenshot was ambiguous — HUD still showed the PRIOR station's label
// ("Stół laboratoryjny (wet lab)") and "AGENT: idzie do stanowiska" (still navigating) at capture
// time, meaning `waitAgentState('IDLE')` resolved on a stale/race tick rather than real arrival. Each
// visit here is a fresh page (spawn -> one station only) and double-checks BOTH agent-state===IDLE AND
// the STANOWISKO label text before shooting, closing that race.
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
        const stationBadge = document.body.innerText;
        return stationBadge.includes(needle);
      },
      [`[data-testid="scientific-worlds"]`, expectedLabelSubstring],
      { timeout: IDLE_TIMEOUT },
    );
    // Extra settle after the state+label both confirm, so any final-frame camera/animation easing finishes.
    await settled(page, root, 3);
    await page.waitForTimeout(1500);
  });

  await step(`shoot: ${label}`, async () => { await page.screenshot({ path: `${OUT}/${shotName}` }); });
  await page.close();
}

await visitFreshAndShoot('main-hall/safety (re-lit)', 'Idź do konsoli bezpieczeństwa.', 'Konsola bezpieczeństwa', 'room1b-main-hall-safety-station.png');
await visitFreshAndShoot('histology (re-lit)', 'Przygotuj preparat histologiczny.', 'Stanowisko histologiczne', 'room4-histology.png');
await visitFreshAndShoot('wet-lab/bench (re-lit)', 'Go to the wet lab bench and use the bench.', 'wet lab', 'room6-wet-lab-bench.png');
await visitFreshAndShoot('experimental/orpheus (race fix)', 'Zbadaj próbkę przez Orpheus.', 'ORPHEUS', 'room7-experimental-orpheus.png');

await browser.close();
mark('done');
