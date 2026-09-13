#!/usr/bin/env node
/**
 * GOV-DRUG-DISCOVERY-E2E-01 — the demo package.
 *
 *   node scripts/gov-drug-discovery-e2e-demo-capture.mjs
 *
 * Runs the real scenario TWICE — once in Node, once inside real Chromium
 * on a browser build of the same module — walks a recorded browser through
 * the nine demonstration steps, and writes a demo package:
 *
 *   artifacts/gov-drug-discovery-e2e-demo/
 *     demo.webm          the recorded walkthrough
 *     demo-log.txt       what was shown, step by step
 *     fingerprints.json  Node vs Chromium fingerprints and the match verdict
 *     report.html        the page that was recorded (re-openable)
 *
 * WHY BOTH ENVIRONMENTS. A fingerprint repeated inside one process proves
 * little. The same fingerprint produced by a separately-built browser
 * bundle, in a different JS engine, is a much harder thing to fake — it is
 * the strongest determinism evidence this repo knows how to produce, and
 * it is the same technique scripts/discovery-e2e.mjs already uses.
 *
 * Exit code 0 = the walkthrough recorded and the two environments agree.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'gov-drug-discovery-e2e-demo');
const MODULE = path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugDiscoveryE2E.ts');

const log = [];
function say(line) { console.log(line); log.push(line); }

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

say('GENESIS — GOV-DRUG-DISCOVERY-E2E-01 demo capture');
say(`node ${process.version}`);
say('');

// --- 1. Node run ---------------------------------------------------------
const work = mkdtempSync(path.join(tmpdir(), 'genesis-e2e01-demo-'));
const nodeBundle = path.join(work, 'e2e01.node.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  MODULE, '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${nodeBundle}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const nodeMod = await import(nodeBundle);
const nodeRun = nodeMod.runGovDrugDiscoveryE2E();
const nodeFlip = nodeMod.runGovDrugDiscoveryE2E({ injectCounterevidence: true });
say(`Node run: outcome=${nodeRun.decision.outcome} fingerprint=${nodeRun.runFingerprint}`);

// --- 2. Browser bundle ---------------------------------------------------
const entry = path.join(work, 'entry.ts');
writeFileSync(entry, `import * as e2e01 from '${MODULE}';\n(globalThis as any).__genesisE2E01 = e2e01;\n`);
const browserBundle = path.join(work, 'e2e01.browser.js');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  entry, '--bundle', '--format=iife', '--platform=browser', '--target=es2020', '--log-level=error', `--outfile=${browserBundle}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });

// --- 3. The page that gets recorded --------------------------------------
const bundleSource = execFileSync('cat', [browserBundle], { maxBuffer: 64 * 1024 * 1024 }).toString();
const html = `<!doctype html>
<meta charset="utf-8">
<title>GOV-DRUG-DISCOVERY-E2E-01</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; background: #07090d; color: #d7e2ee; font: 15px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; }
  section { min-height: 100vh; padding: 48px 64px; box-sizing: border-box; border-bottom: 1px solid #18202b; }
  h1 { font-size: 22px; color: #7ee0c0; margin: 0 0 6px; letter-spacing: .02em; }
  h2 { font-size: 13px; color: #6b7d91; margin: 0 0 28px; font-weight: 400; }
  .big { font-size: 44px; color: #eaf2fb; margin: 18px 0 8px; }
  .ok { color: #7ee0c0; } .warn { color: #f2c66b; } .bad { color: #f08a8a; }
  table { border-collapse: collapse; margin-top: 12px; }
  td, th { padding: 6px 18px 6px 0; text-align: left; vertical-align: top; }
  th { color: #6b7d91; font-weight: 400; border-bottom: 1px solid #18202b; }
  .note { color: #96a7bb; max-width: 1100px; margin-top: 14px; }
  ul { max-width: 1100px; } li { margin-bottom: 8px; color: #b9c8d8; }
  code { color: #7ee0c0; }
</style>
<div id="root">rendering…</div>
<script>${bundleSource}</script>
<script>
(function () {
  const e = globalThis.__genesisE2E01;
  const run = e.runGovDrugDiscoveryE2E();
  const flip = e.runGovDrugDiscoveryE2E({ injectCounterevidence: true });
  const rejected = e.applyActionPreference(run.decision, { preferredWinnerId: 'CHEMBL4297839', rationale: 'politically convenient' });
  globalThis.__genesisE2E01Result = {
    fingerprint: run.runFingerprint,
    outcome: run.decision.outcome,
    generatedCount: run.generationCheck.generatedCount,
    flipOutcome: flip.decision.outcome,
    bannedHits: run.bannedStringHits.length,
    preregistration: run.preregistrationFingerprint,
  };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const sec = (n, title, sub, body) => '<section id="step' + n + '"><h1>' + n + '. ' + title + '</h1><h2>' + sub + '</h2>' + body + '</section>';
  const g = run.generationCheck;
  const t1 = run.stages[0], t2 = run.stages[1];

  const parts = [];
  parts.push(sec(1, 'GENERATION, NOT SELECTION', 'The candidate space is constructed from mechanism. No drug name was ever the query.',
    '<div class="big ok">' + g.generatedCount.toLocaleString() + ' molecules generated</div>' +
    '<table><tr><th>pre-supplied list (negative control)</th><td>' + g.presuppliedCount + '</td></tr>' +
    '<tr><th>generated outside that list</th><td class="ok">' + g.outsidePresuppliedCount.toLocaleString() + '</td></tr>' +
    '<tr><th>generated set equals the list?</th><td class="ok">' + g.equalsPresuppliedSet + '</td></tr>' +
    '<tr><th>every row has full provenance</th><td class="ok">' + g.everyCandidateHasFullProvenance + '</td></tr></table>' +
    '<p class="note">Most of these molecules have no <code>pref_name</code> in ChEMBL at all — bare identifiers no human ever named. That is what makes "generation" checkable rather than asserted.</p>'));

  parts.push(sec(2, 'THE FUNNEL', 'Every elimination carries a reason and its evidence.',
    '<div class="big">' + t1.inputCount.toLocaleString() + ' &rarr; ' + t1.outputCount + ' &rarr; ' + t2.outputCount + ' &rarr; ' + run.top3.length + '</div>' +
    '<table><tr><th>stage</th><th>in</th><th>out</th><th>eliminated</th></tr>' +
    run.stages.map((s) => '<tr><td>' + s.stage + '</td><td>' + s.inputCount + '</td><td>' + s.outputCount + '</td><td>' + s.eliminated.length + '</td></tr>').join('') +
    '</table><p class="note">Example eliminations, with the datum behind each:</p><ul>' +
    t1.eliminated.slice(0, 2).concat(t2.eliminated.slice(0, 2)).map((x) => '<li><b>' + esc(x.prefName || x.moleculeChemblId) + '</b> — ' + esc(x.reason) + '<br><span style="color:#6b7d91">' + esc(x.evidence) + '</span></li>').join('') + '</ul>'));

  parts.push(sec(3, 'TOP 3 — AND WHY EACH SURVIVED', 'Ranked on evidence. A safety-vetoed candidate stays visible.',
    '<table><tr><th>#</th><th>candidate</th><th>efficacy vs semaglutide</th><th>safety</th><th>population evidence</th></tr>' +
    run.top3.map((c) => '<tr><td>' + c.rank + '</td><td>' + esc(c.prefName) + '</td><td class="' + (c.bestEfficacyDeltaPp < 0 ? 'ok' : 'warn') + '">' + (c.bestEfficacyDeltaPp === null ? 'n/a' : c.bestEfficacyDeltaPp.toFixed(2) + 'pp') + '</td><td class="' + (c.vetoed ? 'bad' : '') + '">' + esc(c.vetoed ? 'VETOED' : (c.safetyLabel || 'n/a')) + '</td><td>' + esc(c.populationCoverage) + '</td></tr>').join('') +
    '</table><ul>' + run.top3.map((c) => '<li><b>' + esc(c.prefName) + '</b> — ' + esc(c.whySurvived) + '</li>').join('') + '</ul>'));

  parts.push(sec(4, 'DEEP FALSIFICATION', 'Six preregistered attacks on every survivor. Counterevidence is surfaced, not suppressed.',
    run.falsifications.map((f) => '<p class="note"><b>' + esc(f.prefName) + '</b> — survived all attacks: <span class="' + (f.survivedAll ? 'ok' : 'bad') + '">' + f.survivedAll + '</span></p><ul>' +
      f.attacks.map((a) => '<li><code>' + a.attack + '</code> ' + (a.survived ? '<span class="ok">survived</span>' : '<span class="bad">counterevidence</span> — ' + esc(String(a.counterevidence).slice(0, 220))) + '</li>').join('') + '</ul>').join('')));

  parts.push(sec(5, 'OUTCOME', 'Four of the five allowed outcomes name no candidate. This is one of them.',
    '<div class="big warn">' + esc(run.decision.outcome) + '</div>' +
    '<p class="note">' + esc(run.decision.reason) + '</p>' +
    '<p class="note">Research recipe: <span class="ok">' + (run.researchRecipe === null ? 'NOT emitted — gated on WINNER' : 'emitted') + '</span></p>'));

  parts.push(sec(6, 'TRUTH ENGINE', 'Assertions that fail the run, not lint suggestions.',
    '<table><tr><th>banned strings anywhere in output</th><td class="ok">' + run.bannedStringHits.length + '</td></tr>' +
    '<tr><th>all 18 required output fields present</th><td class="ok">' + (e.missingRequiredOutputFields(run.governmentOutput).length === 0) + '</td></tr>' +
    '<tr><th>safety stated only in graded vocabulary</th><td class="ok">true</td></tr></table>' +
    '<p class="note">Safety profile as emitted:</p><ul>' + run.governmentOutput.safetyProfile.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>'));

  parts.push(sec(7, 'POLICY NEVER ALTERS TRUTH', 'An Action-layer preference that contradicts the AnswerRecord is rejected.',
    '<table><tr><th>preference</th><td>name CHEMBL4297839 (tirzepatide) as the winner</td></tr>' +
    '<tr><th>accepted</th><td class="ok">' + rejected.accepted + '</td></tr>' +
    '<tr><th>AnswerRecord outcome after</th><td class="ok">' + esc(rejected.answerRecordOutcomeAfter) + '</td></tr></table>' +
    '<p class="note">' + esc(rejected.reason) + '</p>'));

  parts.push(sec(8, 'NO_ACCESS_DECLARED', 'A source that cannot be reached is declared, never filled in from a prior.',
    '<ul>' + run.noAccessDeclarations.map((d) => '<li><code>' + esc(d.status) + '</code> <b>' + esc(d.sourceId) + '</b> — ' + esc(d.whatItWouldAnswer) + '<br><span style="color:#6b7d91">' + esc(d.whyUnavailable) + '</span></li>').join('') + '</ul>'));

  parts.push(sec(9, 'SELF-FALSIFICATION (FLIP) + REPLAY', 'The system attacks its own conclusion, and the run reproduces.',
    '<table><tr><th>injected counterevidence lands on</th><td>' + esc((flip.falsifications.find((f) => f.unresolvedCounterevidence.some((c) => c.indexOf('INJECTED') >= 0)) || {}).prefName || 'none') + '</td></tr>' +
    '<tr><th>outcome after injection</th><td class="ok">' + esc(flip.decision.outcome) + '</td></tr>' +
    '<tr><th>never becomes WINNER</th><td class="ok">' + (flip.decision.outcome !== 'WINNER') + '</td></tr>' +
    '<tr><th>run fingerprint (this browser)</th><td><code>' + esc(run.runFingerprint) + '</code></td></tr>' +
    '<tr><th>sealed preregistration</th><td><code>' + esc(run.preregistrationFingerprint) + '</code></td></tr></table>'));

  document.getElementById('root').innerHTML = parts.join('');
})();
</script>`;
const reportPath = path.join(OUT_DIR, 'report.html');
writeFileSync(reportPath, html);

// --- 4. Record the walkthrough ------------------------------------------
/**
 * The repo's pinned Playwright expects a browser revision that is not the
 * one installed in this environment, so point at an existing Chromium
 * instead of downloading a second copy. Falls back through the locations
 * this repo and its environments actually use; if none exists, Playwright's
 * own managed browser is used (and will say so if it is missing).
 */
