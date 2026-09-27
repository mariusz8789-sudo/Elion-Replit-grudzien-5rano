import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { buildHistoricalWorldState } from '../src/core/lookingGlass/urbanTransformation/historicalWorldState.ts';

async function main() {
  const weather = process.argv[2]; // e.g. 'rain', or omit for clear
  const outPath = process.argv[3] ?? '/tmp/debug-wide.jpg';
  const FALLBACK = '/opt/pw-browsers/chromium';
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    if (!existsSync(FALLBACK)) throw e;
    browser = await chromium.launch({ headless: true, executablePath: FALLBACK });
  }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });
  await page.goto('http://localhost:8080/#/temporal-cinematic', { waitUntil: 'load', timeout: 20_000 });
  await page.waitForSelector('[data-testid="tc-capture-canvas"]', { state: 'attached', timeout: 10_000 });
  await page.waitForFunction(() => typeof window.__GENESIS_TEMPORAL_CAPTURE__ === 'function', undefined, { timeout: 10_000 });

  const state = buildHistoricalWorldState('warsaw', 1900);
  if (!state) throw new Error('no state');
  console.log('entities:', state.entities.map((e) => `${e.kind}:${e.label}`));

  const result = await page.evaluate(
    (payload) => window.__GENESIS_TEMPORAL_CAPTURE__!(payload as any),
    { temporalState: state, camera: { position: [8, 3.5, 14], target: [0, 1.5, 0], fov: 60 }, timestamp: 0, weather },
  );
  console.log('capture result:', result);
  await page.locator('[data-testid="tc-capture-canvas"]').screenshot({ path: outPath, type: 'jpeg', quality: 92 });
  console.log('saved', outPath);
  await browser.close();
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
