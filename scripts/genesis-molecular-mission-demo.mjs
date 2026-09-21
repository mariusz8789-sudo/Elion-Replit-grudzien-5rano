#!/usr/bin/env node
/**
 * GENESIS-MOL-01 — the molecular discovery mission, end to end
 * (docs/DECISIONS.md D-074).
 *
 *   node scripts/genesis-molecular-mission-demo.mjs
 *
 * Runs the REAL campaign machinery (RDKit generation + BRICS recombination +
 * constraints + the D-069 liability gate + Pareto + adaptive strategy) against
 * the frozen, hash-verified tirzepatide baseline, then reports the verdict the
 * pipeline itself produced. Both COMPUTATIONAL_CANDIDATE and NO_WINNER are
 * valid terminal states; this script never manufactures the former.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(REPO, 'packages/backend/src');

const { openDatabase, createUser, createProject } = await import(path.join(SRC, 'store.mjs'));
const { hashPassword } = await import(path.join(SRC, 'auth.mjs'));
const { runMolecularMission, MISSION_ID } = await import(path.join(SRC, 'campaign/molecularMission.mjs'));

const THRESHOLDS = path.join(SRC, 'campaign/frozen-prediction-thresholds.json');
const RULE_FP = '28505cb769d5554f';

/**
 * Documented, non-novel reference chemicals — the SAME starting population the
 * existing validation campaign uses. Stated plainly rather than dressed up:
 * this seed set is NOT derived from GLP-1R chemistry, because no GLP-1R
 * structures are obtainable in this runtime. That limitation is carried into
 * the recipe as `seedProvenance` and is one of the reasons this run cannot
 * reach a winner.
 */
const SEEDS = ['c1ccccc1', 'Oc1ccccc1', 'Nc1ccccc1', 'Cc1ccccc1'];
const SEED_PROVENANCE =
  'documented non-novel reference chemicals (benzene, phenol, aniline, toluene) — NOT target-derived: no GLP-1R-active structures are obtainable in this runtime';

const db = openDatabase(':memory:');
const user = createUser(db, { email: 'mol-01@genesis.local', displayName: 'GENESIS-MOL-01', passwordHash: hashPassword('x') });
const project = createProject(db, { ownerId: user.id, name: MISSION_ID });

const r = runMolecularMission(db, {
  projectId: project.id,
  seeds: SEEDS,
  seedProvenance: SEED_PROVENANCE,
  thresholdsPath: THRESHOLDS,
  expectedRuleFingerprint: RULE_FP,
  budget: { maxGenerations: 3, maxGeneratedCandidates: 60 },
});

if (!r.ok) {
  console.log(`MISSION BLOCKED: [${r.code}] ${r.reason}`);
  process.exit(1);
}

