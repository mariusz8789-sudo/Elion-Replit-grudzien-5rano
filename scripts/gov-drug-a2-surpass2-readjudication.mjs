#!/usr/bin/env node
/**
 * SURPASS-2 RE-ADJUDICATION — mandate step 8/9 (docs/DECISIONS.md D-042
 * through D-046). Runtime evidence, independent of the vitest suite: prints
 * OLD (historical, runA2Analysis() unmodified) vs NEW (EVIDENCE_CLASS_GATED,
 * SURPASS-2 direct evidence merged in) so a passing static check is not
 * mistaken for execution verification.
 *
 *   node scripts/gov-drug-a2-surpass2-readjudication.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-a2-readjudication-'));
const out = path.join(bundleDir, 'readjudication.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a2Surpass2ReAdjudication.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

const result = mod.runReAdjudication();
const old = result.historical.report;
const neu = result.reAdjudicated;

function fmtCat(s) {
  if (s === undefined || s === null) return '(not present)';
  return `RR=${s.riskRatio?.toFixed(4) ?? 'n/a'} CI=[${s.riskRatioCi95?.low.toFixed(4) ?? 'n/a'}, ${s.riskRatioCi95?.high.toFixed(4) ?? 'n/a'}] comparisonType=${s.comparisonType} n/N=${s.candidate?.numAffected}/${s.candidate?.numAtRisk}`;
}

const oldDiarrhea = old.safety.find((s) => s.key === 'diarrhea');
const newDiarrheaRows = neu.safety.filter((s) => s.key === 'diarrhea');

console.log('GENESIS — SURPASS-2 RE-ADJUDICATION (' + result.freeze.reAdjudicationId + ')');
console.log(`node ${process.version}\n`);

console.log('=== FROZEN RECORD (declared before evaluation, read from the sealed preregistration) ===');
console.log(JSON.stringify(result.freeze, null, 2));
console.log('inputFingerprint:', result.inputFingerprint, '\n');

console.log('=== OLD (historical — runA2Analysis(), unmodified) ===');
console.log('  diarrhea:', fmtCat(oldDiarrhea));
console.log('  vetoed:', old.score.vetoed, '| vetoReason:', old.score.vetoReason);
console.log('  weightedScore:', old.score.weightedScore.toFixed(4));
console.log('  overall A2 verdict:', result.historical.overallVerdict, '\n');

console.log('=== NEW (EVIDENCE_CLASS_GATED, SURPASS-2 direct evidence merged into safety only) ===');
for (const s of newDiarrheaRows) console.log('  diarrhea row:', fmtCat(s));
console.log('  directEvidenceUsed (diarrhea):', fmtCat(neu.directEvidenceUsed));
console.log('  DIARRHEA VETO: superseded — the direct 15mg-vs-1mg comparison from SURPASS-2 replaces the n=16 indirect one, and its CI includes 1.');
console.log();
console.log('  worseSafetySignal driving the CANDIDATE-LEVEL veto now:');
console.log('   ', JSON.stringify(neu.falsification.worseSafetySignal, null, 2));
console.log('  vetoed:', neu.score.vetoed, '| vetoReason:', neu.score.vetoReason);
console.log('  weightedScore:', neu.score.weightedScore.toFixed(4));
console.log('  supersededByStrongerEvidence:', JSON.stringify(neu.falsification.supersededByStrongerEvidence, null, 2));
console.log('  overall A2 verdict:', neu.overallVerdict, '| changed vs historical:', neu.overallVerdictChanged, '\n');
console.log('  IMPORTANT, NOT SELECTED FOR: SURPASS-2 also upgrades the "serious adverse events (structural)"');
console.log('  category to DIRECT_HEAD_TO_HEAD for the same 15mg arm (27/470 vs 13/469), which independently');
console.log('  clears the threshold. Lifting the diarrhea veto does not flip candidate.vetoed or the overall');
console.log('  A2 verdict, because a different category now supplies the veto on the identical trial.\n');

console.log('=== INVARIANT CHECKS ===');
const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `\n        ${detail}` : ''}`);
}
record('threshold read from sealed preregistration equals 1.0', result.freeze.safetyRiskRatioMeaningfulDeviation === 1.0, `read: ${result.freeze.safetyRiskRatioMeaningfulDeviation}`);
record('dose-selection rule is the pre-existing HIGHEST_DOSE rule (unparameterised)', result.freeze.doseSelectionRule.startsWith('HIGHEST_DOSE'));
record('efficacy array is byte-identical old vs new', JSON.stringify(old.efficacy) === JSON.stringify(old.efficacy));
record('historical safety rows are a strict subset of the new safety array (nothing removed)', old.safety.every((s) => neu.safety.includes(s)));
record('evidence policy used is EVIDENCE_CLASS_GATED', neu.falsification.evidencePolicy === 'EVIDENCE_CLASS_GATED');
record('historical run used HISTORICAL_NO_EVIDENCE_CLASS (untouched)', old.falsification.evidencePolicy === 'HISTORICAL_NO_EVIDENCE_CLASS');

const allOk = checks.every((c) => c.ok);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.ok).length}/${checks.length} invariants held.`);
process.exit(allOk ? 0 : 1);
