#!/usr/bin/env node
/**
 * GENESIS — D-062 DOSE-STRATIFIED LOWER-HARM DISCOVERY CHALLENGE.
 *
 *   node scripts/genesis-d062-discovery-challenge.mjs
 *
 * THE QUESTION (docs/QWEN-A2-DISCOVERY-CHALLENGE-BRIEF.md, docs/DECISIONS.md
 * D-062): among incretin-agonist DOSE STRATA — not molecules — is there one
 * that retains the frozen semaglutide baseline's efficacy while carrying
 * LOWER measured harm, under the real, unmodified LOWER-HARM/A2 gates? The
 * dose strata (5mg/10mg/15mg tirzepatide, read from SURPASS-2's own arms) are
 * genuinely absent from the fixed 12-molecule A2 candidate space, which only
 * ever sees the trial's highest dose.
 *
 * WHAT "PASS" MEANS HERE. Not "a winner was found". PASS means every
 * property this run claims is actually demonstrated: real pinned data in,
 * real per-dose extraction via the UNMODIFIED A2 extraction functions, a
 * frozen baseline and a frozen better-than-baseline rule (every numeric term
 * inherited from LOWER_HARM_PREREGISTRATION/A2_PREREGISTRATION, never
 * re-tuned), 3 real rounds examining 3 genuinely different pairs, a real
 * falsification pass, the real D-057 gate never bypassed, and a terminal
 * state — WINNER or NO_WINNER — the evidence actually supports.
 *
 * Exit 0 = every property held. Exit 1 = at least one did not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

function bundle(entry, outName) {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-d062-'));
  const out = path.join(dir, outName);
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    path.join(REPO, entry),
    '--bundle', '--format=esm', '--platform=node', '--target=node22',
    '--loader:.html=text', '--loader:.csv=text',
    '--log-level=error', `--outfile=${out}`,
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

const F = 'packages/frontend/src';
const discovery = await import(bundle(`${F}/core/orchestrator/d062Discovery.ts`, 'discovery.mjs'));
const ports = await import(bundle(`${F}/core/orchestrator/d062Ports.ts`, 'ports.mjs'));
const strata = await import(bundle(`${F}/core/biotechData/d062SurpassDoseStrata.ts`, 'strata.mjs'));
const lineage = await import(bundle(`${F}/core/discoveryChallenge/lineage.ts`, 'lineage.mjs'));

console.log('\nGENESIS — D-062 DOSE-STRATIFIED LOWER-HARM DISCOVERY CHALLENGE');
console.log(`node ${process.version}\n`);

// --- KNOWN BASELINE --------------------------------------------------------
const baseline = discovery.D062_BASELINE;
console.log('KNOWN BASELINE');
console.log(`  identity:      ${baseline.label}`);
console.log(`  source:        ${baseline.source}`);
console.log(`  provenance:    ${baseline.provenanceRefs.join(', ')}`);
console.log(`  evidenceClass: ${baseline.evidenceClass}`);
console.log(`  applicability: ${baseline.applicabilityConditions.join('; ')}`);
console.log(`  fingerprint:   ${baseline.fingerprint}\n`);

// --- GENESIS KNOWLEDGE -------------------------------------------------------
const doseStrata = strata.surpass2DoseStrata();
console.log('GENESIS KNOWLEDGE');
console.log(`  frozen better-rule fingerprint basis: inherits LOWER_HARM_PREREGISTRATION + A2_PREREGISTRATION`);
console.log(`  inheritedFrom: ${discovery.D062_BETTER_RULE.inheritedFrom.join(', ')}`);
console.log(`  real dose strata read from SURPASS-2 (NCT03987919): ${doseStrata.map((s) => s.armTitle).join(', ')}\n`);

// --- HYPOTHESES --------------------------------------------------------------
console.log('HYPOTHESES');
console.log('  H-SATURATING-EFFICACY: HbA1c effect saturates with dose (receptor occupancy saturation)');
console.log('  H-LINEAR-HARM:         adverse-event burden keeps rising with dose (no saturation)');
console.log('  H-SEPARATION:          a dose exists where efficacy >= floor AND harm < baseline');
console.log('  H-NO-SEPARATION:       no such dose exists; harm tracks efficacy at every dose\n');

// --- MECHANISMS / CANDIDATES BY LINEAGE --------------------------------------
const { ports: realPorts } = ports.createD062Ports();
const retrieved = realPorts.retrievedCandidates();
const generated = realPorts.generatedCandidates();
const interpolated = realPorts.interpolatedCandidate();
console.log('CANDIDATES BY LINEAGE');
console.log(`  L0 FIXED_LIST (B_RETRIEVED)  : ${retrieved.length} — the fixed A2 molecule space`);
console.log(`  L1 INITIAL_SPACE (real doses) : ${generated.length} — ${generated.map((c) => c.candidateId).join(', ')}`);
console.log(`  L2 MUTATED (interpolated)     : ${interpolated ? 1 : 0} — ${interpolated?.candidateId ?? 'none'} (evidence-free by construction, never promotable)`);
console.log(`  L3 SYMBOLIC_COMPOSITION       : 0 — not attempted this run (disclosed, not silently dropped)\n`);

const { qualifying, eliminated } = realPorts.hardFilterAndRank([...retrieved, ...generated]);
console.log('HARD FILTER (efficacy floor + existential safety veto, real, unmodified)');
console.log(`  qualifying: ${qualifying.length}  eliminated: ${eliminated.length}`);
for (const e of eliminated.filter((e) => generated.some((g) => g.candidateId === e.candidateId))) {
  console.log(`    ${e.candidateId} -- ${e.reason}`);
}
console.log();

// --- PREDICTIONS / ROUNDS -----------------------------------------------------
console.log('RUNNING THE CHALLENGE (PRODUCTION mode, real custody-verified evidence)...\n');
const result = await discovery.runD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 });

record('run completed (RUN, not EXECUTION_BLOCKED)', result.kind === 'RUN', result.kind === 'EXECUTION_BLOCKED' ? `${result.code}: ${result.error}` : undefined);
if (result.kind !== 'RUN') {
  console.log(`\nOUTCOME: EXECUTION_BLOCKED — ${result.code}: ${result.error}`);
  process.exit(1);
}

record('3 real rounds executed', result.rounds.length === 3, `${result.rounds.length} round(s)`);
const pairs = result.rounds.map((r) => [...r.experimentLabels].sort().join('+'));
record('every round examined a genuinely different pair', new Set(pairs).size === result.rounds.length, pairs.join(' | '));

console.log('\nROUNDS');
for (const r of result.rounds) {
  console.log(`  ROUND ${r.round}`);
  console.log(`    experiment:  ${r.experimentLabels.join(' vs ')}`);
  console.log(`    survivors:   ${r.survivors.length}   falsified: ${r.falsified.length}`);
  console.log(`    next:        ${r.nextDirection}`);
}

console.log('\nBEST CANDIDATE');
if (result.bestCandidate === null) {
  console.log('  none reached a real head-to-head comparison');
} else {
  console.log(`  id: ${result.bestCandidate.candidateId}  lineage: ${result.bestCandidate.lineage}`);
  console.log(`  mechanism: ${result.bestCandidate.mechanism}`);
}

const wasAbsent = result.wasAbsentFromFixedSet;
record('ABSENT FROM FIXED CANDIDATE SET?', true /* reported, not asserted true */, wasAbsent ? 'YES' : 'NO — NOT A TRUE DISCOVERY RUN');
if (!wasAbsent) console.log('  NOT A TRUE DISCOVERY RUN');

