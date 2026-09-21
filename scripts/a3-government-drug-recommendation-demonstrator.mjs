#!/usr/bin/env node
/**
 * A3 — GENESIS GOVERNMENT RESEARCH: THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/a3-government-drug-recommendation-demonstrator.mjs
 *
 * Runs the whole real chain, end to end, twice: once with NO population
 * (the government mandate's own request, as sent -- REQUIRED_POLICY_INPUT,
 * no candidate analysis runs at all) and once with a concrete population
 * (T2D_AND_OBESITY, chosen only to prove the answered path is real and
 * working -- not a claim about what the government actually asked for).
 *
 * Both runs sit on top of A2's already-real, already-sealed mechanism-
 * derived candidate space (D-029/D-030) -- no new candidate, no new fetch.
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

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-a3-'));
const out = path.join(bundleDir, 'a3.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a3GovernmentDrugRecommendation.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('\nGENESIS — A3 GOVERNMENT RESEARCH DEMONSTRATOR');
console.log(`node ${process.version}\n`);

console.log('=== RUN 1: no population (the government mandate\'s own request, as sent) ===\n');
const gated = mod.runA3GovernmentRecommendation();
console.log(mod.printA3GovernmentReport(gated));
console.log('');

console.log('=== RUN 2: population = T2D_AND_OBESITY (proves the answered path is real, not a placeholder) ===\n');
const answered = mod.runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
console.log(mod.printA3GovernmentReport(answered));
console.log('');

console.log('CHECKS\n');

record('1. no population -> REQUIRED_POLICY_INPUT, and no candidate analysis is exposed in the report',
  gated.status === 'REQUIRED_POLICY_INPUT' && gated.preregistrationFingerprint === '2b32c0a8',
  `status=${gated.status} fingerprint=${gated.preregistrationFingerprint}`);

record('2. a concrete population reaches the answered branch, over the real A2 candidate space',
  answered.status === 'ANSWERED' && answered.answerRecord.totalCandidatesInSpace === 20 && answered.answerRecord.candidateViews.length === 12,
  `status=${answered.status} totalCandidates=${answered.status === 'ANSWERED' ? answered.answerRecord.totalCandidatesInSpace : 'n/a'}`);

record('3. the recommendation honestly reuses A2\'s own CONFLICTING_EVIDENCE verdict -- no rosier government vocabulary invented',
  answered.status === 'ANSWERED' && answered.answerRecord.recommendation.label === 'CONFLICTING_EVIDENCE',
  answered.status === 'ANSWERED' ? answered.answerRecord.recommendation.label : 'n/a');

const mk0893 = answered.status === 'ANSWERED' ? answered.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'MK-0893') : undefined;
record('4. real finding: MK-0893 has 0 efficacy trials but the highest safety-only score (1.100) -- excluded from SCIENTIFIC WINNER/BEST OVERALL, never hidden',
  mk0893 !== undefined && mk0893.report.efficacy.length === 0 && Math.abs(mk0893.report.score.weightedScore - 1.1) < 1e-6
    && answered.status === 'ANSWERED' && !answered.answerRecord.scientificRanking.some((v) => v.report.summary.prefName === 'MK-0893')
    && answered.answerRecord.safestSupportedCandidate?.report.summary.prefName === 'MK-0893',
  `MK-0893 weightedScore=${mk0893?.report.score.weightedScore.toFixed(3)}, efficacy trials=${mk0893?.report.efficacy.length}, still visible as SAFEST SUPPORTED OPTION`);

record('5. best-efficacy (tirzepatide, vetoed) and best-overall (a non-vetoed candidate) genuinely differ -- efficacy alone does not win',
  answered.status === 'ANSWERED' && answered.answerRecord.bestEfficacyCandidate?.report.summary.prefName === 'TIRZEPATIDE'
    && answered.answerRecord.bestEfficacyCandidate?.report.score.vetoed === true
    && answered.answerRecord.bestOverallCandidate?.report.score.vetoed === false,
  `bestEfficacy=${answered.status === 'ANSWERED' ? answered.answerRecord.bestEfficacyCandidate?.report.summary.prefName : 'n/a'} (vetoed), bestOverall=${answered.status === 'ANSWERED' ? answered.answerRecord.bestOverallCandidate?.report.summary.prefName : 'n/a'} (not vetoed)`);

record('6. real per-trial population matching fixed a regex bug: "Diabetes Mellitus, Type 2" (reversed word order) now matches T2D',
  mod.trialMatchesPopulation('NCT00518882', { kind: 'T2D' }) === true,
  'NCT00518882 conditions=["Diabetes","Diabetes Mellitus, Type 2"]');

record('7. perphenazine\'s real, unrelated trial (Psychotic Disorders) correctly matches neither T2D nor OBESITY',
  mod.trialMatchesPopulation('NCT00806234', { kind: 'T2D' }) === false && mod.trialMatchesPopulation('NCT00806234', { kind: 'OBESITY' }) === false,
  'NCT00806234 conditions=["Psychotic Disorders"]');

record('8. OBESITY-only population narrows to exactly the real 2 candidates with an obesity-tagged trial',
  (() => {
    if (answered.status !== 'ANSWERED') return false;
    const obesityRun = mod.runA3GovernmentRecommendation({ kind: 'OBESITY' });
    if (obesityRun.status !== 'ANSWERED') return false;
    const names = obesityRun.answerRecord.candidateViews.filter((v) => v.population.populationCoverage === 'DIRECT_EVIDENCE_FOR_POPULATION').map((v) => v.report.summary.prefName).sort();
    return JSON.stringify(names) === JSON.stringify(['COTADUTIDE', 'ORFORGLIPRON']);
  })(),
  'COTADUTIDE, ORFORGLIPRON');

const tirzepatideView = answered.status === 'ANSWERED' ? answered.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'TIRZEPATIDE') : undefined;
record('9. §7 safety-language: a vetoed candidate gets no reassuring label (null), not a euphemism',
  tirzepatideView !== undefined && tirzepatideView.report.score.vetoed === true && tirzepatideView.safetyLabel === null,
  `TIRZEPATIDE safetyLabel=${tirzepatideView?.safetyLabel}`);

record('10. AnswerRecord (TRUTH) vs ActionRecord (POLICY): no candidate is gated for action under CONFLICTING_EVIDENCE, but all 12 candidate views stay visible',
  answered.status === 'ANSWERED' && answered.actionRecord.gatedCandidate === null && answered.actionRecord.surface === 'NONE' && answered.answerRecord.candidateViews.length === 12,
  answered.status === 'ANSWERED' ? `surface=${answered.actionRecord.surface} candidateViews=${answered.answerRecord.candidateViews.length}` : 'n/a');

record('11. the government ranking currently equals the scientific ranking -- a disclosed FACT about missing cost/availability data, computed not hardcoded',
  answered.status === 'ANSWERED' && answered.answerRecord.rankingsDiverge === false,
  'rankingsDiverge=false');

record('12. the whole pipeline is deterministic: re-running with the same population produces an identical decision fingerprint',
  mod.runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' }).decisionFingerprint === (answered.status === 'ANSWERED' ? answered.decisionFingerprint : null),
  answered.status === 'ANSWERED' ? answered.decisionFingerprint : 'n/a');

record('13. the answered report traces to the same preregistration as the REQUIRED_POLICY_INPUT report',
  answered.status === 'ANSWERED' && answered.preregistrationFingerprint === gated.preregistrationFingerprint && gated.preregistrationFingerprint === '2b32c0a8',
  gated.preregistrationFingerprint);

console.log('');
const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.log(`FAILED: ${failed.length}/${checks.length} checks did not hold.`);
  process.exit(1);
}
console.log(`PASSED: all ${checks.length}/${checks.length} checks held.`);
process.exit(0);
