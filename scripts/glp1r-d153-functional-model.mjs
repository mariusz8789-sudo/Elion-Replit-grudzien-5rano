#!/usr/bin/env node
/**
 * D-153 — GLP-1R functional-agonism subset, validated against the UNCHANGED
 * frozen gate.
 *
 * Answers one question: does a model fitted to the FUNCTIONAL_AGONISM rows
 * that D-152 established — and only those rows — pass the gate that D-144
 * failed by 0.0118 of MAE on the mixed set?
 *
 * It reuses the repository's own pieces end to end: the D-144 admission rules
 * for the combined set, the SEALED per-assay roles from D-152 (read, never
 * recomputed), the production rdkitAdapter featurization, the production
 * scaffoldSplit, and glp1rQsar.trainAndValidate against the gate loaded from
 * its own file. It introduces no threshold of its own.
 *
 * Rules frozen BEFORE this file existed:
 * campaign/glp1r-d153-functional-model-prereg.json, committed as ee70daa5.
 * Every threshold below is transcribed from that file and must not be tuned
 * against any number this script prints.
 *
 * Run: node scripts/glp1r-d153-functional-model.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { loadGlp1rValidationGate, scaffoldSplit, trainAndValidate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d153-functional-model-prereg.json');
const ROLES_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-assay-roles-d152.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d153-functional-model.sealed.json');

// --- transcribed from the frozen preregistration -----------------------------
const EXPECTED_GATE_FINGERPRINT = 'd2f77a7e6042f0fc';
const EXPECTED_ROWS = 320;
const EXPECTED_COMPOUNDS = 206;
const MAX_TEST_ASSAY_SHARE = 0.50;
const MIN_TEST_ASSAY_COUNT = 3;
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';

const fail = (code, detail) => {
  console.error(`${code}: ${detail}`);
  process.exit(1);
};

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
if (prereg.decisionId !== 'D-153') fail('PREREG_MISMATCH', `expected D-153, got ${prereg.decisionId}`);
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.decisionId} fingerprint ${preregFingerprint}`);

// --- the gate, asserted unchanged before anything else -----------------------
const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) fail('GATE_NOT_LOADABLE', gateResult.code);
const { gate, ruleFingerprint } = gateResult;
if (ruleFingerprint !== EXPECTED_GATE_FINGERPRINT) {
  fail('GATE_FINGERPRINT_MISMATCH', `gate is ${ruleFingerprint}, preregistration froze ${EXPECTED_GATE_FINGERPRINT} — refusing to validate against a moved gate`);
}
console.log(`gate ${ruleFingerprint} UNCHANGED (MIN_TRAIN=${gate.MIN_TRAIN}, MIN_TEST=${gate.MIN_TEST}, MAX_MAE=${gate.MAX_MAE}, MIN_R2=${gate.MIN_R2})`);

const rd = rdkitDetect();
if (!rd?.available) fail('BLOCKED_RDKIT_UNAVAILABLE', `no real RDKit in this runtime (${rd?.reason ?? 'unknown'}) — a model is not fitted without the real featurization`);
console.log(`rdkit ${rd.version}\n`);

// --- A3: assay -> target, read from the transcription ------------------------
const assayTarget = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 6 && c[0].startsWith('CHEMBL')) assayTarget.set(c[0], c[1]);
  }
}

// --- the D-144 combined set, rebuilt by the same admission rules -------------
const pin = loadGlp1rPin();
if (!pin.ok) fail('PIN_NOT_LOADABLE', pin.code);

const structures = new Map(usableSmiles());
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) structures.set(id, smiles);

const rows = pin.rows.map((r) => ({
  moleculeId: r.moleculeId,
  assayId: r.assayId,
  standardType: r.standardType,
  canonicalSmiles: r.canonicalSmiles,
  pActivity: r.pActivity,
  source: 'PIN',
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
console.log(`combined set: ${rows.length} rows (${rows.filter((r) => r.source === 'PIN').length} pin + ${rows.filter((r) => r.source === 'A1xA2').length} A1xA2)`);

// --- the functional arm, taken from D-152's SEALED roles ---------------------
// Roles are READ. This decision cannot move one assay between roles.
const sealedRoles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
if (sealedRoles.decisionId !== 'D-152') fail('ROLES_SOURCE_MISMATCH', `expected D-152 roles, got ${sealedRoles.decisionId}`);
const roleOf = (assayId) => sealedRoles.assays?.[assayId]?.role ?? 'UNKNOWN';

const functional = rows.filter((r) => roleOf(r.assayId) === 'FUNCTIONAL_AGONISM');
const functionalCompounds = new Set(functional.map((r) => r.canonicalSmiles));
console.log(`FUNCTIONAL_AGONISM arm: ${functional.length} rows, ${functionalCompounds.size} compounds`);

if (functional.length !== EXPECTED_ROWS || functionalCompounds.size !== EXPECTED_COMPOUNDS) {
  fail('DATASET_DRIFT', `expected ${EXPECTED_ROWS} rows / ${EXPECTED_COMPOUNDS} compounds, rebuilt ${functional.length} / ${functionalCompounds.size}`);
}

// --- featurization through the production adapter ----------------------------
const batch = fingerprintBatch(functional.map((r) => r.canonicalSmiles));
if (!batch?.ok || batch.results.length !== functional.length) fail('FEATURIZATION_MISALIGNED', 'fingerprintBatch did not come back aligned — failing closed');

const featured = [];
let unfingerprintable = 0;
batch.results.forEach((fp, i) => {
  if (!fp?.ok || !Array.isArray(fp.bits) || fp.scaffold == null) { unfingerprintable += 1; return; }
  const r = functional[i];
  featured.push({
    moleculeId: r.moleculeId,
    assayId: r.assayId,
    standardType: r.standardType,
    canonicalSmiles: r.canonicalSmiles,
    scaffold: fp.scaffold,
    bits: fp.bits,
    y: r.pActivity,
  });
});
console.log(`featurized ${featured.length} rows (${unfingerprintable} unfingerprintable)`);

const trainingDataHash = canonicalHash(
  featured.map((r) => [r.canonicalSmiles, r.standardType, Number(r.y.toFixed(6)), r.assayId]).sort(),
).slice(0, 16);
console.log(`trainingDataHash ${trainingDataHash}`);

// --- the single split, and the four leakage controls, BEFORE any metric ------
const { train, calib, test } = scaffoldSplit(featured);
console.log(`\nsplit: train ${train.length} (min ${gate.MIN_TRAIN}), calib ${calib.length}, test ${test.length} (min ${gate.MIN_TEST})`);

const trainSmiles = new Set(train.map((r) => r.canonicalSmiles));
const trainScaffolds = new Set(train.map((r) => r.scaffold));
const sharedCompounds = [...new Set(test.map((r) => r.canonicalSmiles))].filter((s) => trainSmiles.has(s));
const sharedScaffolds = [...new Set(test.map((r) => r.scaffold))].filter((s) => trainScaffolds.has(s));

const testAssayCounts = new Map();
for (const r of test) testAssayCounts.set(r.assayId, (testAssayCounts.get(r.assayId) ?? 0) + 1);
const largestTestAssayShare = test.length ? Math.max(...testAssayCounts.values()) / test.length : 1;

const leakage = {
  compoundDisjointness: { sharedCompounds: sharedCompounds.length, required: 0, ok: sharedCompounds.length === 0 },
  scaffoldDisjointness: { sharedScaffolds: sharedScaffolds.length, required: 0, ok: sharedScaffolds.length === 0 },
  assayConcentration: {
    largestTestAssayShare: Number(largestTestAssayShare.toFixed(4)),
    threshold: MAX_TEST_ASSAY_SHARE,
    ok: largestTestAssayShare <= MAX_TEST_ASSAY_SHARE,
  },
  testAssayCoverage: { distinctTestAssays: testAssayCounts.size, minimum: MIN_TEST_ASSAY_COUNT, ok: testAssayCounts.size >= MIN_TEST_ASSAY_COUNT },
  assaysSharedBetweenTrainAndTest: [...new Set(test.map((r) => r.assayId))].filter((a) => train.some((t) => t.assayId === a)).length,
};
for (const [name, c] of Object.entries(leakage)) {
  if (typeof c === 'object' && 'ok' in c) console.log(`  ${c.ok ? 'OK  ' : 'FAIL'} ${name}: ${JSON.stringify({ ...c, ok: undefined })}`);
}
const independenceOk = Object.values(leakage).every((c) => typeof c !== 'object' || !('ok' in c) || c.ok);

// --- replicate structure, reported as a limitation, never acted on ----------
const replicateGroups = new Map();
for (const r of featured) {
  const k = `${r.canonicalSmiles}|${r.standardType}`;
  if (!replicateGroups.has(k)) replicateGroups.set(k, []);
  replicateGroups.get(k).push(r.y);
}
const withReplicates = [...replicateGroups.values()].filter((v) => v.length > 1);
const sds = withReplicates.map((v) => {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}).sort((a, b) => a - b);
const medianReplicateSd = sds.length ? Number(sds[Math.floor(sds.length / 2)].toFixed(4)) : null;

// --- the verdict -------------------------------------------------------------
let outcome;
let validation = null;
if (!independenceOk) {
  outcome = 'INSUFFICIENT_INDEPENDENCE';
  console.log('\nverdict: INSUFFICIENT_INDEPENDENCE — a leakage control failed its preregistered threshold, so no metric is reported as a gate verdict');
} else {
  validation = trainAndValidate(featured, gate, ruleFingerprint, trainingDataHash, rd.version);
  outcome = validation.ok ? 'MODEL_GATE_PASS' : 'MODEL_GATE_FAILED';
  console.log(`\nmetrics: MAE ${validation.metrics?.mae ?? 'n/a'}, R2 ${validation.metrics?.r2 ?? 'n/a'}, n ${validation.metrics?.n ?? 0}`);
  console.log(`verdict: ${outcome}`);
  for (const reason of validation.reasons) console.log(`  reason: ${reason}`);
}

const sealed = {
  decisionId: 'D-153',
  preregFingerprint,
  preregFrozenAtCommit: 'ee70daa5',
  gateRuleFingerprint: ruleFingerprint,
  gateUnchanged: ruleFingerprint === EXPECTED_GATE_FINGERPRINT,
  baseCommit: prereg.baseCommit,
  computedAt: new Date().toISOString(),
  engine: { rdkitVersion: rd.version, algorithm: gate.algorithm, lambda: gate.lambda, conformalAlpha: gate.conformalAlpha, splitMethod: gate.splitMethod },
  rolesFrom: { decisionId: sealedRoles.decisionId, preregFingerprint: sealedRoles.preregFingerprint ?? null, note: 'roles READ from the sealed D-152 artefact, never recomputed here' },
  dataset: {
    combinedSetRows: rows.length,
    functionalRows: functional.length,
    functionalCompounds: functionalCompounds.size,
    featurizedRows: featured.length,
    unfingerprintable,
    trainingDataHash,
    distinctScaffolds: new Set(featured.map((r) => r.scaffold)).size,
    distinctAssays: new Set(featured.map((r) => r.assayId)).size,
  },
  split: { nTrain: train.length, nCalib: calib.length, nTest: test.length, trainMeetsMin: train.length >= gate.MIN_TRAIN, testMeetsMin: test.length >= gate.MIN_TEST },
  leakageControls: leakage,
  independenceOk,
  replicates: {
    groupsWithReplicates: withReplicates.length,
    totalGroups: replicateGroups.size,
    medianReplicateSd,
    note: 'Replicates are NOT averaged. Aggregating them would change the data contract the gate was frozen against, so they are reported and left in place.',
  },
  validation: validation ? {
    gateMet: validation.ok,
    reasons: validation.reasons,
    metrics: validation.metrics,
    modelFingerprint: validation.modelFingerprint,
    conformalHalfWidth: validation.halfWidth,
    trainScaffoldCount: validation.trainScaffoldCount,
  } : null,
  outcome,
  frozenPrediction: { primary: prereg.frozenPrediction.primary, intervals: prereg.frozenPrediction.intervals },
  limitations: [
    'This validates a model of ASSAY POTENCY on the cAMP-arm functional agonism rows this repository holds. It is not a measurement of any molecule and not a claim that any molecule works.',
    'The gate names ridge-ecfp4-morgan-r2-512bit. D-144 refuted that representation on this target\'s small molecules, so a failure here is a joint statement about the representation and the data, not about the endpoint split alone.',
    'Train and test may share assays; the split is scaffold-disjoint and compound-disjoint, which is what the gate asks for, and the shared-assay count is recorded above rather than treated as a defect.',
    'Replicate rows are present and not averaged; the median replicate SD above is the floor any model on this data has to beat.',
    'Sixteen of the assays in the combined set still have no description, so their rows sit in UNKNOWN and are absent from this arm. That remains BLOCKED_EXTERNAL_DATA_ACCESS on www.ebi.ac.uk.',
  ],
  boundary: 'No gate was edited, no sealed artefact was modified, no role was reclassified, no candidate was ranked and no docking target was changed.',
};
sealed.artifactHash = canonicalHash(sealed).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`\nsealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash})`);
