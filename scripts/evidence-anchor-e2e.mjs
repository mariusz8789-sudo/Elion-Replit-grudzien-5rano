/**
 * Genesis OS — dowód wykonania dla zewnętrznych kotwic na ekranie
 * „Evidence & Replay Showcase" (#/evidence).
 *
 * DLACZEGO OSOBNY SKRYPT, SKORO JEST `smoke-e2e.mjs`. Smoke odwiedza `#/evidence`
 * i sprawdza brak błędów, ale nie zna treści: nie potwierdza, że DRUGA kotwica
 * (Kepler + Wenus, C1, P2.3 follow-up) faktycznie renderuje się obok pierwszej
 * (PubChem), że jej werdykt jest SUPPORTED, że Tautology Gate klasyfikuje ją
 * jako EMPIRICAL_TEST, że rewizja przekonania i "next question" faktycznie
 * pojawiają się w DOM-ie przeglądarki — nie tylko w testach jednostkowych.
 *
 * Użycie: node scripts/evidence-anchor-e2e.mjs [desktop|mobile]
 * (wymaga serwera pod E2E_BASE). Kod wyjścia 0 = wszystko przeszło; 2 = błąd.
 */

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME ?? '/usr/bin/chromium';
const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';

const failures = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage(
  MODE === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } },
);
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') failures.push(`console.error: ${m.text()}`); });

await page.goto(`${BASE}/#/evidence`, { waitUntil: 'networkidle' });
const skip = page.locator('button', { hasText: 'Pomiń' }).first();
if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }

const PUBCHEM_ID = 'pubchem-cid-2519-molecular-weight';
const KEPLER_ID = 'nssdc-venus-orbital-period-kepler';

await page.waitForSelector(`[data-testid="ecs-external-anchor-${PUBCHEM_ID}"]`, { timeout: 20000 });
await page.waitForSelector(`[data-testid="ecs-external-anchor-${KEPLER_ID}"]`, { timeout: 20000 });

async function textOf(testid) {
  const locator = page.locator(`[data-testid="${testid}"]`);
  if ((await locator.count()) === 0) return null;
  return (await locator.first().textContent())?.trim() ?? '';
}

// --- First anchor still renders (regression: adding the second must not break it) ---
const pubchemVerdict = await textOf(`ecs-anchor-verdict-${PUBCHEM_ID}`);
if (pubchemVerdict === null) failures.push('kotwica PubChem: brak werdyktu w DOM (regresja od dodania drugiej kotwicy)');
else if (!/SUPPORTED_WITHIN_PROTOCOL/.test(pubchemVerdict)) failures.push(`kotwica PubChem: nieoczekiwany werdykt — "${pubchemVerdict}"`);

// --- Second anchor (Kepler + Venus) renders with a real, judged verdict ---
const keplerVerdict = await textOf(`ecs-anchor-verdict-${KEPLER_ID}`);
if (keplerVerdict === null) {
  failures.push('kotwica Kepler+Wenus: brak werdyktu w DOM');
} else {
  if (!/SUPPORTED_WITHIN_PROTOCOL/.test(keplerVerdict)) failures.push(`kotwica Kepler+Wenus: oczekiwano SUPPORTED_WITHIN_PROTOCOL, jest — "${keplerVerdict}"`);
  if (!/from Venus's semi-major axis via Kepler's third law/.test(keplerVerdict)) failures.push('kotwica Kepler+Wenus: brak opisu źródła predykcji w werdykcie (predictionSourceLabel)');
}

const tautology = await textOf(`ecs-anchor-tautology-${KEPLER_ID}`);
if (tautology === null || !/EMPIRICAL_TEST/.test(tautology)) failures.push(`kotwica Kepler+Wenus: Tautology Gate nie pokazuje EMPIRICAL_TEST — "${tautology}"`);

const belief = await textOf(`ecs-anchor-belief-${KEPLER_ID}`);
if (belief === null || !/0\.500/.test(belief)) failures.push(`kotwica Kepler+Wenus: rewizja przekonania nie pokazuje neutralnego priora 0.500 — "${belief}"`);

const nextQuestion = await textOf(`ecs-anchor-next-question-${KEPLER_ID}`);
if (nextQuestion === null || nextQuestion.length < 40) failures.push(`kotwica Kepler+Wenus: "next question" jest puste lub za krótkie — "${nextQuestion}"`);

const replay = await textOf(`ecs-anchor-replay-${KEPLER_ID}`);
if (replay === null || !/^MATCH/.test(replay)) failures.push(`kotwica Kepler+Wenus: replay nie jest MATCH — "${replay}"`);

const provenance = await textOf(`ecs-anchor-provenance-${KEPLER_ID}`);
if (provenance === null || !/nssdc\.gsfc\.nasa\.gov/.test(provenance)) failures.push('kotwica Kepler+Wenus: prowieniencja nie pokazuje źródła NASA NSSDCA');
if (provenance === null || !/2296fa16/.test(provenance)) failures.push('kotwica Kepler+Wenus: prowieniencja nie pokazuje odcisku przypiętego payloadu');

const untested = await textOf(`ecs-anchor-untested-${KEPLER_ID}`);
if (untested === null || !/perihelion precession|Mercury/i.test(untested)) failures.push('kotwica Kepler+Wenus: "co pozostaje nieprzetestowane" nie wspomina realnego ograniczenia (Merkury/precesja)');

console.log(`\n=== EVIDENCE ANCHOR E2E (${MODE}) ===`);
console.log(`PubChem verdict: ${pubchemVerdict}`);
console.log(`Kepler+Venus verdict: ${keplerVerdict}`);
console.log(`Kepler+Venus tautology: ${tautology}`);
console.log(`Kepler+Venus belief: ${belief}`);
console.log(`Kepler+Venus next question: ${nextQuestion}`);
console.log(failures.length === 0 ? 'WYNIK: obie kotwice renderują się poprawnie, zero błędów konsoli/strony.' : `WYNIK: ${failures.length} błędów:\n- ${failures.join('\n- ')}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 2);
