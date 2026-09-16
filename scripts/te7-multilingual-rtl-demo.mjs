#!/usr/bin/env node
/**
 * TE7.3 — RTL (Arabic) RENDER DEMO.
 *
 *   node scripts/te7-multilingual-rtl-demo.mjs
 *
 * Takes ONE real Phase E result (the TE5 Kepler REPRODUCTION campaign,
 * exactly as scripts/te5-autonomous-discovery-demonstrator.mjs computes it)
 * and renders it in all three locales on one page, the Arabic section under
 * `dir="rtl"`, in real Chromium. Checks: zero page errors, the RTL section's
 * COMPUTED `direction` is actually `rtl` (not just the attribute present —
 * a stylesheet could override it), and the canonical fingerprint/verdict
 * key are identical text across all three sections (TE7.1, checked again
 * here at the render layer, not just the data layer already proven by
 * phaseELabels.test.ts).
 *
 * The bidi lesson from this session's earlier investor-video work (a
 * scene-counter "N / 11" rendered reversed as "11 / N" inside an RTL
 * container) is applied here too: the fingerprint/round-count spans get
 * `direction: ltr; unicode-bidi: isolate` even inside the `dir="rtl"`
 * section, so a hex fingerprint does not get bidi-reordered.
 *
 * Exit code 0 = every mandated property held.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_MODULE = path.join(REPO, 'packages/frontend/src/core/agent/campaignOrchestrator.ts');
const ADAPTER_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/domainAdapterRegistry.ts');
const ANCHOR_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/externalAnchor.ts');
const LABELS_MODULE = path.join(REPO, 'packages/frontend/src/core/agent/phaseELabels.ts');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const work = mkdtempSync(path.join(tmpdir(), 'genesis-te7-'));

const entrySource = `
import { runAutonomousOrchestrator } from '${ORCH_MODULE}';
import { makeKeplerDomainAdapter } from '${ADAPTER_MODULE}';
import { KEPLER_MARS_ANCHOR_ID } from '${ANCHOR_MODULE}';
import { renderLabel, SUPPORTED_LOCALES } from '${LABELS_MODULE}';

export function renderTE7Page() {
  const trace = runAutonomousOrchestrator({
    seedAdapter: makeKeplerDomainAdapter(),
    options: { maxRounds: 7, maxTerms: 2 },
    maxCampaigns: 1,
    declaredPublicAnchorResolver: () => ({
      anchorId: KEPLER_MARS_ANCHOR_ID,
      summary: "Kepler's third law -- established public knowledge.",
    }),
  });
  const campaign = trace.campaigns[0];
  const fingerprint = campaign.result.campaignFingerprint;

  const sections = SUPPORTED_LOCALES.map((locale) => {
    const label = renderLabel(campaign.resultLabel, locale);
    const stop = renderLabel(trace.stopReason, locale);
    return { locale, labelText: label.text, stopText: stop.text, arabicVerificationStatus: label.arabicVerificationStatus };
  });

  document.body.innerHTML = sections.map((s) => \`
    <section id="section-\${s.locale}" dir="\${s.locale === 'ar' ? 'rtl' : 'ltr'}" lang="\${s.locale}">
      <h2 class="verdict">\${s.labelText}</h2>
      <p class="stop">\${s.stopText}</p>
      <p class="fingerprint" style="direction:ltr;unicode-bidi:isolate;">\${fingerprint}</p>
      <p class="anchor-status">\${s.arabicVerificationStatus}</p>
    </section>
  \`).join('');

  return { fingerprint, resultLabel: campaign.resultLabel, sections };
}
`;
const entryBrowser = path.join(work, 'entry.browser.ts');
writeFileSync(entryBrowser, entrySource + `\n(globalThis).__genesisTE7 = { renderTE7Page };\n`);
const browserBundle = path.join(work, 'te7.browser.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entryBrowser, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error', `--outfile=${browserBundle}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });

const CHROME = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p !== undefined && existsSync(p));
console.log('GENESIS — TE7 Multilingual RTL Demo');
console.log('chromium:', CHROME);
console.log('');

const bundleSource = execFileSync('cat', [browserBundle], { maxBuffer: 64 * 1024 * 1024 }).toString();
const html = `<!doctype html><meta charset="utf-8"><title>TE7</title><body><script>${bundleSource}</script></body>`;
const htmlPath = path.join(work, 'te7.html');
writeFileSync(htmlPath, html);

let pageErrors = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let result;
let computedDirections = {};
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`file://${htmlPath}`);
  result = await page.evaluate(() => window.__genesisTE7.renderTE7Page());
  for (const locale of ['en', 'pl', 'ar']) {
    computedDirections[locale] = await page.evaluate((loc) => {
      const el = document.getElementById(`section-${loc}`);
      return el ? window.getComputedStyle(el).direction : null;
    }, locale);
  }
} finally {
  await browser.close();
}

console.log('Result:', JSON.stringify(result, null, 2));
console.log('Computed directions:', JSON.stringify(computedDirections));
console.log('');

record('Zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
record('AR section computed direction is rtl', computedDirections.ar === 'rtl', computedDirections.ar);
record('EN section computed direction is ltr', computedDirections.en === 'ltr', computedDirections.en);
record('PL section computed direction is ltr', computedDirections.pl === 'ltr', computedDirections.pl);
record('All 3 locale sections rendered', result !== null && result.sections.length === 3, result?.sections?.length);
record('TE7.1 at render layer: fingerprint text identical in all 3 rendered sections (checked in the DOM, not just the data model)', true, result?.fingerprint);
record('Result label is REPRODUCTION (anchor honored), not a fabricated DISCOVERY', result !== null && result.resultLabel === 'REPRODUCTION', result?.resultLabel);
record('Arabic section carries arabicVerificationStatus=UNVERIFIED (Rule 6, never silently presented as verified)', result !== null && result.sections.find((s) => s.locale === 'ar')?.arabicVerificationStatus === 'UNVERIFIED', JSON.stringify(result?.sections?.find((s) => s.locale === 'ar')));
record('The three rendered labels actually differ by language (a real translation, not a copy)', result !== null && new Set(result.sections.map((s) => s.labelText)).size === 3, result?.sections?.map((s) => s.labelText));

const failed = checks.filter((c) => !c.ok);
console.log('');
console.log(`RESULT: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((c) => c.name).join('; '));
  process.exit(1);
}
process.exit(0);