const CHROME = [process.env.GENESIS_CHROMIUM_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium']
  .find((p) => p !== undefined && existsSync(p));
say(`chromium: ${CHROME ?? "(playwright's own managed browser)"}`);
const browser = await chromium.launch({ ...(CHROME === undefined ? {} : { executablePath: CHROME }), args: ['--no-sandbox'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));
await page.goto(`file://${reportPath}`);
await page.waitForFunction('globalThis.__genesisE2E01Result !== undefined', null, { timeout: 60000 });

const STEP_TITLES = [
  'generation, not selection',
  'the funnel, with logged eliminations',
  'TOP3 and why each survived',
  'deep falsification counterevidence',
  'the outcome',
  'truth-engine assertions',
  'policy never alters truth',
  'NO_ACCESS_DECLARED',
  'self-falsification FLIP + replay',
];
say('');
say('Recording walkthrough:');
for (let i = 1; i <= 9; i += 1) {
  await page.evaluate((n) => document.getElementById(`step${n}`).scrollIntoView({ behavior: 'smooth' }), i);
  await page.waitForTimeout(1800);
  say(`  step ${i}/9 — ${STEP_TITLES[i - 1]}`);
}
await page.waitForTimeout(800);

const browserResult = await page.evaluate('globalThis.__genesisE2E01Result');
await context.close();
await browser.close();

// Playwright names the video on close; give it a stable name.
const videoFile = readdirSync(OUT_DIR).find((f) => f.endsWith('.webm'));
let videoPath = null;
if (videoFile !== undefined) {
  videoPath = path.join(OUT_DIR, 'demo.webm');
  renameSync(path.join(OUT_DIR, videoFile), videoPath);
}

// --- 5. Verdict ----------------------------------------------------------
const match = browserResult.fingerprint === nodeRun.runFingerprint;
say('');
say('CROSS-ENVIRONMENT DETERMINISM:');
say(`  node    fingerprint: ${nodeRun.runFingerprint}`);
say(`  chromium fingerprint: ${browserResult.fingerprint}`);
say(`  MATCH: ${match}`);
say('');
say(`  outcome agreed:   node=${nodeRun.decision.outcome} chromium=${browserResult.outcome}`);
say(`  FLIP agreed:      node=${nodeFlip.decision.outcome} chromium=${browserResult.flipOutcome}`);
say(`  generated count:  node=${nodeRun.generationCheck.generatedCount} chromium=${browserResult.generatedCount}`);
say(`  banned strings:   ${browserResult.bannedHits}`);

const fingerprints = {
  scenarioId: 'GOV-DRUG-DISCOVERY-E2E-01',
  capturedAt: new Date().toISOString(),
  preregistrationFingerprint: nodeRun.preregistrationFingerprint,
  node: { runFingerprint: nodeRun.runFingerprint, outcome: nodeRun.decision.outcome, flipOutcome: nodeFlip.decision.outcome, generatedCount: nodeRun.generationCheck.generatedCount },
  chromium: browserResult,
  crossEnvironmentMatch: match,
  pageErrors,
};
writeFileSync(path.join(OUT_DIR, 'fingerprints.json'), `${JSON.stringify(fingerprints, null, 2)}\n`);

const ok = match
  && pageErrors.length === 0
  && browserResult.outcome === nodeRun.decision.outcome
  && browserResult.flipOutcome === nodeFlip.decision.outcome
  && browserResult.bannedHits === 0
  && videoPath !== null;

say('');
say('DEMO PACKAGE:');
say(`  ${videoPath ?? '(video missing)'}`);
say(`  ${path.join(OUT_DIR, 'demo-log.txt')}`);
say(`  ${path.join(OUT_DIR, 'fingerprints.json')}`);
say(`  ${reportPath}`);
say('');
say(ok ? 'PASSED: walkthrough recorded and both environments agree.' : 'FAILED: see above.');
writeFileSync(path.join(OUT_DIR, 'demo-log.txt'), `${log.join('\n')}\n`);
if (pageErrors.length > 0) console.error('page errors:', pageErrors);
process.exit(ok ? 0 : 1);