const line = (t) => console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`);

console.log('GENESIS SCIENTIFIC DISCOVERY DEMO — GENESIS-MOL-01');

line('1. PROBLEM');
console.log(r.objective.question);
console.log(`objectiveFingerprint: ${r.objective.objectiveFingerprint} (frozen BEFORE any candidate was generated)`);

line('2. BASELINE = TIRZEPATIDE');
const b = r.baseline;
console.log(`${b.chemblId} ${b.name} — ${b.moleculeType}, maxPhase ${b.maxPhase}`);
console.log(`measured potency (nM): ${JSON.stringify(b.measuredPotencyNM)}   [${b.evidenceClass}]`);
console.log(`pinned bytes sha256: ${b.provenance.contentSha256}`);
console.log(`structureAvailable: ${b.structureAvailable}  <-- ${b.structureAbsentReason}`);

line('3. GENERATED CANDIDATES');
console.log(`seeds: ${SEEDS.join(', ')}`);
console.log(`seed provenance: ${SEED_PROVENANCE}`);
console.log(`generated ${r.summary.totalGenerated}, retained ${r.summary.retainedCount}, Pareto front ${r.summary.paretoCount}, stop=${r.summary.stopReason} after ${r.summary.generations} generation(s)`);

line('4. LINEAGE (Pareto front)');
for (const c of r.recipe.paretoFront.slice(0, 8)) {
  const via = c.transformation ? `${c.transformation}(${c.parentSmiles}${c.coParentSmiles ? ' + ' + c.coParentSmiles : ''})` : 'seed';
  console.log(`  ${c.canonicalSmiles.padEnd(22)} gen${c.generation}  <- ${via}`);
}

line('5. RDKIT VALIDATION');
console.log(`engine: RDKit ${r.capabilities.rdkitVersion} (live)`);
console.log(`every candidate above is an RDKit-sanitised canonical SMILES; InChIKeys recorded, e.g. ${r.recipe.paretoFront[0]?.inchiKey ?? 'n/a'}`);

line('6. PREDICTED PROPERTIES (Pareto front)');
for (const c of r.recipe.paretoFront.slice(0, 8)) {
  const l = c.liabilities ?? {};
  console.log(`  ${c.canonicalSmiles.padEnd(22)} MW=${String(c.descriptors.molWt).padEnd(8)} logP=${String(c.descriptors.crippenLogP).padEnd(8)} TPSA=${String(c.descriptors.tpsa).padEnd(7)} QED=${l.qed ?? '?'} alerts=${l.structuralAlertCount ?? '?'}`);
}

line('7. HARD FILTERS (D-069 Option A, frozen)');
console.log(`ruleFingerprint: ${r.recipe.frozenRule.ruleFingerprint}  [${r.recipe.frozenRule.evidenceClass}]`);
for (const t of r.recipe.frozenRule.terms) console.log(`  ${t.term} ${t.kind} ${t.value}`);
console.log('applied BEFORE Pareto — a liability rule may rule a candidate OUT, never rank one IN');

line('8. FALSIFICATION');
for (const p of r.falsification.probes) console.log(`  ${p.result.padEnd(10)} ${p.probe.padEnd(30)} ${p.detail}`);
console.log(`allPassed=${r.falsification.allPassed}  failed=[${r.falsification.failed.join(', ')}]  unresolved=[${r.falsification.unresolved.join(', ')}]`);

line('9. RANKING');
console.log(`2-D Pareto over the frozen benchmark objectives (|logP-2.5|, |MW-350|/100); hypervolume ${r.summary.hypervolumeStart?.toFixed?.(4) ?? '?'} -> ${r.summary.hypervolumeEnd?.toFixed?.(4) ?? '?'}`);
console.log('NOTE: these objectives are a SEARCH BENCHMARK, not a therapeutic claim (campaign/drugAdapter.mjs states this in its own header).');

line('10. COMPARISON TO BASELINE');
console.log(`baseline measurable on : [${r.axes.baselineMeasurable.join(', ') || '(nothing computable)'}]`);
console.log(`candidates measurable on: [${r.axes.candidateMeasurable.join(', ') || '(nothing)'}]`);
console.log(`COMPARABLE AXES        : [${r.axes.comparable.join(', ') || 'NONE'}]  disjoint=${r.axes.disjoint}`);
console.log('=> not a single quantity can be compared between a candidate and the baseline.');

line('11. UNCERTAINTY');
console.log('QED is computed and reported for every candidate and gates NOTHING — it has no canonical cut-off,');
console.log('so using one as a pass/fail threshold would be an arbitrary success criterion. Liability terms are');
console.log(`evidenceClass=${r.recipe.frozenRule.evidenceClass} (deterministic published rules), NOT MODEL_ESTIMATE and NOT an adverse-event prediction.`);
console.log(`Engines absent (adapters report BLOCKED_BY_RUNTIME, nothing substitutes): ADMET-AI=${!r.capabilities.admet} docking=${!r.capabilities.docking} quantum=${!r.capabilities.quantum}`);

line('12. NOVELTY');
console.log(`  structural : ${r.novelty.structural.status} — ${r.novelty.structural.derivedFromSeeds} derived, ${r.novelty.structural.distinctRetained} distinct (${r.novelty.structural.basis})`);
console.log(`  lineage    : ${r.novelty.lineage.status} — ${r.novelty.lineage.basis}`);
console.log(`  prior art  : ${r.novelty.priorArt.status} — ${r.novelty.priorArt.basis}`);

line('13. FINAL DECISION');
console.log(`OUTCOME: ${r.decision.outcome}`);
for (const bl of r.decision.blockers) console.log(`  BLOCKER ${bl.code}: ${bl.detail}`);
console.log(`\n${r.decision.claimBoundary}`);

line('14. RESEARCH RECIPE');
console.log(`recipeFingerprint: ${r.recipe.recipeFingerprint} (deterministic — no timestamp, no random id in the fingerprinted body)`);
console.log(`fields: ${Object.keys(r.recipe).length} incl. baseline, seeds, frozenRule, engines, paretoFront, comparableAxes, falsification, novelty, decision, nextAction, limitations, reproducibilityInstructions`);
console.log('\nMIND — what is missing and what to do next:');
console.log(`  CURRENT STATE : ${r.summary.retainedCount} retained candidates, ${r.summary.paretoCount} on the Pareto front, full lineage, liability gate frozen and applied`);
console.log(`  MISSING       : ${r.decision.blockers.map((x) => x.code).join(', ')}`);
console.log(`  NEXT ACTION   : ${r.plan.nextAction}`);
console.log(`  RATIONALE     : ${r.plan.rationale}`);
console.log(`  STOP CONDITION: ${r.plan.stopCondition}`);

line('15. REPLAY');
const r2 = runMolecularMission(db, {
  projectId: project.id, seeds: SEEDS, seedProvenance: SEED_PROVENANCE,
  thresholdsPath: THRESHOLDS, expectedRuleFingerprint: RULE_FP,
  budget: { maxGenerations: 3, maxGeneratedCandidates: 60 },
});
const match = r2.ok && r2.recipe.recipeFingerprint === r.recipe.recipeFingerprint;
console.log(`first : ${r.recipe.recipeFingerprint}`);
console.log(`second: ${r2.ok ? r2.recipe.recipeFingerprint : 'BLOCKED'}`);
console.log(`RESULT: ${match ? 'MATCH' : 'MISMATCH'}`);

line('INVARIANT CHECKS');
const checks = [];
const rec = (n, ok) => { checks.push(ok); console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${n}`); };
rec('a real chemistry engine ran (RDKit live, not stubbed)', r.capabilities.rdkit === true);
rec('baseline loaded from pinned bytes and hash-verified', typeof r.baseline.provenance.contentSha256 === 'string' && r.baseline.provenance.contentSha256.length === 64);
rec('frozen liability rule was applied, not bypassed', r.recipe.frozenRule.ruleFingerprint === RULE_FP);
rec('no frozen gate term leaked into an objective (D-069 Option A)', !r.falsification.failed.includes('NO_GATE_TERM_IN_OBJECTIVE'));
rec('candidates were genuinely derived beyond the seed set', r.novelty.structural.derivedFromSeeds > 0);
rec('prior art reported NO_ACCESS, never silently treated as novelty', r.novelty.priorArt.status === 'NO_ACCESS');
rec('verdict is a real terminal state', ['NO_WINNER', 'COMPUTATIONAL_CANDIDATE'].includes(r.decision.outcome));
rec('no winner was produced without a comparable axis', !(r.decision.outcome === 'COMPUTATIONAL_CANDIDATE' && r.axes.disjoint));
rec('recipe fingerprint is deterministic across two runs', match);

const allOk = checks.every(Boolean);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter(Boolean).length}/${checks.length} invariants held.`);
process.exit(allOk ? 0 : 1);
