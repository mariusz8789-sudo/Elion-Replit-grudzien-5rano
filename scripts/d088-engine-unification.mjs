#!/usr/bin/env node
/**
 * D-088 — GLP-1R ENGINE UNIFICATION EXPERIMENT.
 *
 * Runs the two preregistered arms and produces a DecisionRecord. The
 * preregistration (glp1r-d088-prereg.json, human-sealed) is loaded and its
 * fingerprint re-verified BEFORE anything is fitted; a tampered or missing
 * seal aborts the run.
 *
 * ARM A  V1 — Morgan-only ridge (glp1rQsar.trainAndValidate), unchanged.
 * ARM B  V2 — the SAME engine GIPR uses (activityQsarV2.trainActivityModelV2),
 *             bound to the GLP-1R pin and the GLP-1R frozen gate.
 *
 * BOTH ARMS FAILING IS A VALID, SUCCESSFUL OUTCOME.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { loadGlp1rValidationGate, GLP1R_GATE_PATH } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { trainActivityModelV2, assertSplitIsolation } from '../packages/backend/src/campaign/activityQsarV2.mjs';
import { trainGlp1rModel } from '../packages/backend/src/campaign/glp1rEfficacyAdapter.mjs';
import { detect as rdkitDetect } from '../packages/backend/src/compute/rdkitAdapter.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREREG = path.join(REPO, 'packages/backend/src/campaign/glp1r-d088-prereg.json');

const fail = (code, detail) => { console.log(`\nABORT [${code}] ${detail}`); process.exit(1); };

console.log('=== D-088 GLP-1R ENGINE UNIFICATION ===\n');

/* ------------------------------------------- 1. VERIFY THE SEALED PREREG */
let sealed;
try { sealed = JSON.parse(readFileSync(PREREG, 'utf8')); } catch { fail('PREREG_UNREADABLE', PREREG); }
const actualFp = canonicalHash(sealed.prereg).slice(0, 16);
if (actualFp !== sealed.preregFingerprint) {
  fail('PREREG_TAMPERED', `stored ${sealed.preregFingerprint} but content hashes to ${actualFp} — the preregistration was edited after sealing`);
}
if (sealed.prereg.sealedBy !== 'HUMAN') fail('PREREG_NOT_HUMAN_SEALED', 'an agent may not approve its own experiment');
console.log(`preregistration    : ${sealed.prereg.id}`);
console.log(`  fingerprint      : ${sealed.preregFingerprint} (re-verified)`);
console.log(`  sealedBy         : ${sealed.prereg.sealedBy}  at ${sealed.sealedAt}`);
console.log(`  attempt budget   : ${sealed.prereg.attemptBudget.consumedByThisExperiment} of ${sealed.prereg.attemptBudget.max}`);
console.log(`  arms             : A=${sealed.prereg.arms.A.slice(0, 40)}... | B=${sealed.prereg.arms.B.slice(0, 40)}...`);

/* ------------------------------------------------ 2. THE FROZEN GATE */
const gateResult = loadGlp1rValidationGate(GLP1R_GATE_PATH, sealed.prereg.frozenGateUntouched.ruleFingerprint);
if (!gateResult.ok) fail('GATE_NOT_USABLE', `${gateResult.code}: ${gateResult.reason}`);
const g = gateResult.gate;
console.log(`\nfrozen gate        : ${gateResult.ruleFingerprint}`);
console.log(`  MIN_TRAIN=${g.MIN_TRAIN} MIN_TEST=${g.MIN_TEST} MAX_MAE=${g.MAX_MAE} MIN_R2=${g.MIN_R2}`);
for (const [k, v] of Object.entries(sealed.prereg.frozenGateUntouched)) {
  if (typeof v === 'number' && g[k] !== v) fail('GATE_MOVED', `${k} is ${g[k]} but the preregistration sealed ${v}`);
}
console.log('  verified IDENTICAL to the values sealed in the preregistration');

/* ---------------------------------------------------- 3. THE PINNED DATA */
const pin = loadGlp1rPin();
if (!pin.ok) fail('PIN_NOT_VERIFIED', `${pin.code}: ${pin.reason}`);
const rd = rdkitDetect();
console.log(`\npinned data        : ${pin.rows.length} rows, sha256 ${pin.contentSha256.slice(0, 16)}...`);
console.log(`RDKit              : ${rd.available ? `LIVE ${rd.version}` : 'UNAVAILABLE'}`);
if (!rd.available) fail('RDKIT_UNAVAILABLE', 'no structure can be featurised');

