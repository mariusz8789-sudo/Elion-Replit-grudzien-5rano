#!/usr/bin/env node
/**
 * GOV-DRUG-DISCOVERY-E2E-01 — the runnable scenario.
 *
 *   node scripts/gov-drug-discovery-e2e-scenario.mjs
 *
 * Runs the whole real chain over the real, pinned, GENERATED candidate
 * space (2671 molecules, SHA-256 verified — see docs/DECISIONS.md D-032):
 *
 *   GENERATION -> Tier-1 -> Tier-2 -> TOP3 -> six falsification attacks ->
 *   winner or an honest non-winner -> recipe (WINNER only) -> 18-field
 *   government output -> truth-engine assertions -> replay.
 *
 * WHAT "PASS" MEANS HERE. Not "a winner was found". The real evidence in
 * this dataset does not support naming one, and the run says so. PASS
 * means the outcome is evidence-driven and every property the scenario
 * claims is actually demonstrated: generation rather than selection, a
 * funnel that logs why each candidate fell out, counterevidence surfaced
 * against the survivors, and a system that refuses to be talked into a
 * winner it cannot support.
 *
 * Exit code 0 = every property held. Exit code 1 = at least one did not.
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

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-e2e01-'));
const out = path.join(bundleDir, 'e2e01.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugDiscoveryE2E.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

const a3Out = path.join(bundleDir, 'a3.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a3GovernmentDrugRecommendation.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${a3Out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const a3 = await import(a3Out);

console.log('\nGENESIS — GOV-DRUG-DISCOVERY-E2E-01');
console.log(`node ${process.version}\n`);

const run = mod.runGovDrugDiscoveryE2E();
const flipped = mod.runGovDrugDiscoveryE2E({ injectCounterevidence: true });

// --- STEP 1 --------------------------------------------------------------
console.log('STEP 1 — GENERATION (not selection):');
console.log(`  ${run.generationCheck.generatedCount} molecules generated from mechanism; ${run.generationCheck.outsidePresuppliedCount} appear in no pre-supplied list`);
console.log(`  equals the pre-supplied list? ${run.generationCheck.equalsPresuppliedSet}  |  every candidate has full provenance? ${run.generationCheck.everyCandidateHasFullProvenance}\n`);

// --- STEP 2 --------------------------------------------------------------
console.log('STEP 2 — FUNNEL (every elimination logged with reason + evidence):');
for (const s of run.stages) {
  console.log(`  ${s.stage}: ${s.inputCount} -> ${s.outputCount}  (eliminated ${s.eliminated.length})`);
  for (const e of s.eliminated.slice(0, 2)) console.log(`      e.g. ${e.prefName ?? e.moleculeChemblId}: ${e.reason}`);
}
console.log('');

// --- STEP 3 --------------------------------------------------------------
console.log('STEP 3 — TOP3 + why each survived:');
for (const c of run.top3) {
  console.log(`  ${c.rank}. ${c.prefName} (delta ${c.bestEfficacyDeltaPp === null ? 'n/a' : `${c.bestEfficacyDeltaPp.toFixed(2)}pp`}, score ${c.weightedScore.toFixed(3)}, vetoed=${c.vetoed})`);
  console.log(`       ${c.whySurvived.slice(0, 150)}...`);
}
console.log('');

// --- STEP 4 --------------------------------------------------------------
console.log('STEP 4 — DEEP FALSIFICATION (six attacks per candidate):');
for (const f of run.falsifications) {
  console.log(`  ${f.prefName}: survivedAll=${f.survivedAll}, unresolved counterevidence=${f.unresolvedCounterevidence.length}`);
  for (const c of f.unresolvedCounterevidence.slice(0, 2)) console.log(`      - ${c.slice(0, 140)}...`);
}
console.log('');

// --- STEP 5 --------------------------------------------------------------
console.log('STEP 5 — OUTCOME:');
console.log(`  ${run.decision.outcome}`);
console.log(`  ${run.decision.reason}`);
console.log(`  research recipe: ${run.researchRecipe === null ? 'NOT emitted (correct — gated on WINNER)' : 'emitted'}\n`);

// --- STEP 6/7/8/9 --------------------------------------------------------
const a3Report = a3.runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
const noPopulation = a3.runA3GovernmentRecommendation();
const rejected = mod.applyActionPreference(run.decision, { preferredWinnerId: 'CHEMBL4297839', rationale: 'politically convenient' });

console.log('STEP 6-9 — TRUTH ASSERTIONS, REPLAY, NO_ACCESS, FLIP:');
console.log(`  banned strings in output: ${run.bannedStringHits.length}`);
console.log(`  NO_ACCESS_DECLARED sources: ${run.noAccessDeclarations.map((d) => d.sourceId).join(', ')}`);
console.log(`  action preference contradicting the AnswerRecord: accepted=${rejected.accepted}`);
console.log(`  FLIP: injected counterevidence -> outcome ${flipped.decision.outcome}`);
console.log(`  replay fingerprint: ${run.runFingerprint} (preregistration ${run.preregistrationFingerprint})\n`);

console.log('CHECKS\n');

record('1. T1: the candidate space is GENERATED, not selected from a pre-supplied list',
  run.generationCheck.passed && run.generationCheck.generatedCount >= 60
    && run.generationCheck.outsidePresuppliedCount >= 20 && !run.generationCheck.equalsPresuppliedSet,
  `${run.generationCheck.generatedCount} generated, ${run.generationCheck.outsidePresuppliedCount} outside the pre-supplied list, sets differ`);

record('2. every generated candidate carries provenance and is labelled generatedBy=GENERATOR',
  run.generationCheck.everyCandidateHasFullProvenance && run.generationCheck.everyCandidateGeneratedByGenerator,
  'source + identifier + retrievalTime + hash on every row');

record('3. the funnel strictly reduces at every stage',
  run.stages.every((s) => s.outputCount < s.inputCount) && run.top3.length <= 3,
  run.stages.map((s) => `${s.stage} ${s.inputCount}->${s.outputCount}`).join(', '));

record('4. every eliminated candidate carries a reason AND its evidence — no silent drops',
  run.stages.every((s) => s.eliminated.length === s.inputCount - s.outputCount
    && s.eliminated.every((e) => e.reason.length > 0 && e.evidence.length > 0)),
  `${run.stages.reduce((n, s) => n + s.eliminated.length, 0)} eliminations, all logged`);

record('5. every TOP3 candidate explains why it survived',
  run.top3.length === 3 && run.top3.every((c) => c.whySurvived.length > 120),
  run.top3.map((c) => c.prefName).join(', '));

record('6. deep falsification ran all six preregistered attacks and surfaced real counterevidence',
  run.falsifications.length === 3
    && run.falsifications.every((f) => f.attacks.length === 6 && f.unresolvedCounterevidence.length > 0),
  `${run.falsifications.reduce((n, f) => n + f.unresolvedCounterevidence.length, 0)} unresolved findings across the TOP3`);

record('7. a safety-vetoed candidate stays visible in the record — the veto blocks winning, not disclosure',
  run.top3.some((c) => c.vetoed) && run.governmentOutput.top3.some((c) => c.vetoed),
  run.top3.filter((c) => c.vetoed).map((c) => c.prefName).join(', ') || '(none vetoed)');

record('8. the outcome is one of the five preregistered outcomes and is evidence-driven, not forced',
  ['WINNER', 'NO_WINNER', 'NO_SAFE_WINNER', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE'].includes(run.decision.outcome)
    && run.decision.outcome === 'NO_WINNER',
  `${run.decision.outcome} — the only candidate with a real efficacy advantage is safety-vetoed, and the leader is worse than semaglutide`);

record('9. no research recipe is emitted without a WINNER',
  run.researchRecipe === null && run.governmentOutput.researchRecipe === undefined,
  'recipe is gated on outcome === WINNER');

record('10. truth engine: no banned string anywhere in the output',
  run.bannedStringHits.length === 0,
  'scanned every string in the government output');

record('11. truth engine: required-but-unavailable sources are DECLARED, not fabricated',
  run.noAccessDeclarations.length >= 3
    && run.noAccessDeclarations.every((d) => d.status === 'NO_ACCESS_DECLARED')
    && run.governmentOutput.uncertainty.some((u) => u.includes('NO_ACCESS_DECLARED')),
  run.noAccessDeclarations.map((d) => d.sourceId).join(', '));

record('12. policy never alters truth: a contradicting Action-layer preference is rejected, AnswerRecord unchanged',
  rejected.accepted === false && rejected.answerRecordOutcomeAfter === run.decision.outcome && rejected.answerRecordWinnerIdAfter === run.decision.winnerId,
  rejected.reason.slice(0, 120));

record('13. adversarial self-falsification (FLIP): injected counterevidence lands and never yields a WINNER',
  flipped.falsifications.some((f) => f.unresolvedCounterevidence.some((c) => c.includes('INJECTED')))
    && flipped.decision.outcome !== 'WINNER',
  `injected into ${flipped.falsifications.find((f) => f.unresolvedCounterevidence.some((c) => c.includes('INJECTED')))?.prefName}; outcome ${flipped.decision.outcome}`);

record('14. the government output carries all 18 required fields',
  mod.missingRequiredOutputFields(run.governmentOutput).length === 0,
  `missing: ${JSON.stringify(mod.missingRequiredOutputFields(run.governmentOutput))}`);

record('15. TRUTH and ACTION are separate records',
  run.governmentOutput.status === 'TRUTH' && a3Report.status === 'ANSWERED' && a3Report.actionRecord.surface === 'NONE',
  `AnswerRecord status=${run.governmentOutput.status}; ActionRecord surface=${a3Report.status === 'ANSWERED' ? a3Report.actionRecord.surface : 'n/a'}`);

record('16. the population control still refuses to guess when no population is supplied',
  noPopulation.status === 'REQUIRED_POLICY_INPUT',
  noPopulation.status);

record('17. replay: two runs over the same pinned data produce an identical fingerprint',
  mod.runGovDrugDiscoveryE2E().runFingerprint === run.runFingerprint,
  run.runFingerprint);

record('18. the run traces to criteria sealed before the generated space was pulled',
  run.preregistrationFingerprint === 'f528c881',
  `preregistration ${run.preregistrationFingerprint}, upstream A1/A2/A3 lineage recorded in it`);

console.log('');
const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.log(`FAILED: ${failed.length}/${checks.length} properties did not hold.`);
  process.exit(1);
}
console.log(`PASSED: all ${checks.length}/${checks.length} properties held.`);
console.log(`\nOUTCOME: ${run.decision.outcome} — an honest non-winner is the result this evidence supports, and PASS means the run said so rather than naming one.`);
process.exit(0);
