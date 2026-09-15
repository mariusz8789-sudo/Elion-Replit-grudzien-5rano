#!/usr/bin/env node
/**
 * GENESIS MOUNJARO / TIRZEPATIDE REPLACEMENT — FULL DISCOVERY TRACK E2E (D-081).
 *
 * Runs the whole chain the directive names, end to end, on real engines:
 *
 *   TARGETS -> DATA -> MODEL -> CANDIDATE GENERATION (real RDKit BRICS)
 *   -> DUAL-TARGET OBJECTIVES -> EXPERIMENT DAG (E1..E10) -> FALSIFICATION
 *   -> EVIDENCE -> ADJUDICATION -> CANONICAL WINNER GATE
 *   -> RESEARCH RECIPE or LOCKED
 *
 * Two outcomes are scientifically valid and this script will print whichever
 * is true: a real candidate with a recipe, or NO_WINNER with the exact,
 * auditable reason. Nothing is relaxed to reach the first one.
 *
 * The recipe/lock step runs the CANONICAL TypeScript Winner Gate, bundled on
 * the fly by esbuild into a temp dir (the pattern scripts/repro-demo.mjs
 * already uses). Nothing is installed or written into the repo.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { detect as rdkitDetect, validate as rdkitValidate } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { missionObjective, probeCapabilities, assessNovelty } from '../packages/backend/src/campaign/molecularMission.mjs';
import { probeGiprCapability, loadGiprValidationGate, GIPR_GATE_PATH } from '../packages/backend/src/campaign/giprQsar.mjs';
import { loadGlp1rValidationGate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { assessDualTargetAxes, rankDualTarget, dualTargetVerdict, DUAL_TARGET_OBJECTIVES } from '../packages/backend/src/campaign/dualTargetDiscovery.mjs';
import { runExperimentDag, compareDagRuns } from '../packages/backend/src/campaign/experimentDag.mjs';
import { generateRecombinationProposals } from '../packages/backend/src/campaign/drugAdapter.mjs';
import { runIntegrityWatchdogs } from '../packages/backend/src/security/scientificIntegrity.mjs';
import { pinEntry, buildPinManifest } from '../packages/backend/src/campaign/pinManifest.mjs';
import { readBasePinDigest, BASE_PIN_META, currentExtensionManifests, extensionSummary } from '../packages/backend/src/campaign/extensionManifest.mjs';
import { tirzepatideBaseline } from '../packages/backend/src/campaign/tirzepatideBaseline.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

console.log('=== GENESIS MOUNJARO REPLACEMENT DISCOVERY TRACK (D-081) ===\n');

// ---------------------------------------------------------------- 1. TARGETS
const objective = missionObjective();
console.log(`mission            : ${objective.missionId} (objective ${objective.objectiveFingerprint})`);
console.log(`baseline           : ${objective.baselineChemblId} (tirzepatide — DUAL GIP/GLP-1 receptor agonist)`);
const baselineLoad = tirzepatideBaseline();
const baseline = baselineLoad.ok ? baselineLoad.baseline : null;
console.log(`baseline potency   : ${baseline ? JSON.stringify(baseline.measuredPotencyNM) : baselineLoad.code}`);
console.log(`baseline structure : ${baseline?.structureAvailable === true ? 'available' : 'ABSENT — ' + String(baseline?.structureAbsentReason ?? '').slice(0, 90)}`);
console.log(`baseline GIPR rows : qualifyingAssayCounts.gipr = ${baseline?.qualifyingAssayCounts?.gipr ?? 'n/a'}`);
check('mission objective is frozen and fingerprinted', typeof objective.objectiveFingerprint === 'string' && objective.objectiveFingerprint.length === 16);

// ------------------------------------------------------------ 2. FROZEN GATES
const glp1rGate = loadGlp1rValidationGate();
const giprGate = loadGiprValidationGate();
console.log(`\nGLP-1R gate        : ${glp1rGate.ok ? glp1rGate.ruleFingerprint : glp1rGate.code}`);
console.log(`GIPR gate          : ${giprGate.ok ? giprGate.ruleFingerprint : giprGate.code}  (${GIPR_GATE_PATH.replace(REPO + '/', '')})`);
check('both target gates are frozen and self-consistent', glp1rGate.ok && giprGate.ok);
check('GIPR gate was NOT weakened relative to GLP-1R',
  giprGate.ok && glp1rGate.ok
  && giprGate.gate.MIN_TRAIN >= glp1rGate.gate.MIN_TRAIN && giprGate.gate.MIN_TEST >= glp1rGate.gate.MIN_TEST
  && giprGate.gate.MAX_MAE <= glp1rGate.gate.MAX_MAE && giprGate.gate.MIN_R2 >= glp1rGate.gate.MIN_R2,
  giprGate.ok ? `MIN_TRAIN=${giprGate.gate.MIN_TRAIN} MIN_TEST=${giprGate.gate.MIN_TEST} MAX_MAE=${giprGate.gate.MAX_MAE} MIN_R2=${giprGate.gate.MIN_R2}` : '');

// --------------------------------------------------------- 3. MODELS / AXES
const rd = rdkitDetect();
console.log(`\nRDKit              : ${rd.available ? `LIVE ${rd.version}` : 'UNAVAILABLE'}`);
const caps = probeCapabilities();
const glp1rProbe = () => ({
  available: caps.activityPredictor === true,
  code: caps.activityPredictor ? 'MODEL_VALIDATED' : (caps.glp1rBlockedReason ?? 'BLOCKED'),
  reasons: [caps.glp1rBlockedDetail ?? 'GLP-1R model did not clear its frozen gate'],
  metrics: caps.glp1rMetrics ?? null,
});
const glp1r = glp1rProbe();
const gipr = probeGiprCapability();
console.log(`GLP-1R axis        : ${glp1r.available ? 'AVAILABLE' : `BLOCKED (${glp1r.code})`} — ${glp1r.reasons[0] ?? ''}`);
console.log(`GIPR axis          : ${gipr.available ? 'AVAILABLE' : `BLOCKED (${gipr.code})`} — ${(gipr.reasons[0] ?? '').slice(0, 120)}`);
check('RDKit is the real engine, not a stub', rd.available === true, rd.version ?? '');

// ---------------------------------------------- 4. CANDIDATE GENERATION (real)
const seeds = ['CCOc1ccc(CNC(=O)C2CC2)cc1', 'O=C(N)c1ccc(OC)cc1', 'CC(=O)Nc1ccc(O)cc1'];
const recomb = rd.available ? generateRecombinationProposals(seeds, { maxPairs: 3, maxProductsPerPair: 3 }) : { proposals: [], attempts: 0, successes: 0 };
const realCandidates = recomb.proposals.filter((p) => typeof p.canonicalSmiles === 'string' && p.canonicalSmiles.length > 0);
console.log(`\ncandidates         : ${realCandidates.length} generated by REAL RDKit BRICS recombination from ${seeds.length} seeds (${recomb.attempts} pair attempts)`);
for (const c of realCandidates.slice(0, 3)) console.log(`  ${c.canonicalSmiles.slice(0, 62)}  <- ${c.transformation}`);
check('candidate generation used real RDKit (no fake chemistry)', realCandidates.length > 0 && realCandidates.every((c) => rdkitValidate(c.canonicalSmiles).ok));

// --------------------------------------------------- 5. DUAL-TARGET OBJECTIVES
console.log(`\ndual-target axes   : ${DUAL_TARGET_OBJECTIVES.map((o) => o.id).join(', ')}`);
const assessment = assessDualTargetAxes({ glp1rProbe, giprProbe: () => gipr, priorArtSearched: caps.priorArtSearch === true });
for (const ax of assessment.axes) console.log(`  ${ax.id.padEnd(20)} ${ax.available ? 'AVAILABLE' : `UNAVAILABLE (${ax.code})`}`);
const ranking = rankDualTarget(realCandidates.map((c) => ({ id: c.canonicalSmiles, objectives: {} })), assessment);
const dtVerdict = dualTargetVerdict(assessment, ranking);
console.log(`dual-target status : ${assessment.status} -> ${dtVerdict.outcome}`);
check('dual-target layer refuses to rank on an incomplete mechanism', assessment.mechanismComplete === false ? ranking.ok === false : ranking.ok === true);
check('dual-target ceiling is a model estimate, never a winner', dtVerdict.ceiling === 'DUAL_TARGET_MODEL_ESTIMATE');

// -------------------------------------------------------- 6. EXPERIMENT DAG
const subject = realCandidates[0] ?? { canonicalSmiles: null };
const ports = {
  structureValidity: (cand) => {
    const v = rdkitValidate(cand.canonicalSmiles ?? '');
    return { ok: v.ok === true, code: v.ok ? 'STRUCTURE_VALID' : 'STRUCTURE_INVALID', result: v.ok ? { canonicalSmiles: v.canonicalSmiles } : null, reasons: v.ok ? [] : [v.reason ?? 'RDKit refused the structure'], modelVersion: `rdkit-${rd.version}`, provenance: ['compute/rdkitAdapter.mjs::validate'] };
  },
  glp1rActivity: () => ({ ok: glp1r.available, code: glp1r.code, result: null, reasons: glp1r.reasons, modelVersion: 'glp1r-qsar-v2', ruleFingerprint: glp1rGate.ok ? glp1rGate.ruleFingerprint : null, provenance: ['campaign/glp1rEfficacyAdapter.mjs'] }),
  giprActivity: () => ({ ok: gipr.available, code: gipr.code, result: null, reasons: gipr.reasons, modelVersion: 'gipr-qsar-v1', ruleFingerprint: giprGate.ok ? giprGate.ruleFingerprint : null, provenance: ['campaign/giprQsar.mjs'] }),
  receptorBalance: () => ({ ok: assessment.mechanismComplete, code: assessment.mechanismComplete ? 'BALANCE_COMPUTED' : 'REQUIRES_BOTH_RECEPTOR_AXES', result: null, reasons: assessment.blockers.map((b) => b.detail), modelVersion: 'dual-target-v1', provenance: ['campaign/dualTargetDiscovery.mjs'] }),
  admet: () => ({ ok: false, code: 'ADMET_NOT_RUN_IN_THIS_RUNTIME', result: null, reasons: ['the ADMET stage needs a campaign database and a compute job; this E2E runs the DAG without one rather than faking a developability number'], modelVersion: null, provenance: ['campaign/multiFidelity.mjs'] }),
  liabilities: () => ({ ok: false, code: 'LIABILITY_AXIS_NEEDS_PREDICTION_SOURCE', result: null, reasons: ['the frozen liability rule scores model predictions; with no validated activity/ADMET predictions in this runtime there is nothing for it to score'], modelVersion: null, ruleFingerprint: null, provenance: ['campaign/molecularLiabilities.mjs'] }),
  novelty: (cand) => {
    const n = assessNovelty([{ canonicalSmiles: cand.canonicalSmiles, status: 'retained', generation: 1, parentSmiles: seeds[0], transformation: 'brics-recombination' }], caps);
    const ok = n.priorArt.status === 'SEARCHED';
    return { ok, code: ok ? 'PRIOR_ART_SEARCHED' : 'PRIOR_ART_NO_ACCESS', result: { structural: n.structural.status, lineage: n.lineage.status }, reasons: ok ? [] : [n.priorArt.basis], modelVersion: 'assessNovelty-v1', provenance: ['campaign/molecularMission.mjs::assessNovelty'] };
  },
  robustness: () => ({ ok: false, code: 'NEEDS_A_VALIDATED_MODEL', result: null, reasons: ['robustness perturbs a model prediction; there is no validated model to perturb'], modelVersion: null, provenance: [] }),
  counterfactual: () => ({ ok: false, code: 'NEEDS_A_VALIDATED_MODEL', result: null, reasons: ['a counterfactual re-query needs a validated model'], modelVersion: null, provenance: [] }),
};
const dag = runExperimentDag(subject, ports);
console.log(`\nexperiment DAG     : runId ${dag.runId}  graphFingerprint ${dag.graphFingerprint}`);
for (const n of dag.nodes) console.log(`  ${n.nodeId.padEnd(4)} ${n.status.padEnd(26)} ${n.code}`);
const replay = compareDagRuns(dag, runExperimentDag(subject, ports));
console.log(`DAG replay         : ${replay.verdict}`);
check('every DAG node carries an input hash and a run id', dag.nodes.every((n) => n.inputHash && n.runId));
check('a blocked upstream node blocks downstream instead of being skipped silently', dag.nodes.some((n) => n.status === 'SKIPPED_UPSTREAM_BLOCKED') || dag.complete);
check('DAG replay is deterministic', replay.verdict === 'MATCH');

// ------------------------------------------------------------ 7. EVIDENCE
// Every experiment this pipeline can run is COMPUTATIONAL (rank 2), far below
// the INDIRECT_RANDOMISED (rank 9) the canonical gate demands. Declared
// honestly rather than dressed up.
const evidence = dag.nodes
  .filter((n) => n.status === 'PASS' && n.nodeId !== 'E10')
  .map((n) => ({ evidenceClass: 'COMPUTATIONAL', observationCount: 1, sourceId: `dag:${dag.runId}:${n.nodeId}` }));
console.log(`\nevidence inventory : ${evidence.length} COMPUTATIONAL observation(s) — in-silico work cannot rank above COMPUTATIONAL, by design`);

// ---------------------------------------------------------- 8. ADJUDICATION
const decisiveBlocked = dag.decisiveFailures.length > 0;
const adjudicationVerdict = decisiveBlocked || !assessment.mechanismComplete ? 'INSUFFICIENT_EVIDENCE' : 'NO_WINNER';
console.log(`adjudication       : ${adjudicationVerdict}`);
for (const f of dag.decisiveFailures) console.log(`  decisive failure: ${f.nodeId} ${f.status} (${f.code})`);

// ------------------------------------- 9. CANONICAL WINNER GATE + RECIPE|LOCK
const tmp = mkdtempSync(path.join(tmpdir(), 'genesis-mounjaro-'));
let recipeOutcome;
try {
  const out = path.join(tmp, 'recipe.mjs');
  execFileSync('npx', ['esbuild', 'packages/frontend/src/core/discovery/molecular/mounjaroRecipeEntry.node.ts',
    '--bundle', '--format=esm', '--platform=node', '--target=node22', '--legal-comments=none', `--outfile=${out}`],
  { cwd: REPO, stdio: 'pipe' });
  const { buildMounjaroResearchRecipe } = await import(out);

  const artifact = {
    missionId: objective.missionId,
    objectiveFingerprint: objective.objectiveFingerprint,
    adjudicationVerdict,
    candidateId: subject.canonicalSmiles,
    canonicalStructure: subject.canonicalSmiles,
    parentage: [{ parentSmiles: seeds[0], transformation: 'brics-recombination' }],
    targetHypotheses: ['GLP-1R agonism', 'GIPR agonism', 'dual GIP/GLP-1 agonism as in tirzepatide'],
    glp1r: { available: glp1r.available, code: glp1r.code, reasons: glp1r.reasons, modelFingerprint: null },
    gipr: { available: gipr.available, code: gipr.code, reasons: gipr.reasons, modelFingerprint: gipr.modelFingerprint },
    dualTarget: { outcome: dtVerdict.outcome, blockers: dtVerdict.blockers, fingerprint: dtVerdict.fingerprint },
    modelVersions: { glp1r: 'glp1r-qsar-v2', gipr: 'gipr-qsar-v1', rdkit: rd.version ?? null },
    datasetFingerprints: { glp1rGate: glp1rGate.ok ? glp1rGate.ruleFingerprint : null, giprGate: giprGate.ok ? giprGate.ruleFingerprint : null },
    evidence,
    experimentGraph: { runId: dag.runId, graphFingerprint: dag.graphFingerprint, nodes: dag.nodes.map((n) => ({ nodeId: n.nodeId, status: n.status, code: n.code })) },
    falsification: dag.decisiveFailures.map((f) => ({ probe: f.nodeId, result: 'FAIL', detail: f.reason ?? f.code })),
    failedAlternatives: realCandidates.slice(1).map((c) => ({ candidateId: c.canonicalSmiles, rejectedReason: 'not evaluated: the dual-target mechanism axes are unavailable, so no candidate could be ranked' })),
    knownUnknowns: [
      `the pinned human GIPR set is below the frozen gate's floor: ${gipr.reasons?.[0] ?? gipr.code}`,
      'the GLP-1R model misses its own frozen gate at MAE 1.0425 > MAX_MAE 1.0',
      'prior-art search is unreachable from this runtime, so novelty is unverifiable rather than established',
    ],
    reproducibility: { deterministic: replay.verdict === 'MATCH', replayVerdict: replay.verdict },
  };
  recipeOutcome = buildMounjaroResearchRecipe(artifact);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nwinner gate        : ${recipeOutcome.promotion.outcome} (minimumObservations=${recipeOutcome.promotion.minimumObservations}, total=${recipeOutcome.promotion.totalObservations}, strong=${recipeOutcome.promotion.strongCount})`);
console.log(`recipe             : ${recipeOutcome.status}`);
if (recipeOutcome.status === 'RECIPE_LOCKED') {
  for (const r of recipeOutcome.reasons.slice(0, 6)) console.log(`  lock reason: ${String(r).slice(0, 150)}`);
  console.log(`  lockFingerprint: ${recipeOutcome.lockFingerprint}`);
} else {
  console.log(`  recipeId: ${recipeOutcome.recipe.recipeId}  fingerprint ${recipeOutcome.recipe.fingerprint}`);
}
check('recipe is structurally absent when not promoted', recipeOutcome.status === 'RECIPE_LOCKED' ? !('recipe' in recipeOutcome) : true);
check('winner gate used the canonical MINIMUM_OBSERVATIONS', recipeOutcome.promotion.minimumObservations === 3);

// ------------------------------------------- 9b. INTEGRITY WATCHDOGS (D-084)
// The verdict above is only worth as much as the frozen rules it was produced
// under. These run on EVERY E2E so a moved threshold, a swapped pin or a
// WinnerRecord without a canonical PROMOTE surfaces here rather than in a
// review months later.
// D-087 — the EXPECTED digests are constants sealed when each pin was
// ingested (D-076/077 for GLP-1R, D-081a for GIPR). A first version built both
// the manifest AND the "loaded" map from the same readBasePinDigest call, so
// the drift check compared a value against itself and could never fail. A
// check that cannot fail is not a check.
const EXPECTED_PIN_SHA = Object.freeze({
  GLP1R: '5533d8b8940987fde860cd3438882e0b1bc509bc810f75f1cff4302530e69244',
  GIPR: '24bac802ce9a65a6c83bb7e4dbe4567aff97f9a5eecf99c26c369876426b87ba',
});
const glp1rPinDigest = readBasePinDigest(BASE_PIN_META.GLP1R);
const giprPinDigest = readBasePinDigest(BASE_PIN_META.GIPR);
const pinManifest = buildPinManifest([
  pinEntry({ pinId: 'GLP1R', role: 'base', target: 'CHEMBL1784', species: 'Homo sapiens', normalizedSha256: EXPECTED_PIN_SHA.GLP1R, rows: glp1rPinDigest.rows ?? 0 }),
  pinEntry({ pinId: 'GIPR', role: 'base', target: 'CHEMBL4383', species: 'Homo sapiens', normalizedSha256: EXPECTED_PIN_SHA.GIPR, rows: giprPinDigest.rows ?? 0 }),
]);
const watchdogs = runIntegrityWatchdogs({
  manifest: pinManifest,
  loadedPins: { GLP1R: glp1rPinDigest.sha256, GIPR: giprPinDigest.sha256 },
  winnerRecord: recipeOutcome.status === 'RECIPE_ISSUED' ? recipeOutcome.recipe : null,
  promotionOutcome: recipeOutcome.promotion.outcome,
  promotion: { outcome: recipeOutcome.promotion.outcome, maxRank: Math.max(0, ...evidence.map((e) => e.rank ?? 0)) },
});
console.log(`\nintegrity watchdogs: ${watchdogs.clean ? 'CLEAN' : 'EVENTS RAISED'}`);
for (const ev of watchdogs.events) console.log(`  ${ev.event}: ${String(ev.reason ?? ev.pinId ?? ev.code).slice(0, 120)}`);
check('frozen gates, pins and promotion provenance pass the integrity watchdogs', watchdogs.clean);

const extSummary = extensionSummary(currentExtensionManifests());
console.log(`missing datasets   : ${extSummary.total} recorded (${Object.entries(extSummary.byStatus).map(([k, v]) => `${k}=${v.length}`).join(', ')})`);
check('no extension manifest claims a hash for data that was never retrieved', extSummary.fabricatedHashes === 0);

// ---------------------------------------------------------------- 10. VERDICT
const finalOutcome = recipeOutcome.status === 'RECIPE_ISSUED' ? 'WINNER' : 'NO_WINNER';
console.log(`\n=== FINAL: ${finalOutcome} ===`);
if (finalOutcome === 'NO_WINNER') {
  console.log('WHY NO WINNER (exact, auditable):');
  const m = glp1r.metrics;
  const glp1rMeasured = m
    ? `measured MAE ${m.mae.toFixed(4)} (R2 ${m.r2.toFixed(4)}, nTest ${m.n}) against the frozen MAX_MAE of 1.0`
    : 'no metrics were produced';
  console.log(`  1. GLP-1R axis  : ${glp1r.code} — the model trains on the real pinned human rows but misses its own frozen gate: ${glp1rMeasured}. The threshold was NOT moved.`);
  console.log(`  2. GIPR axis    : ${gipr.code} — tirzepatide is a DUAL agonist. ${gipr.reasons?.[0] ?? 'the GIPR axis did not clear its frozen gate'}. Scientific egress is refused by proxy policy, so more rows cannot be fetched from here.`);
  console.log('  3. Mechanism    : with either receptor axis unavailable, no candidate can be compared to tirzepatide\'s mechanism at all, so the dual-target layer produced no ranking.');
  console.log('  4. Prior art    : unreachable from this runtime — novelty is UNVERIFIABLE, never assumed.');
  console.log(`  5. Evidence     : ${evidence.length} COMPUTATIONAL observation(s); the canonical gate requires >= 3 observations AND >= 1 at or above INDIRECT_RANDOMISED. In-silico work ranks COMPUTATIONAL (2) and cannot reach 9 by accumulating.`);
  console.log('\nThis is a valid scientific result, not a failure of the pipeline: the pipeline ran end to end and refused to promote.');
}

const allPassed = checks.every((c) => c.ok);
console.log(`\nSTATUS: ${allPassed ? 'VALIDATED' : 'BLOCKED'} (${checks.filter((c) => c.ok).length}/${checks.length} checks)`);
process.exit(allPassed ? 0 : 1);