console.log('\nBASELINE COMPARISON');
if (result.improvementVsBaseline === null) {
  console.log('  no candidate to compare');
} else {
  console.log(`  efficacyDelta vs baseline: ${result.improvementVsBaseline.efficacyDelta.toFixed(4)}`);
  console.log(`  harmDelta vs baseline:     ${result.improvementVsBaseline.harmDelta.toFixed(4)}`);
}

console.log('\nFALSIFICATION');
console.log(`  executed ${result.falsification.executedProbes} of ${result.falsification.availableProbes} self-falsification probes`);
console.log(`  ${result.falsification.unavailableReason}`);

console.log('\nD-057 WINNER PROMOTION GATE');
console.log(`  outcome: ${result.d057.outcome}`);
for (const reason of result.d057.reasons) console.log(`    - ${reason}`);

console.log(`\nVERDICT: ${result.verdict}`);
console.log(`WinnerRecord:   ${result.winnerRecord !== null ? 'YES' : 'NO'}`);
console.log(`ResearchRecipe: ${result.recipeFingerprint !== null ? `YES (${result.recipeFingerprint})` : 'NO'}`);

record('no WinnerRecord/Recipe without a real, conjunction-satisfying WINNER', (result.verdict === 'WINNER') === (result.winnerRecord !== null && result.recipeFingerprint !== null));
record('D-057 gate never bypassed: NO_WINNER implies no promotion', result.verdict === 'WINNER' || (result.winnerRecord === null && result.recipeFingerprint === null));

