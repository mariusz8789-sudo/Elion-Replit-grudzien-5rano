/**
 * Genesis OS — dowód wykonania dla ekranu „Autonomiczne dochodzenie" (#/inquiry).
 *
 * DLACZEGO OSOBNY SKRYPT, SKORO JEST `smoke-e2e.mjs`. Smoke odwiedza trasy i
 * rusza kontrolkami, ale NIE wchodzi na `#/inquiry` i nie potrafi sprawdzić
 * tego, co tu jest jedyną rzeczą wartą sprawdzenia: że kliknięcie „Uruchom
 * dochodzenie" naprawdę przepuszcza problem przez strategię PARAMETER, że pętla
 * wykonuje realne przebiegi solvera i że raport pokazuje JEJ decyzje, a nie
 * tekst z ekranu. „Zbudowało się" i „testy jednostkowe zielone" tego nie
 * dowodzą — dowodzi tego wyłącznie uruchomienie w przeglądarce.
 *
 * Dla każdego z pięciu dochodzeń skrypt wymaga:
 *   - werdyktu (`inquiry-verdict`) z jednym z trzech dopuszczonych rozstrzygnięć,
 *   - co najmniej dwóch rund w tabeli raportu,
 *   - nazwanej reguły wyboru sondy w rundzie 2 (czyli: agent wybrał następny
 *     pomiar NA PODSTAWIE poprzedniego, a nie z listy po kolei),
 *   - zera pageerror i zera console.error.
 *
 * Użycie: node scripts/inquiry-e2e.mjs   (wymaga serwera pod E2E_BASE)
 * Kod wyjścia 0 = wszystkie pięć dochodzeń przeszły; 2 = coś nie przeszło.
 */

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME ?? '/usr/bin/chromium';

/** Wszystkie problemy, jakie ekran deklaruje. Brak któregokolwiek to błąd. */
const PROBLEMS = ['quantum-junction', 'protein-folding', 'qe1-visibility', 'qe2-monogamy', 'qe3-bound-entanglement'];

/** Reguły wyboru sondy, jakie `inquiryLoop` potrafi wypisać dla rundy 2+. */
const SELECTION_RULES = /DISCRIMINATES_TOP_TWO|DISCRIMINATES_OTHER_PAIR|No untried setting|the two strongest surviving hypotheses/;

const failures = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') failures.push(`console.error: ${m.text()}`); });

await page.goto(`${BASE}/#/inquiry`, { waitUntil: 'networkidle' });
// Onboarding zasłania każdą trasę na świeżym profilu; pomijamy je tak, jak user.
const skip = page.locator('button', { hasText: 'Pomiń' }).first();
if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }
await page.waitForSelector('[data-testid="inquiry-problem"]', { timeout: 20000 });

const declared = await page.$$eval('[data-testid="inquiry-problem"] option', (os) => os.map((o) => o.value));
for (const id of PROBLEMS) {
  if (!declared.includes(id)) failures.push(`brak problemu "${id}" na liście ekranu (jest: ${declared.join(', ')})`);
}

for (const id of declared) {
  await page.selectOption('[data-testid="inquiry-problem"]', id);
  await page.click('[data-testid="run-inquiry"]');
  try {
    await page.waitForSelector('[data-testid="inquiry-verdict"]', { timeout: 30000 });
  } catch {
    failures.push(`${id}: dochodzenie nie wyprodukowało werdyktu`);
    continue;
  }
  const verdict = (await page.textContent('[data-testid="inquiry-verdict"]')).trim();
  if (!/ODZYSKANY|ZAWĘŻONE, NIEROZSTRZYGNIĘTE|BŁĄD ODZYSKANIA|Żadna hipoteza/.test(verdict)) {
    failures.push(`${id}: werdykt nie jest żadnym ze znanych rozstrzygnięć — "${verdict}"`);
  }
  const report = await page.evaluate(() => document.querySelector('#main-content').innerText);
  const rounds = (report.match(/measure at /g) ?? []).length;
  if (rounds < 2) failures.push(`${id}: raport pokazuje ${rounds} rund — dochodzenie z jedną rundą niczego nie wybiera`);
  if (!SELECTION_RULES.test(report)) failures.push(`${id}: raport nie nazywa reguły, którą wybrano kolejną sondę`);
  if (!/(SUPPORTED_WITHIN_PROTOCOL|FALSIFIED_WITHIN_PROTOCOL)/.test(report)) {
    failures.push(`${id}: raport nie pokazuje werdyktów falsyfikacyjnych dla hipotez`);
  }
  console.log(`[inquiry] ${id.padEnd(24)} rundy=${rounds}  ${verdict.slice(0, 72)}`);
}

console.log(`\n=== INQUIRY E2E === problemy: ${declared.length}`);
console.log(failures.length === 0 ? 'WYNIK: wszystkie dochodzenia uruchomiły się i zwróciły rozstrzygnięcie.' : `WYNIK: ${failures.length} błędów:\n- ${failures.join('\n- ')}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 2);
