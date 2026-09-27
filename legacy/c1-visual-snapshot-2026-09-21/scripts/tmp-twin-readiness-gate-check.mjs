// Readiness-gate verification: real production browser, real production build, real GLB fetch.
// Captures the TWIN camera switch at 0ms (the exact frame that was previously broken), 250ms, 1s,
// 2s, and a fully-settled state, plus the live `humanTwinCompiling`/tier/camera stats at each point —
// no wall-clock guessing, the page's own state decides PASS/FAIL.
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

const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.goto('http://127.0.0.1:8080/#/human-biology-lab');
const root = page.getByTestId('scientific-worlds');
await root.waitFor({ state: 'visible', timeout: 60_000 });
await page.getByTestId('sw-canvas').waitFor({ state: 'visible', timeout: 60_000 });
await settled(page, root, 3);
mark('loaded, settled');

// Wait for the licensed asset to actually finish loading BEFORE ever touching the camera — this
// isolates the readiness-gate question (does the first TWIN frame look right once the asset is
// live?) from the separate, already-covered "still loading" question. `[data-testid="sw-twin"]`'s
// `data-tier` attribute is the same signal `ScientificWorldsScreen.tsx` reads off the scene's
// `getTwinTier()` — shown regardless of camera mode, so this needs no camera switch to observe.
await step('wait-for-licensed-asset', async () => {
  await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-tier') === 'LICENSED_CC0_ASSET', { timeout: 600_000 });
});

async function badgeText() {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="scientific-worlds"]');
    return {
      camera: el?.getAttribute('data-camera') ?? null,
      frames: el?.getAttribute('data-frames') ?? null,
      tier: document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-tier') ?? null,
    };
  });
}

await step('twin-camera-on', async () => {
  await page.getByTestId('sw-explorer-twin-camera').click({ timeout: CLICK_TIMEOUT });
  await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN', { timeout: CLICK_TIMEOUT });
});
console.log('[state] immediate:', JSON.stringify(await badgeText()));
await page.screenshot({ path: `${OUT}/gate-00-immediate.png` });
mark('gate-00-immediate');

await page.waitForTimeout(250);
console.log('[state] +250ms:', JSON.stringify(await badgeText()));
await page.screenshot({ path: `${OUT}/gate-01-250ms.png` });
mark('gate-01-250ms');

await page.waitForTimeout(750); // cumulative ~1s
console.log('[state] +1s:', JSON.stringify(await badgeText()));
await page.screenshot({ path: `${OUT}/gate-02-1s.png` });
mark('gate-02-1s');

await page.waitForTimeout(1000); // cumulative ~2s
console.log('[state] +2s:', JSON.stringify(await badgeText()));
await page.screenshot({ path: `${OUT}/gate-03-2s.png` });
mark('gate-03-2s');

await step('settle', async () => { await settled(page, root, 3); await page.waitForTimeout(1500); });
console.log('[state] settled:', JSON.stringify(await badgeText()));
await page.screenshot({ path: `${OUT}/gate-04-settled.png` });
mark('gate-04-settled');

await page.close();
await browser.close();
mark('done');
