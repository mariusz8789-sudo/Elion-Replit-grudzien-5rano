/**
 * Smoke test tras + test izolacji awarii (P0-hardening).
 *
 * Uruchamiany RĘCZNIE (nie w CI — Playwright nie jest zależnością repo):
 *   1. npm run build --workspace=packages/frontend
 *   2. npx vite preview --port 4611 &   (w packages/frontend)
 *   3. npm i -g playwright-core  (lub lokalnie) i:
 *      SMOKE_BASE=http://localhost:4611 node packages/frontend/scripts/smoke-routes.mjs
 *
 * Sprawdza dwie rzeczy:
 *  A) każda główna trasa renderuje się bez uncaught error (root ma dzieci),
 *  B) awaria JEDNEGO leniwie ładowanego, ciężkiego modułu (zablokowany chunk)
 *     pokazuje kartę błędu dla TEJ trasy, ale nie zeruje całej aplikacji —
 *     strona główna nadal działa. To dowód, że <HeavyRoute> (ErrorBoundary +
 *     Suspense) izoluje awarie per-trasa.
 *
 * Kod wyjścia: 0 gdy wszystko OK, 1 gdy którakolwiek asercja padnie.
 */
import { chromium } from 'playwright-core';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4611';
const EXE = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';

const ROUTES = [
  ['', '.labs-grid, .timeline-cta'],
  ['#/lab/universe', '.topbar h1'],
  ['#/generate', '.generator-input'],
  ['#/timeline', '.topbar h1'],
  ['#/settings', '.settings-view'],
  ['#/glossary', '.topbar h1'],
  ['#/what-if', '.topbar h1'],
  ['#/campaign', '.topbar h1'],
  ['#/reality', '.topbar h1'],
];

const browser = await chromium.launch({ executablePath: EXE });
let failures = 0;

for (const [hash, sel] of ROUTES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
  let sawSelector = false;
  try { await page.waitForSelector(sel, { timeout: 8000 }); sawSelector = true; } catch { /* wolny WebGL itd. */ }
  const rootKids = await page.evaluate(() => document.getElementById('root')?.children.length ?? 0);
  const ok = rootKids > 0 && errors.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${hash || '(home)'}  root=${rootKids} sel=${sawSelector} errors=${errors.length}`);
  await page.close();
}

// Fault injection: zablokuj chunk generatora i sprawdź izolację.
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));
await page.route('**/SimulationGeneratorScreen-*.js', (r) => r.abort());
await page.goto(`${BASE}/#/generate`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const errorCard = await page.evaluate(() => !!document.querySelector('.error-screen'));
const rootAlive = await page.evaluate(() => (document.getElementById('root')?.children.length ?? 0) > 0);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
let homeOk = false;
try { await page.waitForSelector('.labs-grid, .timeline-cta', { timeout: 8000 }); homeOk = true; } catch { /* */ }
const faultOk = errorCard && rootAlive && homeOk;
if (!faultOk) failures++;
console.log(`${faultOk ? 'OK  ' : 'FAIL'} fault-injection  errorCard=${errorCard} rootAlive=${rootAlive} homeAfter=${homeOk}`);

await browser.close();
console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
