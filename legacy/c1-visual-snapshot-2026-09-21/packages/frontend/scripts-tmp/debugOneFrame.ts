import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

async function main() {
  const FALLBACK = '/opt/pw-browsers/chromium';
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.log('default launch failed, falling back:', (e as Error).message.slice(0, 200));
    if (!existsSync(FALLBACK)) throw e;
    browser = await chromium.launch({ headless: true, executablePath: FALLBACK });
  }
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('console', (msg) => console.log('[page console]', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('[page error]', err.message));
  page.on('requestfailed', (req) => console.log('[request failed]', req.url(), req.failure()?.errorText));
  await page.addInitScript(() => {
    window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true }));
  });

  console.log('navigating...');
  await page.goto('http://localhost:8080/#/temporal-cinematic', { waitUntil: 'load', timeout: 20_000 });
  console.log('navigated (load event fired)');
  console.log('page title:', await page.title());
  console.log('page url:', page.url());
  await page.screenshot({ path: '/tmp/debug-fullpage.png', fullPage: true }).catch((e) => console.log('fullpage screenshot failed', e.message));
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
  console.log('body text (first 2000 chars):', bodyText);
  const testIds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-testid]')).map((el) => el.getAttribute('data-testid')));
  console.log('data-testid elements found:', testIds);

  await page.waitForSelector('[data-testid="tc-capture-canvas"]', { state: 'attached', timeout: 10_000 });
  console.log('canvas found (attached)');

  await page.waitForFunction(() => typeof window.__GENESIS_TEMPORAL_CAPTURE__ === 'function', undefined, { timeout: 10_000 });
  console.log('capture hook found');

  const state = {
    locationId: 'warsaw', year: 1900,
    anchor: { locationId: 'warsaw', label: 'test', position: [0, 0, 0], yaw: 0, extentMeters: 120 },
    entities: [
      { id: 'b1', kind: 'BUILDING', label: 'wooden tenement', position: [10, 0, 10], validity: { validFrom: 1850, validTo: 1944 }, provenance: { source: 'x', knowledgeStatus: 'ESTIMATED', confidence: 0.6, generationMethod: 'ERA_LOOKUP' }, attributes: {} },
    ],
    worldGraphSnapshotId: 'test',
  };

  console.log('calling capture hook...');
  const start = Date.now();
  const result = await page.evaluate(
    (s) => window.__GENESIS_TEMPORAL_CAPTURE__!({ temporalState: s as any, camera: { position: [30, 15, 30], target: [0, 0, 0], fov: 50 }, timestamp: 0 }),
    state,
  );
  console.log('capture hook resolved in', Date.now() - start, 'ms:', result);

  await page.locator('[data-testid="tc-capture-canvas"]').screenshot({ path: '/tmp/debug-frame.jpg', type: 'jpeg', quality: 92 });
  console.log('screenshot saved');

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
