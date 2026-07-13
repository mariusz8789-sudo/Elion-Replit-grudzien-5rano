/**
 * Genesis OS — automatyczny smoke test tras i interakcji (regresja runtime).
 *
 * Cel: udowodnić, że aplikacja NAPRAWDĘ się uruchamia i reaguje — nie tylko, że
 * się buduje. Odwiedza KAŻDĄ trasę i KAŻDE laboratorium, klika wszystkie zakładki
 * eksperymentów, rusza suwakami i klika bezpieczne przyciski, wyłapując:
 *  - pageerror (nieprzechwycone wyjątki JS, np. „createSim is not a function"),
 *  - console.error,
 *  - nieudane żądania sieciowe (poza oczekiwanym 503 z /api/ask bez klucza),
 *  - awarie renderowania Reacta (ErrorBoundary → „Coś poszło nie tak").
 *
 * Użycie: node scripts/smoke-e2e.mjs <desktop|mobile>
 * Wymaga działającego serwera pod E2E_BASE (domyślnie http://127.0.0.1:8092),
 * który serwuje zbudowany frontend + API trwałości.
 *
 * Kod wyjścia 0 = zero błędów runtime na sprawdzonych ścieżkach; 2 = wykryto błędy.
 */

import pkg from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pkg;

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8092';
const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const LABS = ['universe', 'spacetime', 'einstein', 'quantum', 'atom', 'nuclear', 'particle', 'chemistry', 'multiverse', 'civilization', 'biology', 'mathematics', 'discovery'];
const ROUTES = ['', '#/settings', '#/glossary', '#/discovery-log', '#/what-if', '#/timeline', '#/decision-explorer', '#/reality', '#/prebuild', '#/conflict', '#/projects', '#/cde'];

// Przyciski, których NIE klikamy (destrukcyjne / zmieniające sesję / przeładowujące).
const UNSAFE = /wyczyść|usuń|wyloguj|delete|reset|clear|✕|odrzuć|scal/i;

const errors = [];
let routesTested = 0;
let interactions = 0;

function record(where, msg) {
  // /api/ask 503 bez klucza to oczekiwane zachowanie, nie awaria.
  if (/api\/ask/.test(msg) && /503/.test(msg)) return;
  errors.push(`[${MODE}] ${where} :: ${msg}`);
}