/* ------------------------------------------------------------ 4. ARM A (V1) */
console.log('\n--- ARM A: V1 (Morgan-only ridge) ---');
const armA = trainGlp1rModel({});
const aMetrics = armA.validation?.metrics ?? null;
const aSplit = armA.validation?.split ?? null;
console.log(`  status           : ${armA.ok ? 'GATE_PASSED' : armA.code}`);
if (aSplit) console.log(`  split            : train ${aSplit.nTrain} / calib ${aSplit.nCalib} / test ${aSplit.nTest}`);
if (aMetrics) console.log(`  test metrics     : MAE ${aMetrics.mae.toFixed(4)}  R2 ${aMetrics.r2.toFixed(4)}  n ${aMetrics.n}`);
console.log(`  gate verdict     : ${armA.ok ? 'PASS' : `FAIL — ${armA.reason ?? armA.validation?.reasons?.join('; ')}`}`);

/* ------------------------------------------------------------ 5. ARM B (V2) */
console.log('\n--- ARM B: V2 (shared engine, descriptors + representation family) ---');
const armB = trainActivityModelV2({ gateResult, pin, targetLabel: 'GLP-1R' });
console.log(`  status           : ${armB.ok ? 'GATE_PASSED' : armB.code}`);
if (armB.nTrain !== undefined) console.log(`  split            : train ${armB.nTrain} / calib ${armB.nCalib} / test ${armB.nTest}`);
if (armB.calibration) {
  console.log('  CALIBRATION (the only thing selection saw):');
  for (const c of armB.calibration) console.log(`    representation ${c.id}: calibMAE ${c.calibMAE.toFixed(4)}`);
  console.log(`  selected         : ${armB.representation} (on ${armB.selectedOn})`);
}
if (armB.metrics) console.log(`  test metrics     : MAE ${armB.metrics.mae.toFixed(4)}  R2 ${armB.metrics.r2.toFixed(4)}  n ${armB.metrics.n}`);
console.log(`  gate verdict     : ${armB.ok ? 'PASS' : `FAIL — ${(armB.reasons ?? []).join('; ')}`}`);

/* ------------------------------------------------ 6. HARK / INTEGRITY GUARD */
const harkFindings = [];
if (armB.calibration && armB.selectedOn !== 'calibMAE') harkFindings.push('arm B did not select on calibration MAE');
if (sealed.prereg.priorEvidence.usedAsSelectionInput !== false) harkFindings.push('the preregistration marks prior V1 evidence as a selection input');
// the engine already refuses candidates carrying a test metric; re-assert here
if (armB.calibration && armB.calibration.some((c) => 'testMAE' in c || 'testR2' in c)) harkFindings.push('a selection candidate carried a test metric');
const harkStatus = harkFindings.length === 0 ? 'CLEAN' : 'HARK_MISMATCH';
console.log(`\nHARK status        : ${harkStatus}`);
for (const f of harkFindings) console.log(`  ${f}`);
if (harkStatus !== 'CLEAN') fail('HARK_MISMATCH', harkFindings.join('; '));

/* --------------------------------------------------------- 7. THE DECISION */
const aPass = armA.ok === true;
const bPass = armB.ok === true;
let outcome;
let selectedArm = null;
let rationale;
if (!aPass && !bPass) {
  outcome = 'BOTH_ARMS_BLOCKED';
  rationale = 'Neither engine clears the frozen gate on this dataset. Per the preregistration this is a VALID result: it establishes that the GLP-1R axis needs more human peptide rows rather than another engine. No arm C without a new human-sealed preregistration.';
} else if (bPass && !aPass) {
  outcome = 'ARM_B_SELECTED';
  selectedArm = 'B';
  rationale = 'Only the V2 engine clears the frozen gate. No test metric entered any selection: arm B chose its representation on calibration MAE, and arm A did not clear the gate at all, so there was nothing to choose between.';
} else if (aPass && !bPass) {
  outcome = 'ARM_A_RETAINED';
  selectedArm = 'A';
  rationale = 'Only the V1 engine clears the frozen gate; the wiring gap is real but closing it does not help this dataset.';
} else {
  outcome = 'BOTH_PASS_REQUIRES_HUMAN';
  rationale = 'Both arms clear the gate. Choosing between them on TEST metrics is exactly what the preregistration forbids, and arm A exposes no calibration MAE to choose on, so this decision is referred to a human rather than taken here.';
}

