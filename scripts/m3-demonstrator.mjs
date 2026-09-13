#!/usr/bin/env node
/**
 * M3 STRUCTURAL DISCOVERY — THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/m3-demonstrator.mjs
 *
 * Runs the whole chain, end to end, and prints what actually happened:
 *
 *   DATA -> PARENT MODEL -> OBSERVATION -> RESIDUAL -> RESIDUAL ANALYSIS ->
 *   STRUCTURALLY NEW MODEL -> FIT -> HOLD-OUT -> SELF-FALSIFICATION ->
 *   BELIEF REVISION -> MEMORY -> REPLAY
 *
 * The generating process is `y = a·x + b·x²` with coefficients declared in the
 * source and NEVER shown to the engine. The starting grammar can express a
 * constant and a straight line and nothing that bends, so no curved model can
 * be enumerated: if a curved model appears, the engine built it.
 *
 * The answer is not written down anywhere. When residual analysis detects
 * curvature it proposes THREE competing structural operators — a square, a
 * logarithm and a square root — and which one survives is settled at runtime by
 * weighted least squares, the parsimony penalty and a hold-out set that was
 * split off before any fit.
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

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-m3-'));
const out = path.join(bundleDir, 'm3.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/repro/reproEntry.node.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
  '--loader:.html=text', '--loader:.csv=text',
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const science = await import(out);

console.log('\nGENESIS — M3 STRUCTURAL DISCOVERY DEMONSTRATOR');
console.log(`node ${process.version}\n`);

const r = science.reproStructuralDiscovery();
const m = r.main;

// --- what the engine was allowed to know before it saw anything -------------
console.log('PREREGISTERED MODEL SPACE (before any observation):');
for (const f of m.preregisteredFormulas) console.log(`  · ${f}`);
console.log(`  dataset fingerprint: ${m.datasetFingerprint}\n`);

console.log('RESIDUAL ANALYSIS OF THE PARENT FIT:');
console.log(`  findings: ${m.residualFindingKinds.join(', ') || '(none)'}`);
if (m.residualEvidence) console.log(`  evidence: ${m.residualEvidence}`);
console.log('');

console.log('STRUCTURAL CANDIDATES GENERATED AT RUNTIME:');
for (const c of m.generatedCandidates) console.log(`  · ${c.formula}   [round ${c.enteredAtRound}, via ${c.operator}, motivated by ${c.motivatedBy}]`);
console.log('');

console.log('PARENT vs WINNER:');
console.log(`  parent: ${m.parent.formula}`);
console.log(`     training RSS ${fmt(m.parent.trainingRss)} · parsimony ${fmt(m.parent.parsimonyScore)} · hold-out ${fmt(m.parent.holdoutScore)}`);
console.log(`  winner: ${m.winner?.formula ?? '(none)'}`);
console.log(`     training RSS ${fmt(m.winner?.trainingRss)} · parsimony ${fmt(m.winner?.parsimonyScore)} · hold-out ${fmt(m.winner?.holdoutScore)}`);
console.log('');

console.log('CHECKS\n');

record('1. parent model is deliberately misspecified and fits badly',
  m.parent.trainingRss !== null && m.parent.trainingRss > 1,
  `parent "${m.parent.formula}" training RSS ${fmt(m.parent.trainingRss)}`);

record('2. a systematic residual was detected, with real numbers behind it',
  m.residualFindingKinds.length > 0 && (m.residualEvidence ?? '').length > 40,
  `findings: ${m.residualFindingKinds.join(', ')}`);

record('3. structural candidates were generated FROM the residual, not enumerated',
  m.generatedCandidates.length > 0 && m.generatedCandidates.every((c) => c.operator.startsWith('RESIDUAL_')),
  `${m.generatedCandidates.length} candidate(s): ${m.generatedCandidates.map((c) => c.formula).join(' | ')}`);

record('4. more than one structural operator competed — the answer was not the only option',
  new Set(m.generatedCandidates.map((c) => c.formula)).size > 1,
  `${new Set(m.generatedCandidates.map((c) => c.formula)).size} distinct structures were proposed and had to compete`);

record('5. the winner was NOT in the preregistered set',
  m.winner !== null && m.winnerWasPreregistered === false,
  `winner ${m.winner?.fingerprint} not among [${m.preregisteredFingerprints.join(', ')}]`);

record('6. the winner was generated AFTER the observations, not before',
  m.winnerEnteredAtRound > 0,
  `entered at round ${m.winnerEnteredAtRound}`);

record('7. lineage points back to the parent and to the residual operator',
  m.winnerDerivedFrom !== null && (m.winnerOperator ?? '').startsWith('RESIDUAL_'),
  `derivedFrom=${m.winnerDerivedFrom} via ${m.winnerOperator}`);

record('8. the winner is STRUCTURALLY different, not the same model refitted',
  m.winnerIsStructurallyDifferent === true,
  `parent terms ${m.parent.coefficientCount} vs winner terms ${m.winner?.coefficientCount}`);

record('9. the winner fits better than the parent on training data',
  m.winner?.trainingRss !== null && m.parent.trainingRss !== null && m.winner.trainingRss < m.parent.trainingRss,
  `${fmt(m.winner?.trainingRss)} < ${fmt(m.parent.trainingRss)}`);

record('10. the winner survives a HOLD-OUT the campaign never admitted',
  m.winner?.holdoutScore !== null && m.parent.holdoutScore !== null && m.winner.holdoutScore < m.parent.holdoutScore,
  `winner hold-out ${fmt(m.winner?.holdoutScore)} < parent hold-out ${fmt(m.parent.holdoutScore)}`);

record('11. self-falsification ran against the winner and it survived',
  m.selfFalsification !== null && m.selfFalsification.falsified === false,
  `${m.selfFalsification?.detail} [Tautology Gate: ${m.selfFalsification?.tautology.classification}, evidence ceiling ${m.selfFalsification?.evidenceCeiling ?? 'none'}]`);

record('12. belief moved through the existing BeliefRevision, not by assignment',
  r.beliefBefore === 0.5 && r.beliefAfter > r.beliefBefore,
  `${r.beliefBefore} → ${r.beliefAfter.toFixed(4)} (status ${r.beliefStatus})`);

record('13. replay is identical — same report fingerprint and same campaign fingerprint',
  r.replayMatches === true,
  `${m.reportFingerprint} == ${r.replayReportFingerprint}`);

// --- negative controls ------------------------------------------------------
console.log('\nNEGATIVE CONTROLS\n');

record('N1. no real structure → Genesis does NOT put an invented model into the scientific record',
  r.noStructure.winnerWasPreregistered === true && r.noStructure.winnerEnteredAtRound === 0,
  `straight-line process: winner "${r.noStructure.winner?.formula}" is the PREREGISTERED model; ${r.noStructure.generatedCandidates.length} candidate(s) were proposed and every one was rejected by parsimony/hold-out`);

record('N1b. the near-threshold detection is AUDITED, not hidden and not silently tuned away',
  r.noStructure.specificityFlag !== null && r.noStructure.specificityFlag.includes('AUDIT'),
  r.noStructure.specificityFlag ?? '(no flag raised)');

record('N2. a more complex model fits training at least as well but LOSES on parsimony and hold-out, and is not selected',
  r.overfit.overComplexFitsTrainingAtLeastAsWell && r.overfit.overComplexLosesOnParsimony && r.overfit.engineDidNotSelectIt,
  `"${r.overfit.overComplexFormula}": training ${fmt(r.overfit.overComplexTrainingRss)} (vs winner ${fmt(r.overfit.winnerTrainingRss)}), parsimony ${fmt(r.overfit.overComplexParsimony)} (vs ${fmt(r.overfit.winnerParsimony)}), hold-out ${fmt(r.overfit.overComplexHoldout)} (vs ${fmt(r.overfit.winnerHoldout)})`);

record('N3. a globally falsified structure is consulted in the registry, blocked, and AUDITED',
  r.registryControl.quadraticWasBlocked === true && r.registryControl.blockedCount > 0 && r.registryControl.audit.length > 0,
  `${r.registryControl.blockedCount} blocked; audit: ${r.registryControl.audit[0] ?? '(none)'}`);

record('N3b. after the block the campaign reports a DIFFERENT winner — the finding is not hidden, it is redirected',
  r.registryControl.winnerFormula !== null && r.registryControl.winnerFormula !== m.winner?.formula,
  `with registry on, winner is "${r.registryControl.winnerFormula}" instead of "${m.winner?.formula}"`);

function fmt(v) {
  return v === null || v === undefined ? 'n/a' : Number(v).toFixed(6);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n  RESULT: ${checks.length - failed.length}/${checks.length} properties held.`);
if (failed.length > 0) {
  console.log(`  FAILED: ${failed.map((c) => c.name).join('; ')}`);
  process.exit(1);
}
process.exit(0);
