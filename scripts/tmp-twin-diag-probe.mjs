// Diagnostic-only: capture window.__genesisDebugStats (camera position/fov/near, twin world
// position/scale/bounding-sphere) at the exact moment the TWIN-switch first-frame defect is visible,
// to determine analytically whether the huge pale surface is a camera-position bug or a mesh-scale bug.
import { chromium } from 'playwright';

const OUT = '/home/user/Elion-Replit-grudzien-5rano/docs/evidence/d135/screenshots';
const t0 = Date.now();
const mark = (label) => console.log(`[mark] ${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });

async function settled(page, root, frames = 2, timeout = 180_000) {
  const before = Number(await root.getAttribute('data-frames'));
  await page.waitForFunction(
    ([sel, target]) => Number(document.querySelector(sel)?.getAttribute('data-frames')) >= target,
    [`[data-testid="scientific-worlds"]`, before + frames],
    { timeout },
  );
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

await page.waitForFunction(() => document.querySelector('[data-testid="sw-twin"]')?.getAttribute('data-tier') === 'LICENSED_CC0_ASSET', null, { timeout: 600_000 });
mark('licensed asset ready (SPECTATOR mode, before touching camera)');
const beforeSwitch = await page.evaluate(() => window.__genesisDebugStats ?? null);
console.log('[diag] before TWIN switch (SPECTATOR):', JSON.stringify(beforeSwitch));

await page.getByTestId('sw-explorer-twin-camera').click({ timeout: 240_000 });
await page.waitForFunction(() => document.querySelector('[data-testid="scientific-worlds"]')?.getAttribute('data-camera') === 'TWIN', null, { timeout: 240_000 });
mark('twin-camera-on');

// Sample every ~200ms for the first 3 seconds, capturing both the debug stats and a screenshot at
// each sample, so the exact frame the geometry snaps correct (if it does) is pinned down precisely.
for (let i = 0; i < 15; i++) {
  const stats = await page.evaluate(() => window.__genesisDebugStats ?? null);
  const ray2 = await page.evaluate(() => window.__genesisDebugRaycast2 ?? null);
  console.log(`[diag] t+${(i * 200)}ms:`);
  console.log('  ray2:', JSON.stringify(ray2));
  if (i === 0 || i === 4 || i === 9 || i === 14) await page.screenshot({ path: `${OUT}/diag-probe-${String(i).padStart(2, '0')}.png` });
  await page.waitForTimeout(200);
}
mark('probe done');

await page.close();
await browser.close();
mark('done');