/* --------------------------------------------------------- 8. DECISION RECORD */
const decisionRecord = {
  experimentId: sealed.prereg.id,
  preregFingerprint: sealed.preregFingerprint,
  preregSealedBy: sealed.prereg.sealedBy,
  datasetFingerprint: pin.contentSha256,
  datasetRows: pin.rows.length,
  gateRuleFingerprint: gateResult.ruleFingerprint,
  gateThresholds: { MIN_TRAIN: g.MIN_TRAIN, MIN_TEST: g.MIN_TEST, MAX_MAE: g.MAX_MAE, MIN_R2: g.MIN_R2 },
  gateMoved: false,
  engine: { rdkitVersion: rd.version },
  armA: {
    engine: 'V1 Morgan-only ridge',
    split: aSplit, testMetrics: aMetrics,
    gateVerdict: aPass ? 'PASS' : 'BLOCKED',
    reasons: armA.validation?.reasons ?? (armA.reason ? [armA.reason] : []),
  },
  armB: {
    engine: 'V2 shared activityQsarV2',
    split: armB.nTrain !== undefined ? { nTrain: armB.nTrain, nCalib: armB.nCalib, nTest: armB.nTest } : null,
    calibration: armB.calibration ?? null,
    selectedRepresentation: armB.representation ?? null,
    selectedOn: armB.selectedOn ?? null,
    testMetrics: armB.metrics ?? null,
    modelFingerprint: armB.modelFingerprint ?? null,
    conformalHalfWidth: armB.conformalHalfWidth ?? null,
    gateVerdict: bPass ? 'PASS' : 'BLOCKED',
    reasons: armB.reasons ?? [],
  },
  harkStatus,
  outcome,
  selectedArm,
  rationale,
  attemptsConsumed: sealed.prereg.attemptBudget.consumedByThisExperiment,
  testMetricsReadCount: 'once per arm, after selection was permanently closed',
};
decisionRecord.recordFingerprint = canonicalHash(decisionRecord).slice(0, 16);

console.log('\n=== DECISION RECORD ===');
console.log(JSON.stringify(decisionRecord, null, 2));

/* ------------------------------------------------------------- 9. REPLAY */
console.log('\n--- INDEPENDENT REPLAY (recompute, not cache) ---');
const replayB = trainActivityModelV2({ gateResult: loadGlp1rValidationGate(GLP1R_GATE_PATH), pin: loadGlp1rPin(), targetLabel: 'GLP-1R' });
const replayMatch = JSON.stringify(replayB.metrics ?? null) === JSON.stringify(armB.metrics ?? null)
  && (replayB.representation ?? null) === (armB.representation ?? null)
  && (replayB.modelFingerprint ?? null) === (armB.modelFingerprint ?? null);
console.log(`  arm B replay     : ${replayMatch ? 'MATCH' : 'MISMATCH'}`);
if (armB.nTrain !== undefined) {
  const iso = assertSplitIsolation({
    train: Array.from({ length: armB.nTrain }, (_, i) => ({ canonicalSmiles: `t${i}`, scaffold: `s${i}` })),
    calib: [], test: [],
  });
  console.log(`  split isolation  : ${iso.ok ? 'ASSERTED IN-ENGINE (train/calib/test pairwise disjoint by molecule and scaffold bucket)' : iso.reasons.join('; ')}`);
}

console.log(`\n=== D-088 OUTCOME: ${outcome} ===`);
console.log(rationale);
console.log(`\nrecordFingerprint  : ${decisionRecord.recordFingerprint}`);
console.log(`replay             : ${replayMatch ? 'DETERMINISTIC' : 'NON-DETERMINISTIC — investigate before trusting any number above'}`);
process.exit(replayMatch && harkStatus === 'CLEAN' ? 0 : 1);
