#!/usr/bin/env node
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8181';
const CHROME = ['/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1024, height: 640 } });
await context.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });

await page.goto(`${BASE}/#/temporal-cinematic?place=Warsaw&year=1900&duration=3`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.__GENESIS_TEMPORAL_CAPTURE__ !== undefined', null, { timeout: 20000 }).catch((e) => errors.push(`capture hook never appeared: ${e.message}`));
const canvas = await page.locator('canvas').count();
const hook = await page.evaluate(() => window.__GENESIS_TEMPORAL_CAPTURE__ ?? null);
console.log('canvas count:', canvas);
console.log('hook:', JSON.stringify(hook));
await browser.close();
if (errors.length > 0) {
  console.log('ERRORS:', errors);
  process.exit(1);
}
process.exit(canvas > 0 && hook ? 0 : 2);
