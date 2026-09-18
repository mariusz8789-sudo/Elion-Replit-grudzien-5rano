#!/usr/bin/env node
/**
 * GENESIS — Myth & Theory Lab (#/myths-theories) browser proof.
 *
 *   npm run e2e:myths   (requires the production server on http://localhost:8080)
 *
 * Opens the route in real Chromium, checks the title, the visible `allowUnphysicalSandbox: true`
 * gate, runs one solver and waits for a real warning flag to appear; exits 1 on any page error.
 */
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium', args: ['--no-sandbox', '--use-gl=swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.goto('http://localhost:8080/#/myths-theories', { waitUntil: 'networkidle' });
const title = await page.textContent('h1').catch(() => null);
const gate = (await page.textContent('.myth-gate').catch(() => '')).trim();
await page.click('.myth-run');
await page.waitForFunction(() => /NEGATIVE_ENERGY_REQUIRED|RETROCAUSAL_FIXED_POINT|TORSION_BOUNDARY_SPECULATIVE/.test(document.body.textContent || ''), null, { timeout: 30000 });
const body = (await page.textContent('body')).replace(/\s+/g, ' ');
console.log(`title=${title} | gate=${gate} | source=${/backend/.test(body) ? 'backend' : 'offline-preview?'} | warnings=${(body.match(/[A-Z_]{8,}/g) || []).filter((w) => /ENERGY|RETROCAUSAL|TORSION|METRIC|UNCONVERGED/.test(w)).slice(0, 4).join(',')} | errors=${errors.length}`);
await browser.close(); process.exit(errors.length ? 1 : 0);
