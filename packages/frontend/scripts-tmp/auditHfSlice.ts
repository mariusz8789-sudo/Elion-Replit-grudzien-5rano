import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

async function main() {
  const FALLBACK = '/opt/pw-browsers/chromium';
  let browser;
  try { browser = await chromium.launch({ headless: true }); }
  catch (e) { if (!existsSync(FALLBACK)) throw e; browser = await chromium.launch({ headless: true, executablePath: FALLBACK }); }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => { window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })); });
  await page.goto('http://localhost:8080/#/hf-slice', { waitUntil: 'load', timeout: 25_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/audit-hf-slice.png' });
  console.log('saved hf-slice');
  await browser.close();
}
main().catch((err) => { console.error('FATAL', err); process.exit(1); });
