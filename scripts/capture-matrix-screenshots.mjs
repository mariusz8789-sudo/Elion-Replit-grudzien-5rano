/* Proprietary / All Rights Reserved - Genesis OS */
import { chromium } from 'playwright';
const BASE = process.env.GENESIS_BASE_URL ?? 'http://127.0.0.1:8080';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.addInitScript(() => { window.__GENESIS_TEST__ = true; });
await page.goto(BASE + '/matrix');
await page.waitForSelector('canvas');
await page.evaluate(() => {
  for (let i = 0; i < 6; i++) window.__genesisLedgerAppend({ index: i + 1, kind: 'ADD', recordId: 'EV-' + i, contentHash: (i.toString(16).padStart(2, '0').repeat(32)), at: 1000 + i });
  window.__genesisCepAppend({ patternId: 'CIC-DEMO', status: 'CANDIDATE', score: 0.72, confidence: 0.5, at: 1 });
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'artifacts/matrix-desktop.png' });
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
await page.screenshot({ path: 'artifacts/matrix-mobile.png' });
await browser.close();
console.log('SCREENSHOTS: artifacts/matrix-desktop.png, artifacts/matrix-mobile.png');
