// Human Twin visual presentation verification: real production browser, real production build.
// 1. Clothed twin in the chamber (TWIN camera, NORMAL surface mode) — deterministic scrubs, silhouette
//    separation, reduced glass glare.
// 2. Same twin with an organ selected (ORGANS-adjacent path via heart selection) — clothing must be
//    HIDDEN, not merely faded.
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

async function step(label, fn) {
  try { await fn(); } catch (e) { console.log(`[warn] step "${label}" failed: ${e.message.split('\n')[0]}`); }
  mark(label);
}

async function shoot(page, name) { await page.screenshot({ path: `${OUT}/${name}` }); }

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
const root = page.getByTestId('scientific-worlds');
await root.waitFor({ state: 'visible', timeout: 60_000 });
await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
await settled(page, root, 3);
mark('loaded, settled');

await step('twin-camera-on', async () => {
  await page.getByTestId('sw-explorer-twin-camera').click({ timeout: CLICK_TIMEOUT });
  await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN', { timeout: CLICK_TIMEOUT });
  await settled(page, root, 3);
  await page.waitForTimeout(1500);
});
await step('ht-01-clothed-twin', async () => { await shoot(page, 'ht-01-clothed-twin-chamber.png'); });

await step('select-heart-organ', async () => {
  await page.getByTestId('sw-explorer-organ-heart').click({ timeout: CLICK_TIMEOUT });
  await settled(page, root, 3);
  await page.waitForTimeout(1000);
});
await step('ht-02-organ-selected-still-clothed', async () => { await shoot(page, 'ht-02-organ-selected.png'); });

// A real anatomy MODE (not just a selected organ) is what hides clothing — drive it the same way a
// user would, through the real command bar (parseBiologyWorldCommands -> SET_ANATOMY_MODE), not a
// synthetic state write.
await step('send: switch to organs view', async () => {
  await page.getByTestId('sw-input').fill('Pokaż widok narządów.');
  await page.getByTestId('sw-send').click({ timeout: CLICK_TIMEOUT });
  await settled(page, root, 3);
  await page.waitForTimeout(1500);
});
await step('ht-03-organs-mode-clothing-hidden', async () => { await shoot(page, 'ht-03-organs-mode-clothing-hidden.png'); });

await page.close();
await browser.close();
mark('done');