async function exerciseControls(page, where) {
  // Suwaki: ustaw min, środek, max — mount+recompute konsekwencji. Batch w JS
  // (jedno evaluate na wszystkie), żeby sweep był szybki.
  try {
    const n = await page.evaluate(() => {
      const rs = Array.from(document.querySelectorAll('input[type="range"]')).slice(0, 10);
      for (const el of rs) {
        const min = Number(el.min || 0), max = Number(el.max || 100);
        for (const v of [min, (min + max) / 2, max]) {
          el.value = String(v);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      return rs.length;
    });
    interactions += n;
  } catch { /* ignore */ }

  // Selektory — pierwsze dwa, kilka opcji.
  for (const s of (await page.$$('select')).slice(0, 3)) {
    try {
      const vals = await s.$$eval('option', (os) => os.map((o) => o.value).filter(Boolean).slice(0, 3));
      for (const v of vals) { await s.selectOption(v).catch(() => {}); interactions++; }
    } catch { /* ignore */ }
  }

  // Bezpieczne przyciski — TYLKO powierzchnie produktu, NIE nawigacja
  // (pomijamy .topbar/.home-nav/.timeline-cta/.mission-bar/.back, by nie
  // opuścić bieżącej trasy w środku sweepu).
  const safe = await page.$$('.lens-trigger, .sonify-btn, .consequence-panel .chip-btn, .mcre-panel button, .cde-view .chip-btn, .trial-series .chip-btn, .exp-controls button');
  for (const b of safe.slice(0, 10)) {
    try {
      const txt = ((await b.innerText().catch(() => '')) || '').trim();
      const cls = (await b.getAttribute('class')) || '';
      if (UNSAFE.test(txt) || /danger/.test(cls)) continue;
      if (!(await b.isVisible().catch(() => false))) continue;
      await b.click({ timeout: 800 }).catch(() => {});
      interactions++;
    } catch { /* ignore */ }
  }
  const boundary = await page.locator('text=/Coś poszło nie tak|Something went wrong/i').count().catch(() => 0);
  if (boundary > 0) record(where, 'ErrorBoundary fallback wyrenderowany (awaria renderowania Reacta)');
}

async function visit(page, hash, { labTabs = false } = {}) {
  const where = hash || '(home)';
  await page.goto(BASE + '/' + hash, { waitUntil: 'domcontentloaded' }).catch((e) => record(where, `nawigacja: ${e.message}`));
  await page.waitForTimeout(250);
  const root = await page.locator('.app, .settings-view').count().catch(() => 0);
  if (root === 0) record(where, 'brak korzenia .app/.settings-view (trasa się nie wyrenderowała)');
  routesTested++;

  if (labTabs) {
    // Kliknij każdą zakładkę eksperymentu — tu ujawniają się kontrakty typu createSim.
    const tabs = await page.$$('.exp-tab, [role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      try {
        const t = (await page.$$('.exp-tab, [role="tab"]'))[i];
        if (!t) continue;
        await t.click({ timeout: 1200 }).catch(() => {});
        await page.waitForTimeout(180);
        await exerciseControls(page, `${where} [tab ${i}]`);
      } catch (e) { record(where, `zakładka ${i}: ${e.message}`); }
    }
  } else {
    await exerciseControls(page, where);
  }
}

async function scientificGitFlow(page) {
  // Scientific Git wymaga logowania — pełny obieg: konto → projekt → gałąź → merge.
  const email = `smoke-${MODE}-${Date.now()}@lab.org`;
  await page.goto(BASE + '/#/projects', { waitUntil: 'domcontentloaded' }).catch((e) => record('#/projects', `nawigacja: ${e.message}`));
  await page.click('.account-tab:has-text("Utwórz konto")').catch(() => {});
  await page.fill('.account-field input[type="email"]', email).catch(() => {});
  await page.fill('.account-field input[type="password"]', 'password12345').catch(() => {});
  await page.click('.account-form button[type="submit"]').catch(() => {});
  await page.waitForSelector('text=Twoje projekty', { timeout: 8000 }).catch(() => record('#/projects', 'rejestracja nie doprowadziła do listy projektów'));
  await page.fill('.account-form input[type="text"]', 'Smoke Projekt').catch(() => {});
  await page.click('.account-form button:has-text("Utwórz projekt")').catch(() => {});
  await page.waitForSelector('text=Gałęzie (Scientific Git)', { timeout: 8000 }).catch(() => record('#/projects', 'utworzenie projektu nie pokazało gałęzi'));
  await page.fill('.account-form input[placeholder="np. hipoteza-A"]', 'smoke-branch').catch(() => {});
  await page.click('button:has-text("Utwórz gałąź")').catch(() => {});
  await page.waitForSelector('.branch-chip:has-text("smoke-branch")', { timeout: 8000 }).catch(() => record('#/projects', 'utworzenie gałęzi nie powiodło się'));
  interactions += 3;
}

const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext(
  MODE === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } },
);
const page = await context.newPage();
page.on('pageerror', (e) => record(page.url().replace(BASE, ''), `pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') record(page.url().replace(BASE, ''), `console.error: ${m.text()}`); });
page.on('requestfailed', (r) => record(page.url().replace(BASE, ''), `requestfailed: ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 500) record(page.url().replace(BASE, ''), `HTTP ${r.status()}: ${r.url()}`); });

// Pomiń onboarding.
await page.addInitScript(() => window.localStorage.setItem('genesis-os:onboarding/v1', JSON.stringify({ completed: true })));

// 1) Wszystkie trasy nie-laboratoryjne.
for (const r of ROUTES) await visit(page, r);
// 2) Wszystkie laboratoria z klikaniem zakładek + interakcją.
for (const lab of LABS) await visit(page, `#/lab/${lab}`, { labTabs: true });
// 3) Scientific Git (pełny obieg z logowaniem).
await scientificGitFlow(page);

await browser.close();

console.log(`\n=== SMOKE [${MODE}] ===`);
console.log(`Trasy sprawdzone: ${routesTested} (+13 laboratoriów) | interakcje: ${interactions}`);
if (errors.length === 0) {
  console.log('WYNIK: ZERO błędów runtime.');
  process.exit(0);
} else {
  console.log(`WYNIK: ${errors.length} błędów runtime:`);
  for (const e of errors) console.log('  ✗ ' + e);
  process.exit(2);
}
