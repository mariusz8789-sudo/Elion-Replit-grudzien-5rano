#!/usr/bin/env node
/**
 * TE5 — FULL AUTONOMOUS DISCOVERY E2E, THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/te5-autonomous-discovery-demonstrator.mjs
 *
 * The Phase E mandate's own fixture: seed Genesis with ONLY
 *
 *   "Characterize the relation between orbital period and semi-major axis
 *    in the pinned Kepler/Mars dataset WITHOUT assuming the functional
 *    form."
 *
 * — never given the answer — and let E1 (direction), E2 (novelty gate),
 * E4 (Kepler domain adapter) and the unmodified discovery engine run to a
 * verdict. The mandate is explicit about what PASS looks like here: this
 * should REPRODUCE Kepler's third law, not manufacture a false DISCOVERY.
 * `core/biotechData/externalAnchor.ts::KEPLER_MARS_ANCHOR_ID` already
 * establishes, as a declared (never inferred) fact, that this exact
 * relation over this exact dataset is centuries-old public knowledge — this
 * demonstrator hands that declaration to the orchestrator via
 * `declaredPublicAnchorResolver`, exactly the mechanism `noveltyGate.ts`
 * requires before anything can be excluded from DISCOVERY consideration.
 * Omitting it would be the novelty-inflation failure this whole mandate
 * exists to catch — the check below (`REPRODUCTION, not DISCOVERY`) is a
 * real TE6-in-context proof, not a synthetic unit test.
 *
 * Exit code 0 = every mandated property held. Exit code 1 = at least one did
 * not, with the failing property named.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(REPO, 'packages/frontend/src/core/agent/campaignOrchestrator.ts');
const ADAPTER_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/domainAdapterRegistry.ts');
const ANCHOR_MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/externalAnchor.ts');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const work = mkdtempSync(path.join(tmpdir(), 'genesis-te5-'));

// --- entry module: runs the seeded orchestrator, exports the trace ---------
const entrySource = `
import { runAutonomousOrchestrator } from '${MODULE}';
import { makeKeplerDomainAdapter } from '${ADAPTER_MODULE}';
import { KEPLER_MARS_ANCHOR_ID } from '${ANCHOR_MODULE}';

export function runTE5() {
  const trace = runAutonomousOrchestrator({
    seedAdapter: makeKeplerDomainAdapter(),
    options: { maxRounds: 7, maxTerms: 2 },
    maxCampaigns: 3,
    // Declared, not inferred: this exact relation over this exact dataset is
    // already a named public anchor in this codebase (17th-century law).
    declaredPublicAnchorResolver: () => ({
      anchorId: KEPLER_MARS_ANCHOR_ID,
      summary: "Kepler's third law (period^2 proportional to semi-major-axis^3) over the NASA NSSDC planetary fact sheet — established since the 17th century, per externalAnchor.ts's own declaration.",
    }),
  });
  return {
    stopReason: trace.stopReason,
    campaignCount: trace.campaigns.length,
    resultLabel: trace.campaigns[0]?.resultLabel ?? null,
    noveltyLevel: trace.campaigns[0]?.noveltyAssessment.level ?? null,
    winningFormula: trace.campaigns[0]?.result.discovery.winningFormulaWithCoefficients ?? null,
    campaignFingerprint: trace.campaigns[0]?.result.campaignFingerprint ?? null,
    winnerEnteredAtRound: trace.campaigns[0]?.result.discovery.winningModel?.enteredAtRound ?? null,
    winnerDerivedFrom: trace.campaigns[0]?.result.discovery.winningModel?.derivedFrom ?? null,
  };
}
`;
const entryNode = path.join(work, 'entry.node.mjs');
writeFileSync(entryNode, entrySource);

// --- Node run (twice, independently, for replay) ---------------------------
const nodeBundle = path.join(work, 'te5.node.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entryNode, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${nodeBundle}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });

console.log('GENESIS — TE5 Full Autonomous Discovery E2E (Kepler fixture)');
console.log(`node ${process.version}`);
console.log('');
console.log('Seed (verbatim, human-provided ONCE): "Characterize the relation between orbital');
console.log('period and semi-major axis in the pinned Kepler/Mars dataset WITHOUT assuming the');
console.log('functional form." No answer given.');
console.log('');

const nodeMod1 = await import(nodeBundle);
const run1 = nodeMod1.runTE5();
// A second, fully independent process-level module instance for replay —
// re-importing the SAME bundle path would hit Node's module cache, so a
// second bundle build (byte-identical source) forces a fresh module graph.
const nodeBundle2 = path.join(work, 'te5.node.2.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entryNode, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${nodeBundle2}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const nodeMod2 = await import(nodeBundle2);
const run2 = nodeMod2.runTE5();

console.log('Node run 1:', JSON.stringify(run1, null, 2));
console.log('');

// --- checks: the mandated TE5/TE6-in-context properties --------------------
record('TE5: orchestrator ran to a terminal stop reason', typeof run1.stopReason === 'string' && run1.stopReason.length > 0, run1.stopReason);
record('TE5: exactly one campaign — Kepler converges on its own real data with no further open direction', run1.campaignCount === 1, `campaignCount=${run1.campaignCount}`);
record('TE5 mandate PASS condition: label is REPRODUCTION, not a fabricated DISCOVERY', run1.resultLabel === 'REPRODUCTION', `resultLabel=${run1.resultLabel}`);
record('TE6-in-context: novelty level is NOT_NEW (declared public anchor honored, never silently ignored)', run1.noveltyLevel === 'NOT_NEW', `noveltyLevel=${run1.noveltyLevel}`);
record('Winning model formula recovered (Kepler third law in log-log space)', typeof run1.winningFormula === 'string' && run1.winningFormula.length > 0, run1.winningFormula ?? '(none)');

const slopeMatch = /\[([-\d.]+),\s*([-\d.]+)\]/.exec(run1.winningFormula ?? '');
const slope = slopeMatch ? Number(slopeMatch[2]) : null;
record('Recovered slope is close to 3/2 (Kepler\'s third law exponent)', slope !== null && Math.abs(slope - 1.5) < 0.01, `slope=${slope}`);

record('Stop reason is an honest, named stop (not a forced continuation)', ['NO_INFORMATION_GAIN', 'CONVERGED', 'NO_FEASIBLE_EXPERIMENT'].includes(run1.stopReason), run1.stopReason);

record('Replay (criterion K): two independent Node runs produce an identical campaign fingerprint', run1.campaignFingerprint !== null && run1.campaignFingerprint === run2.campaignFingerprint, `${run1.campaignFingerprint} vs ${run2.campaignFingerprint}`);
record('Fingerprint is stable and non-trivial (criterion L)', typeof run1.campaignFingerprint === 'string' && run1.campaignFingerprint.length >= 6, run1.campaignFingerprint ?? '(none)');

// --- Chromium: the SAME entry module, bundled for the browser --------------
const browserEntrySource = entrySource + `\n(globalThis).__genesisTE5 = { runTE5 };\n`;
const entryBrowser = path.join(work, 'entry.browser.ts');
writeFileSync(entryBrowser, browserEntrySource);
const browserBundle = path.join(work, 'te5.browser.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entryBrowser, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error', `--outfile=${browserBundle}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });

const CHROME = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium'].find((p) => p !== undefined && existsSync(p));
console.log('');
console.log('chromium:', CHROME);

const bundleSource = execFileSync('cat', [browserBundle], { maxBuffer: 64 * 1024 * 1024 }).toString();
const html = `<!doctype html><meta charset="utf-8"><title>TE5</title><body><script>${bundleSource}</script></body>`;
const htmlPath = path.join(work, 'te5.html');
writeFileSync(htmlPath, html);

let chromiumRun;
let pageErrors = [];
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`file://${htmlPath}`);
  chromiumRun = await page.evaluate(() => window.__genesisTE5.runTE5());
} finally {
  await browser.close();
}

console.log('Chromium run:', JSON.stringify(chromiumRun, null, 2));
record('Chromium: zero page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
record('Node === Chromium (criterion M): identical campaign fingerprint across environments', chromiumRun !== null && chromiumRun.campaignFingerprint === run1.campaignFingerprint, `${chromiumRun?.campaignFingerprint} vs ${run1.campaignFingerprint}`);
record('Node === Chromium: identical result label', chromiumRun !== null && chromiumRun.resultLabel === run1.resultLabel, `${chromiumRun?.resultLabel} vs ${run1.resultLabel}`);
record('Node === Chromium: identical stop reason', chromiumRun !== null && chromiumRun.stopReason === run1.stopReason, `${chromiumRun?.stopReason} vs ${run1.stopReason}`);

// --- summary -----------------------------------------------------------
const failed = checks.filter((c) => !c.ok);
console.log('');
console.log(`RESULT: ${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:', failed.map((c) => c.name).join('; '));
  process.exit(1);
}
process.exit(0);