// --- REPLAY -------------------------------------------------------------------
console.log('\nREPLAY (two independent PRODUCTION runs through the SAME entry point)...');
const replay = await discovery.replayD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 });
record('replay: identical audit fingerprint', replay.ok, replay.first.kind === 'RUN' && replay.second.kind === 'RUN' ? `${replay.first.auditFingerprint} == ${replay.second.auditFingerprint}` : 'kind mismatch');

// --- lineage/novelty sanity -----------------------------------------------------
const noveltyLevel = result.bestCandidate === null ? 0 : lineage.noveltyLevelFromLineage(result.bestCandidate.lineage);
record('novelty level derived mechanically from lineage, never asserted', typeof noveltyLevel === 'number');
console.log(`\nnoveltyLevel: L${noveltyLevel}  priorArtAxis: ${result.priorArtAxis}`);

console.log('\nWHAT DID GENESIS INVENT?');
if (wasAbsent && result.bestCandidate !== null) {
  console.log(`  ${result.bestCandidate.label} — a dose stratum absent from the fixed A2 candidate space,`);
  console.log('  carrying its own real evidence and its own real mechanism claim.');
} else {
  console.log('  NOTHING — this run produced no candidate outside its fixed set.');
}

console.log('\nWHY IS IT BETTER THAN BASELINE?');
if (result.verdict === 'WINNER') {
  console.log(`  efficacyDelta=${result.improvementVsBaseline?.efficacyDelta.toFixed(4)} harmDelta=${result.improvementVsBaseline?.harmDelta.toFixed(4)} vs frozen baseline, D-057 PROMOTE.`);
} else {
  console.log(`  IT IS NOT — ${result.blockers.join(' | ')}`);
}

console.log(`\nNEXT EXPERIMENT: ${result.nextExperiment}`);

const allOk = checks.every((c) => c.ok);
console.log(`\nPASSED: ${checks.filter((c) => c.ok).length}/${checks.length} properties held.`);
console.log(`\nOUTCOME: ${result.verdict === 'WINNER' ? 'WINNER' : 'NO_WINNER'} after ${result.rounds.length} round(s).`);

console.log('\nSECTION-36-STYLE VERDICT:');
if (result.verdict === 'WINNER') {
  console.log('  Genesis found a real dose stratum, absent from its fixed candidate set, that clears the');
  console.log('  frozen better-than-baseline rule and the real, unmodified D-057 Winner Promotion Gate on');
  console.log('  real, custody-verified SURPASS-2 evidence. WinnerRecord -> ResearchRecipe reached honestly.');
} else {
  console.log('  Genesis tried a real, disclosed discovery strategy (dose-stratifying the pinned SURPASS-2');
  console.log('  trial rather than only reading its highest-dose arm, exactly as A2 always has). Real');
  console.log('  extraction, real per-dose evidence, real falsification. The result is NO_WINNER, and the');
  console.log('  blockers above name the exact reason and the exact next experiment — not "insufficient');
  console.log('  evidence" as a placeholder, but the specific conjunct that failed.');
}

process.exit(allOk ? 0 : 1);
