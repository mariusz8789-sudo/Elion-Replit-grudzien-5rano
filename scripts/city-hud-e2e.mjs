#!/usr/bin/env node
/**
 * GENESIS — City 3D + HUD chat + approval-gate browser proof.
 *
 *   npm run e2e:city-hud   (requires the production server on http://localhost:8080)
 *
 * Mapped from the externally supplied `city.e2e.spec.ts` / `government-manifest.e2e.spec.ts`
 * (written against selectors and slash-commands that do not exist here) onto the real product:
 *   1. #/city3d renders a WebGL canvas with zero page errors and zero console errors
 *      (the error listeners are attached BEFORE navigation — the supplied spec attached them
 *      after, which made its assertion vacuous);
 *   2. the Science Chat HUD input accepts a command and the transcript grows;
 *   3. the 3D viewport survives a drag interaction;
 *   4. publishing a knowledge proposal without a signed-in approver is refused (HTTP 401) —
 *      the real "approval gate" of this repository.
 * Exits 1 on any failure.
 */
import { chromium } from 'playwright';
const BASE = process.env.GENESIS_BASE ?? 'http://localhost:8080';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const pageErrors = []; const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
const failures = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) failures.push(name); };

// 1. City 3D canvas
await page.goto(`${BASE}/#/city3d`, { waitUntil: 'networkidle' });
await page.waitForSelector('canvas', { timeout: 30000 }).catch(() => null);
const canvasCount = await page.locator('canvas').count();
check('city3d renders a WebGL canvas', canvasCount > 0, `canvases=${canvasCount}`);

// 3. Drag on the viewport
const box = await page.locator('canvas').first().boundingBox();
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
}
check('viewport survives a drag interaction', (await page.locator('canvas').count()) > 0 && pageErrors.length === 0, `pageErrors=${pageErrors.length}`);

// 2. HUD chat accepts a command
await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });
const fab = page.locator('.science-chat-fab');
if (await fab.count()) await fab.first().click();
const input = page.locator('.science-chat-form input').first();
await input.waitFor({ timeout: 15000 });
const before = await page.locator('.science-chat-form').evaluate((f) => (f.closest('section, aside, div')?.textContent ?? '').length);
await input.fill('Uruchom trzęsienie ziemi magnitude=5.4 depth=12 km');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const after = await page.locator('.science-chat-form').evaluate((f) => (f.closest('section, aside, div')?.textContent ?? '').length);
check('HUD chat input accepts a command and the transcript grows', after > before, `chars ${before} -> ${after}`);

// 4. Approval gate: publish without approver -> 401 (probed from Node, not from the page, so the
//    browser console stays a clean signal for the product itself)
const status = (await fetch(`${BASE}/api/knowledge/proposals/nonexistent/publish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status;
check('publishing a proposal without a signed-in approver is refused', status === 401, `HTTP ${status}`);

check('zero page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
check('zero console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
await browser.close();
console.log(failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL PASSED');
process.exit(failures.length ? 1 : 0);
