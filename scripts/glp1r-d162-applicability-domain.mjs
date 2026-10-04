#!/usr/bin/env node
/**
 * D-162 — GLP-1R functional-agonism model: chemical-series extrapolation probe.
 *
 * Answers one question: does the model D-153 sealed still reach the frozen
 * gate's own accuracy thresholds when the held-out set is chemically DISTANT
 * from the training set by construction?
 *
 * Rules frozen BEFORE this file existed:
 * packages/backend/src/campaign/glp1r-d162-applicability-domain-prereg.json,
 * committed alone as 9e5ce31c. Every threshold below is transcribed from that
 * file and must not be tuned against any number this script prints.
 *
 * THIS IS NOT A GATE VERDICT. The frozen gate names splitMethod
 * 'scaffold-hash-mod10'; this probe uses a different split on purpose, so its
 * outcome is never called MODEL_GATE_PASS or MODEL_GATE_FAILED. Only the
 * algorithm, lambda, conformalAlpha and the four numeric thresholds are read
 * from the gate file, unchanged, and the gate fingerprint is asserted first.
 *
 * Run: node scripts/glp1r-d162-applicability-domain.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import {
  loadGlp1rValidationGate, scaffoldBucket, trainRidge, tanimotoIndices, metrics,
} from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d162-applicability-domain-prereg.json');
const ROLES_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-assay-roles-d152.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d162-applicability-domain.sealed.json');

// --- transcribed from the frozen preregistration -----------------------------
const EXPECTED_GATE_FINGERPRINT = 'd2f77a7e6042f0fc';
const EXPECTED_ROWS = 320;
const EXPECTED_COMPOUNDS = 206;
const DISTANCE_CEILING = 0.6;
const CLUSTER_CUTOFF = 0.6;
const MAX_TEST_ASSAY_SHARE = 0.50;
const MIN_TEST_ASSAY_COUNT = 3;
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';
const BIAS_INDEX = 512;

const abort = (code, detail) => {
  console.error(`PROBE_ABORTED ${code}: ${detail}`);
  process.exit(1);
};

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
if (prereg.decisionId !== 'D-162') abort('PREREG_MISMATCH', `expected D-162, got ${prereg.decisionId}`);
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.decisionId} fingerprint ${preregFingerprint}`);

// --- the gate, asserted unchanged before anything else -----------------------
const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) abort('GATE_NOT_LOADABLE', gateResult.code);
const { gate, ruleFingerprint } = gateResult;
if (ruleFingerprint !== EXPECTED_GATE_FINGERPRINT) {
  abort('GATE_FINGERPRINT_MISMATCH', `gate is ${ruleFingerprint}, preregistration froze ${EXPECTED_GATE_FINGERPRINT}`);
}
console.log(`gate ${ruleFingerprint} UNCHANGED (MIN_TRAIN=${gate.MIN_TRAIN}, MIN_TEST=${gate.MIN_TEST}, MAX_MAE=${gate.MAX_MAE}, MIN_R2=${gate.MIN_R2})`);

const rd = rdkitDetect();
if (!rd?.available) abort('BLOCKED_RDKIT_UNAVAILABLE', rd?.reason ?? 'unknown');
console.log(`rdkit ${rd.version}\n`);

// --- A3: assay -> target -----------------------------------------------------
const assayTarget = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 6 && c[0].startsWith('CHEMBL')) assayTarget.set(c[0], c[1]);
  }
}

// --- the D-144 combined set, rebuilt by D-153's own admission rules ----------
const pin = loadGlp1rPin();
if (!pin.ok) abort('PIN_NOT_LOADABLE', pin.code);

const structures = new Map(usableSmiles());
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) structures.set(id, smiles);

const rows = pin.rows.map((r) => ({
  moleculeId: r.moleculeId, assayId: r.assayId, standardType: r.standardType,
  canonicalSmiles: r.canonicalSmiles, pActivity: r.pActivity, source: 'PIN',
}));
const pinKeys = new Set(rows.map((r) => `${r.moleculeId}|${r.assayId}|${r.standardType}`));

for (const f of fs.readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('|');
    const [, moleculeId, assayId, standardType, relation, value, units, pchembl] = c;
    if (c.length < 13 || relation !== '=' || units !== 'nM' || !Number.isFinite(Number(value)) || Number(value) <= 0) continue;
    if (assayTarget.get(assayId) !== TARGET) continue;
    const smiles = structures.get(moleculeId);
    if (!smiles) continue;
    const pActivity = 9 - Math.log10(Number(value));
    if (!(Math.abs(pActivity - Number(pchembl)) <= PCHEMBL_TOLERANCE)) continue;
    if (pinKeys.has(`${moleculeId}|${assayId}|${standardType}`)) continue;
    rows.push({ moleculeId, assayId, standardType, canonicalSmiles: smiles, pActivity, source: 'A1xA2' });
  }
}
console.log(`combined set: ${rows.length} rows`);

// --- the functional arm, from D-152's SEALED roles ---------------------------
const sealedRoles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
if (sealedRoles.decisionId !== 'D-152') abort('ROLES_SOURCE_MISMATCH', `expected D-152, got ${sealedRoles.decisionId}`);
const roleOf = (assayId) => sealedRoles.assays?.[assayId]?.role ?? 'UNKNOWN';

const functional = rows.filter((r) => roleOf(r.assayId) === 'FUNCTIONAL_AGONISM');
const functionalCompounds = new Set(functional.map((r) => r.canonicalSmiles));
console.log(`FUNCTIONAL_AGONISM arm: ${functional.length} rows, ${functionalCompounds.size} compounds`);
if (functional.length !== EXPECTED_ROWS || functionalCompounds.size !== EXPECTED_COMPOUNDS) {
  abort('DATASET_DRIFT', `expected ${EXPECTED_ROWS}/${EXPECTED_COMPOUNDS}, rebuilt ${functional.length}/${functionalCompounds.size}`);
}

// --- featurization through the production adapter ----------------------------
const batch = fingerprintBatch(functional.map((r) => r.canonicalSmiles));
if (!batch?.ok || batch.results.length !== functional.length) abort('FEATURIZATION_MISALIGNED', 'fingerprintBatch did not come back aligned');

const nonzero = (bits) => {
  const out = [];
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) out.push(i);
  return out;
};

const featured = [];
let unfingerprintable = 0;
batch.results.forEach((fp, i) => {
  if (!fp?.ok || !Array.isArray(fp.bits) || fp.scaffold == null) { unfingerprintable += 1; return; }
  const r = functional[i];
  featured.push({
    moleculeId: r.moleculeId, assayId: r.assayId, standardType: r.standardType,
    canonicalSmiles: r.canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits,
    idx: nonzero(fp.bits), y: r.pActivity,
  });
});
console.log(`featurized ${featured.length} rows (${unfingerprintable} unfingerprintable)`);

const trainingDataHash = canonicalHash(
  featured.map((r) => [r.canonicalSmiles, r.standardType, Number(r.y.toFixed(6)), r.assayId]).sort(),
).slice(0, 16);
console.log(`datasetHash ${trainingDataHash}`);

// --- the frozen ordering, used for every derived order below -----------------
const ordered = [...featured].sort((a, b) => (
  a.canonicalSmiles.localeCompare(b.canonicalSmiles)
  || a.assayId.localeCompare(b.assayId)
  || a.standardType.localeCompare(b.standardType)
));

// --- step 1: leader clustering over distinct compounds -----------------------
const compoundIdx = new Map();
for (const r of ordered) if (!compoundIdx.has(r.canonicalSmiles)) compoundIdx.set(r.canonicalSmiles, r.idx);
const compounds = [...compoundIdx.keys()];

const leaders = [];
const clusterOf = new Map();
for (const smiles of compounds) {
  const idx = compoundIdx.get(smiles);
  let joined = null;
  for (const leader of leaders) {
    if (tanimotoIndices(idx, compoundIdx.get(leader)) >= CLUSTER_CUTOFF) { joined = leader; break; }
  }
  if (joined === null) { leaders.push(smiles); joined = smiles; }
  clusterOf.set(smiles, joined);
}
console.log(`\nleader clustering at ${CLUSTER_CUTOFF}: ${leaders.length} clusters over ${compounds.length} compounds`);

// --- step 2: test clusters, largest first ------------------------------------
const rowsByCluster = new Map(leaders.map((l) => [l, []]));
for (const r of ordered) rowsByCluster.get(clusterOf.get(r.canonicalSmiles)).push(r);

const clusterOrder = [...leaders].sort((a, b) => (
  rowsByCluster.get(b).length - rowsByCluster.get(a).length || a.localeCompare(b)
));

const testClusters = [];
let testRowCount = 0;
for (const leader of clusterOrder) {
  if (testRowCount >= gate.MIN_TEST) break;
  testClusters.push(leader);
  testRowCount += rowsByCluster.get(leader).length;
}
const testClusterSet = new Set(testClusters);
const test = ordered.filter((r) => testClusterSet.has(clusterOf.get(r.canonicalSmiles)));
console.log(`test clusters: ${testClusters.length} cluster(s), ${test.length} rows, ${new Set(test.map((r) => r.canonicalSmiles)).size} compounds`);

// --- step 3: prune the remainder for distance --------------------------------
const testIdx = [...new Set(test.map((r) => r.canonicalSmiles))].map((s) => compoundIdx.get(s));
const nearestToTest = (idx) => testIdx.reduce((m, t) => Math.max(m, tanimotoIndices(idx, t)), 0);

const remainder = ordered.filter((r) => !testClusterSet.has(clusterOf.get(r.canonicalSmiles)));
const kept = [];
let droppedForDistance = 0;
for (const r of remainder) {
  if (nearestToTest(r.idx) >= DISTANCE_CEILING) { droppedForDistance += 1; continue; }
  kept.push(r);
}
console.log(`pruned for distance: ${droppedForDistance} of ${remainder.length} non-test rows dropped (>= ${DISTANCE_CEILING} to a test row)`);

// --- step 4: calibration by the production bucket rule -----------------------
const calib = kept.filter((r) => { const b = scaffoldBucket(r.scaffold); return b === 2 || b === 3; });
const train = kept.filter((r) => { const b = scaffoldBucket(r.scaffold); return b !== 2 && b !== 3; });
console.log(`split: train ${train.length} (min ${gate.MIN_TRAIN}), calib ${calib.length}, test ${test.length} (min ${gate.MIN_TEST})`);

// --- controls, BEFORE any metric is read -------------------------------------
const trainSmiles = new Set(train.map((r) => r.canonicalSmiles));
const trainScaffolds = new Set(train.map((r) => r.scaffold));
const sharedCompounds = [...new Set(test.map((r) => r.canonicalSmiles))].filter((s) => trainSmiles.has(s));
const sharedScaffolds = [...new Set(test.map((r) => r.scaffold))].filter((s) => trainScaffolds.has(s));

const trainCompoundIdx = [...trainSmiles].map((s) => compoundIdx.get(s));
const nnPerTestRow = test.map((r) => trainCompoundIdx.reduce((m, t) => Math.max(m, tanimotoIndices(r.idx, t)), 0));
const maxNn = nnPerTestRow.length ? Math.max(...nnPerTestRow) : 0;
const sortedNn = [...nnPerTestRow].sort((a, b) => a - b);
const medianNn = sortedNn.length ? sortedNn[Math.floor(sortedNn.length / 2)] : null;

const testAssayCounts = new Map();
for (const r of test) testAssayCounts.set(r.assayId, (testAssayCounts.get(r.assayId) ?? 0) + 1);
const largestTestAssayShare = test.length ? Math.max(...testAssayCounts.values()) / test.length : 1;

const controls = {
  compoundDisjointness: { sharedCompounds: sharedCompounds.length, required: 0, ok: sharedCompounds.length === 0 },
  scaffoldDisjointness: { sharedScaffolds: sharedScaffolds.length, required: 0, ok: sharedScaffolds.length === 0 },
  distance: {
    maxNearestNeighbourTanimotoTestToTrain: Number(maxNn.toFixed(4)),
    medianNearestNeighbourTanimotoTestToTrain: medianNn === null ? null : Number(medianNn.toFixed(4)),
    ceiling: DISTANCE_CEILING,
    ok: maxNn < DISTANCE_CEILING,
  },
  testAssayCoverage: { distinctTestAssays: testAssayCounts.size, minimum: MIN_TEST_ASSAY_COUNT, ok: testAssayCounts.size >= MIN_TEST_ASSAY_COUNT },
  assayConcentration: { largestTestAssayShare: Number(largestTestAssayShare.toFixed(4)), threshold: MAX_TEST_ASSAY_SHARE, ok: largestTestAssayShare <= MAX_TEST_ASSAY_SHARE },
};
console.log('');
for (const [name, c] of Object.entries(controls)) {
  console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify({ ...c, ok: undefined })}`);
}

const sizesMet = train.length >= gate.MIN_TRAIN && test.length >= gate.MIN_TEST;
const controlsOk = Object.values(controls).every((c) => c.ok);

// --- the verdict, by the preregistered decision table ------------------------
const dot = (w, bits) => {
  let sum = w[BIAS_INDEX];
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) sum += w[i];
  return sum;
};

let outcome;
let measurement = null;
let negativeControl = null;

if (!sizesMet) {
  outcome = 'INSUFFICIENT_DATA_FOR_DISTANT_SPLIT';
} else if (!controls.distance.ok) {
  outcome = 'PROBE_INCONCLUSIVE_SPLIT_NOT_DISTANT';
} else if (!controlsOk) {
  outcome = 'PROBE_INCONCLUSIVE_SPLIT_NOT_DISTANT';
} else {
  const weights = trainRidge(train, gate.lambda);
  const m = metrics(test.map((r) => dot(weights, r.bits)), test.map((r) => r.y));
  const residuals = calib.map((r) => Math.abs(r.y - dot(weights, r.bits))).sort((a, b) => a - b);
  let halfWidth = null;
  if (residuals.length > 0) {
    const rank = Math.min(residuals.length, Math.ceil((residuals.length + 1) * (1 - gate.conformalAlpha)));
    halfWidth = residuals[Math.max(0, rank - 1)];
  }
  const reasons = [];
  if (m.mae > gate.MAX_MAE) reasons.push(`MAE=${m.mae.toFixed(4)} > MAX_MAE=${gate.MAX_MAE}`);
  if (m.r2 < gate.MIN_R2) reasons.push(`R2=${m.r2.toFixed(4)} < MIN_R2=${gate.MIN_R2}`);
  measurement = {
    mae: Number(m.mae.toFixed(4)), rmse: Number(m.rmse.toFixed(4)), r2: Number(m.r2.toFixed(4)), n: m.n,
    conformalHalfWidth: Number.isFinite(halfWidth) ? Number(halfWidth.toFixed(4)) : null,
    thresholdsNotMet: reasons,
  };
  outcome = reasons.length === 0 ? 'EXTRAPOLATION_SUPPORTED' : 'EXTRAPOLATION_NOT_SUPPORTED';
}

// The negative control is reported whatever the outcome, whenever a test set exists.
if (test.length > 0 && train.length > 0) {
  const trainMean = train.reduce((a, r) => a + r.y, 0) / train.length;
  const b = metrics(test.map(() => trainMean), test.map((r) => r.y));
  negativeControl = { kind: 'TRAIN_MEAN_BASELINE', mae: Number(b.mae.toFixed(4)), r2: Number(b.r2.toFixed(4)), n: b.n };
}

console.log(`\nverdict: ${outcome}`);
if (measurement) {
  console.log(`  MAE ${measurement.mae}, RMSE ${measurement.rmse}, R2 ${measurement.r2}, n ${measurement.n}`);
  for (const r of measurement.thresholdsNotMet) console.log(`  reason: ${r}`);
}
if (negativeControl) console.log(`  negative control (train mean): MAE ${negativeControl.mae}, R2 ${negativeControl.r2}`);

const sealed = {
  decisionId: 'D-162',
  preregFingerprint,
  preregFrozenAtCommit: '9e5ce31c',
  gateRuleFingerprint: ruleFingerprint,
  gateUnchanged: ruleFingerprint === EXPECTED_GATE_FINGERPRINT,
  gateVerdict: null,
  isGateVerdict: false,
  notAGateVerdictBecause: `The frozen gate names splitMethod '${gate.splitMethod}'. This probe uses the preregistered distant-cluster split instead, so its outcome is NOT a gate verdict and must never be quoted as MODEL_GATE_PASS or MODEL_GATE_FAILED. D-153 stands exactly as sealed.`,
  baseCommit: prereg.baseCommit,
  computedAt: new Date().toISOString(),
  engine: {
    rdkitVersion: rd.version, algorithm: gate.algorithm, lambda: gate.lambda,
    conformalAlpha: gate.conformalAlpha, splitMethod: 'D-162 distant leader-cluster holdout (preregistered)',
  },
  rolesFrom: { decisionId: sealedRoles.decisionId, note: 'roles READ from the sealed D-152 artefact, never recomputed here' },
  dataset: {
    combinedSetRows: rows.length,
    functionalRows: functional.length,
    functionalCompounds: functionalCompounds.size,
    featurizedRows: featured.length,
    unfingerprintable,
    datasetHash: trainingDataHash,
    distinctScaffolds: new Set(featured.map((r) => r.scaffold)).size,
    distinctAssays: new Set(featured.map((r) => r.assayId)).size,
  },
  clustering: {
    cutoff: CLUSTER_CUTOFF,
    clusters: leaders.length,
    compounds: compounds.length,
    largestClusterRows: rowsByCluster.get(clusterOrder[0]).length,
    clusterRowSizes: clusterOrder.map((l) => rowsByCluster.get(l).length),
  },
  split: {
    testClusters: testClusters.length,
    nTrain: train.length, nCalib: calib.length, nTest: test.length,
    trainMeetsMin: train.length >= gate.MIN_TRAIN,
    testMeetsMin: test.length >= gate.MIN_TEST,
    droppedForDistance,
    nonTestRowsBeforePruning: remainder.length,
  },
  controls,
  controlsOk,
  measurement,
  negativeControl,
  outcome,
  frozenPrediction: prereg.frozenPrediction,
  predictionCorrect: outcome === prereg.frozenPrediction.primary,
  predictionAssessment: (() => {
    const p = prereg.frozenPrediction;
    const inRange = (v, [lo, hi]) => v !== null && v >= lo && v <= hi;
    return {
      primaryOutcomePredicted: p.primary,
      primaryOutcomeCorrect: outcome === p.primary,
      secondaryOutcomePredicted: p.secondary ?? null,
      secondaryOutcomeCorrect: outcome === (p.secondary ?? null),
      maeInsidePredictedInterval: measurement ? inRange(measurement.mae, p.intervals.ifSizesAreMet_MAE) : null,
      r2InsidePredictedInterval: measurement ? inRange(measurement.r2, p.intervals.ifSizesAreMet_R2) : null,
      surpriseConditionMet: Boolean(measurement && measurement.thresholdsNotMet.length === 0 && controls.distance.ok),
    };
  })(),
  limitations: [
    'This probe speaks about ONE representation — the ridge over 512-bit Morgan r=2 fingerprints the frozen gate names. D-144 already refuted that representation on this target\'s small molecules, so a failure here is a joint statement about the representation and the data, not about the endpoint or the receptor.',
    'It is not a measurement of any molecule and not a claim that any molecule works.',
    'Replicate rows are present and are NOT averaged, exactly as in D-153.',
    'Sixteen assays in the combined set had no description at D-152 time; D-157 classified them as a separate audit layer and did NOT adopt the enlarged arm, so those rows are absent here too.',
    'A distant split produced by pruning has a smaller, differently composed training set than the production split. That is the point of the probe and also a limit on it: a drop in accuracy mixes the distance effect with the smaller-training-set effect, and this run does not separate them.',
  ],
  boundary: 'No gate was edited, no sealed artefact was modified, no role was reclassified, no candidate was nominated or ranked, and no docking target was changed.',
};
sealed.artifactHash = canonicalHash(sealed).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`\nsealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash})`);
console.log(`frozen prediction was ${prereg.frozenPrediction.primary} — ${sealed.predictionCorrect ? 'CORRECT' : 'WRONG, recorded as wrong'}`);
