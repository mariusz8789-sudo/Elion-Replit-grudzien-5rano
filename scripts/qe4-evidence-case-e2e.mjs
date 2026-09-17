/**
 * Genesis OS — real Chromium proof for the QE4 multi-hypothesis external
 * dataset case on the "Evidence & Replay Showcase" (#/evidence) screen.
 *
 * WHY THIS SCRIPT. `evidence-anchor-e2e.mjs` proves the two single-metric
 * external anchors render. It says nothing about the NEW section added by
 * the QE4 architecture-integration round: `MultiHypothesisCasesSection`,
 * which renders `core/agent/externalDatasetCase.ts`'s `ExternalDatasetCase`
 * for QE4 — four INDEPENDENT hypothesis verdicts over one shared, pinned
 * dataset, each with its own Tautology Gate classification, belief
 * revision, and next question, plus a case-level provenance/fingerprint
 * block and an un-collapsed verdict tally. This script proves all of that
 * is real DOM content in a real browser, not just a passing unit test.
 *
 * Usage: node scripts/qe4-evidence-case-e2e.mjs [desktop|mobile]
 * (requires a server at E2E_BASE). Exit code 0 = all checks passed; 2 = failure.
 */

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:8080';
const CHROME = process.env.CHROME ?? '/usr/bin/chromium';
const MODE = process.argv[2] === 'mobile' ? 'mobile' : 'desktop';

const CASE_ID = 'qe4-brydges-zenodo-2527010';
const HYPOTHESIS_IDS = ['P1', 'P2', 'P3', 'P4'];

const failures = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage(
  MODE === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } },
);
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') failures.push(`console.error: ${m.text()}`); });

await page.goto(`${BASE}/#/evidence`, { waitUntil: 'networkidle', timeout: 60000 });
const skip = page.locator('button', { hasText: 'Pomiń' }).first();
if (await skip.count()) { await skip.click(); await page.waitForTimeout(600); }

await page.waitForSelector(`[data-testid="ecs-case-${CASE_ID}"]`, { timeout: 30000 });

async function textOf(testid) {
  const locator = page.locator(`[data-testid="${testid}"]`);
  if ((await locator.count()) === 0) return null;
  return (await locator.first().textContent())?.trim() ?? '';
}

// --- Case-level provenance/fingerprint ---
const provenance = await textOf(`ecs-case-provenance-${CASE_ID}`);
if (provenance === null || !/zenodo\.org\/records\/2527010/.test(provenance)) failures.push('QE4 case: provenance does not show the Zenodo record URL');
if (provenance === null || !/cc-by-4\.0/.test(provenance)) failures.push('QE4 case: provenance does not show the cc-by-4.0 license');
if (provenance === null || !/87424c2ddfbc9e68361d70a41878b63919ceb7257bdb70b4fad65d4179cd8389/.test(provenance)) failures.push('QE4 case: provenance does not show the archive SHA-256');
if (provenance === null || !/a6578ae8/.test(provenance)) failures.push('QE4 case: provenance does not show the domain result fingerprint a6578ae8');

// --- Verdict tally, never a single collapsed verdict ---
const tally = await textOf(`ecs-case-tally-${CASE_ID}`);
if (tally === null || !/4×\s*SUPPORTED_WITHIN_MODEL/.test(tally)) failures.push(`QE4 case: verdict tally does not show "4x SUPPORTED_WITHIN_MODEL" — "${tally}"`);

// --- Each of the four hypotheses renders independently ---
for (const id of HYPOTHESIS_IDS) {
  const verdict = await textOf(`ecs-case-verdict-${CASE_ID}-${id}`);
  if (verdict === null) { failures.push(`QE4 case: ${id} verdict missing from DOM`); continue; }
  if (!/SUPPORTED_WITHIN_MODEL/.test(verdict)) failures.push(`QE4 case: ${id} — expected SUPPORTED_WITHIN_MODEL, got "${verdict}"`);

  const tautology = await textOf(`ecs-case-tautology-${CASE_ID}-${id}`);
  if (tautology === null || !/EMPIRICAL_TEST/.test(tautology)) failures.push(`QE4 case: ${id} — Tautology Gate does not show EMPIRICAL_TEST — "${tautology}"`);

  const belief = await textOf(`ecs-case-belief-${CASE_ID}-${id}`);
  if (belief === null || !/0\.500/.test(belief)) failures.push(`QE4 case: ${id} — belief revision does not show the neutral 0.500 prior — "${belief}"`);

  const nextQuestion = await textOf(`ecs-case-next-question-${CASE_ID}-${id}`);
  if (nextQuestion === null || nextQuestion.length < 40) failures.push(`QE4 case: ${id} — next question is empty or too short — "${nextQuestion}"`);
}

// --- Honesty footer: reproduction/replication, not discovery ---
const honesty = await textOf(`ecs-case-honesty-${CASE_ID}`);
if (honesty === null || !/[Rr]eproduction.*replication/.test(honesty)) failures.push('QE4 case: honesty note does not state reproduction/replication (not discovery)');

// --- Regression: the pre-existing external anchors still render alongside the new section ---
const PUBCHEM_ID = 'pubchem-cid-2519-molecular-weight';
await page.waitForSelector(`[data-testid="ecs-external-anchor-${PUBCHEM_ID}"]`, { timeout: 10000 }).catch(() => {
  failures.push('regression: PubChem external anchor no longer renders alongside the new QE4 case section');
});

console.log(`\n=== QE4 EVIDENCE CASE E2E (${MODE}) ===`);
console.log(`Provenance: ${provenance}`);
console.log(`Verdict tally: ${tally}`);
console.log(`Honesty note: ${honesty}`);
console.log(failures.length === 0 ? 'WYNIK: QE4 multi-hypothesis case renders all 4 independent verdicts correctly, zero console/page errors.' : `WYNIK: ${failures.length} błędów:\n- ${failures.join('\n- ')}`);
await browser.close();
process.exit(failures.length === 0 ? 0 : 2);
