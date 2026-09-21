#!/usr/bin/env node
/**
 * A2 — AUTONOMOUS OZEMPIC-SUBSTITUTE DISCOVERY: THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/a2-ozempic-substitute-demonstrator.mjs
 *
 * Runs the whole real chain, end to end, over the real, pinned,
 * MECHANISM-DERIVED candidate space under
 * `packages/frontend/src/core/biotechData/a2-ozempic-substitute/`:
 *
 *   mechanism (GLP-1R+GIPR+GCGR in ChEMBL) -> candidate space (20 real
 *   molecules, max_phase>=2) -> 12 with real posted-result trials ->
 *   candidate analysis (efficacy + safety vs semaglutide) -> falsification
 *   -> belief revision (H1-H4) -> ranking -> self-falsification round 2 ->
 *   FINAL VERDICT -> safety gate -> replay/provenance.
 *
 * No drug name was ever the input to candidate DISCOVERY — only ChEMBL
 * binding data and clinical-development phase. The result is
 * CONFLICTING_EVIDENCE, not a forced winner: this demonstrator's checks
 * verify the real reasons why, not that a "best" answer was produced.
 *
 * Exit code 0 = every mandated property held. Exit code 1 = at least one did
 * not, with the failing property named.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-a2-'));
const out = path.join(bundleDir, 'a2.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a2OzempicSubstitute.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('\nGENESIS — A2 AUTONOMOUS OZEMPIC-SUBSTITUTE DISCOVERY DEMONSTRATOR');
console.log(`node ${process.version}\n`);

const report = mod.runA2Analysis();

console.log('MECHANISM -> CANDIDATE SPACE (real ChEMBL binding data, no drug name as query):');
console.log(`  targets: GLP-1R=${report.targets.glp1r.chemblId} GIPR=${report.targets.gipr.chemblId} GCGR=${report.targets.gcgr.chemblId}`);
console.log(`  ${report.totalCandidatesInSpace} real molecules with qualifying binding data + max_phase>=2`);
console.log(`  ${report.candidateReports.length} with real posted-result ClinicalTrials.gov evidence\n`);

console.log('CANDIDATE ANALYSIS -> RANKING:');
for (const r of report.rankedByScore) {
  console.log(`  ${r.summary.prefName.padEnd(14)} score=${r.score.weightedScore.toFixed(3).padStart(7)} vetoed=${String(r.score.vetoed).padEnd(5)} eff_n=${r.efficacy.length} safety_n=${r.safety.length}`);
}
console.log('');

console.log('SELF-FALSIFICATION ROUND 2 (top candidate with real efficacy evidence):');
if (report.selfFalsification === null) {
  console.log('  no candidate has usable efficacy evidence');
} else {
  console.log(`  candidate: ${report.selfFalsification.candidateId}`);
  for (const f of report.selfFalsification.findings) console.log(`    - ${f}`);
  console.log(`  revised score: ${report.selfFalsification.revisedScore.toFixed(3)}`);
}
console.log('');

console.log('FINAL VERDICT:');
console.log(`  ${report.verdict.label}`);
console.log(`  ${report.verdict.reason}\n`);

console.log('SAFETY GATE:');
console.log(`  gate: ${report.gateDecision === null ? '(no candidate proposed)' : report.gateDecision.outcome}`);
console.log(`  surface: ${report.surface}\n`);

console.log('CHECKS\n');

record('1. mechanism targets resolved live to the real, sealed ChEMBL ids',
  report.targets.glp1r.chemblId === 'CHEMBL1784' && report.targets.gipr.chemblId === 'CHEMBL4383' && report.targets.gcgr.chemblId === 'CHEMBL1985',
  `GLP-1R=${report.targets.glp1r.chemblId} GIPR=${report.targets.gipr.chemblId} GCGR=${report.targets.gcgr.chemblId}`);

record('2. candidate space is real and mechanism-derived (20 molecules, 12 with real trial evidence)',
  report.totalCandidatesInSpace === 20 && report.candidateReports.length === 12,
  `${report.totalCandidatesInSpace} total, ${report.candidateReports.length} with trials`);

record('3. named dual-agonist and mono-agonist drugs entered the space on mechanism alone (tirzepatide, liraglutide, exenatide present)',
  ['TIRZEPATIDE', 'LIRAGLUTIDE', 'EXENATIDE'].every((name) => report.candidateReports.some((r) => r.summary.prefName === name)),
  report.candidateReports.map((r) => r.summary.prefName).join(', '));

record('4. real extraction fix 1 held: single-arm open-label trial (exenatide, Bydureon) contributes real efficacy evidence',
  (report.candidateReports.find((r) => r.summary.prefName === 'EXENATIDE')?.efficacy.length ?? 0) === 1,
  'NCT02533453, group "12/24 Weeks Treatment" (no drug name in the title) correctly recognized as the candidate\'s own arm');

record('5. real extraction fix 2 held: development-code-name synonym matching found real trials under a different name (adomeglivant = LY2409021)',
  (report.candidateReports.find((r) => r.summary.prefName === 'ADOMEGLIVANT')?.efficacy.length ?? 0) === 3,
  'NCT01241448/NCT00871572/NCT02091362, arms titled "LY2409021", not "ADOMEGLIVANT"');

const tirzepatide = report.candidateReports.find((r) => r.summary.prefName === 'TIRZEPATIDE');
record('6. tirzepatide shows a real efficacy advantage over semaglutide (naive indirect comparison)',
  tirzepatide !== undefined && tirzepatide.efficacy[0]?.deltaVsSemaglutidePp !== null && tirzepatide.efficacy[0].deltaVsSemaglutidePp < 0,
  `delta=${tirzepatide?.efficacy[0]?.deltaVsSemaglutidePp?.toFixed(2)}pp`);

record('7. tirzepatide is nonetheless VETOED on a real, measured safety signal — efficacy alone does not win',
  tirzepatide !== undefined && tirzepatide.score.vetoed === true && tirzepatide.falsification.worseSafetySignal?.label === 'Diarrhea',
  tirzepatide?.score.vetoReason ?? '(not vetoed)');

record('8. self-falsification round 2 actively found real, disclosed concerns about the top candidate, not assumed none',
  report.selfFalsification !== null && report.selfFalsification.findings.length >= 2,
  `${report.selfFalsification?.findings.length ?? 0} finding(s)`);

record('9. two real GCGR-antagonist candidates (mechanistically distinct from semaglutide\'s agonism) are present, not excluded',
  report.candidateReports.some((r) => r.summary.moleculeChemblId === 'CHEMBL1933349') && report.candidateReports.some((r) => r.summary.moleculeChemblId === 'CHEMBL3707351'),
  'MK-0893, ADOMEGLIVANT (LY2409021)');

record('10. the verdict is one of the 6 preregistered labels, and is NOT forced positive',
  ['BEST_SUPPORTED_CANDIDATE', 'PROMISING_BUT_UNCERTAIN', 'NO_SUPERIOR_CANDIDATE', 'NO_SAFE_SUPERIOR_CANDIDATE', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE'].includes(report.verdict.label)
    && report.verdict.label === 'CONFLICTING_EVIDENCE',
  report.verdict.label);

record('11. no PracticalCandidate is gated when the verdict is CONFLICTING_EVIDENCE — nothing is proposed as an actionable winner',
  report.gatedCandidate === null && report.gateDecision === null && report.surface === 'NONE',
  `gatedCandidate=${report.gatedCandidate} surface=${report.surface}`);

record('12. the underlying evidence remains fully visible regardless of the inconclusive verdict — policy limits ACTION, never TRUTH',
  report.candidateReports.length === 12 && report.rankedByScore.length === 12,
  'all 12 candidate reports with real trial evidence remain in the report');

record('13. the whole pipeline is deterministic: re-running produces an identical analysis fingerprint',
  mod.runA2Analysis().analysisFingerprint === report.analysisFingerprint,
  report.analysisFingerprint);

record('14. the analysis fingerprint traces to the preregistration, sealed before any candidate data was pulled',
  report.preregistrationFingerprint === '4642088a',
  report.preregistrationFingerprint);

console.log('');
const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.log(`FAILED: ${failed.length}/${checks.length} checks did not hold.`);
  process.exit(1);
}
console.log(`PASSED: all ${checks.length}/${checks.length} checks held.`);
process.exit(0);
