#!/usr/bin/env node
/**
 * D-079 — GLP-1R QSAR V2 END TO END on the real pinned human dataset.
 *
 * Tests the D-077a hypothesis: is the FEATURISATION, not the sample size, what
 * keeps MAE above 1.0? Three representations are fitted with the dense ridge,
 * ONE is chosen on calibration error alone, and that single chosen model is
 * scored once against the held-out test split and the frozen D-077 gate.
 *
 * The gate is loaded from its own file and its thresholds are never mirrored
 * here. Two honest outcomes: VALIDATED or BLOCKED with exact reasons.
 */

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { loadGlp1rValidationGate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import {
  scaffoldSplit, metrics, descriptorVector, fitStandardization, applyStandardization,
  denseRidge, densePredict, representationVector, selectRepresentation, conformalHalfWidth,
  applyFrozenGate, modelFingerprintV2, REPRESENTATIONS, FROZEN_PEPTIDE_AMIDE_MIN,
} from '../packages/backend/src/campaign/glp1rQsarV2.mjs';
import { fingerprintBatch, descriptorsBatch, detect } from '../packages/backend/src/compute/rdkitAdapter.mjs';

console.log('=== GLP-1R QSAR V2 E2E (D-079) ===\n');

const rd = detect();
if (!rd.available) { console.log('OUTCOME: BLOCKED — RDKit unavailable'); process.exit(1); }
console.log(`engine            : RDKit ${rd.version}`);

const pin = loadGlp1rPin();
if (!pin.ok) { console.log(`OUTCOME: BLOCKED — ${pin.code}: ${pin.reason}`); process.exit(0); }
console.log(`pin               : ${pin.n} rows, sha256 ${pin.contentSha256.slice(0, 16)}…`);

const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) { console.log(`OUTCOME: BLOCKED — ${gateResult.code}`); process.exit(0); }
const gate = gateResult.gate;
console.log(`frozen gate       : ${gateResult.ruleFingerprint} (MIN_TRAIN=${gate.MIN_TRAIN} MIN_TEST=${gate.MIN_TEST} MAX_MAE=${gate.MAX_MAE} MIN_R2=${gate.MIN_R2})`);

// --- features: both batched, one python process each ------------------------
const smiles = pin.rows.map((r) => r.canonicalSmiles);
const t0 = Date.now();
const fps = fingerprintBatch(smiles);
const descs = descriptorsBatch(smiles);
const featureMs = Date.now() - t0;
if (!fps.ok || !descs.ok) { console.log('OUTCOME: BLOCKED — feature extraction failed'); process.exit(0); }

const rows = [];
let dropped = 0;
for (let i = 0; i < pin.rows.length; i += 1) {
  const fp = fps.results[i];
  const de = descs.results[i];
  if (!fp?.ok || !de?.ok) { dropped += 1; continue; }
  const dv = descriptorVector(pin.rows[i].canonicalSmiles, de.data);
  if (!dv.ok) { dropped += 1; continue; }
  rows.push({
    canonicalSmiles: pin.rows[i].canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits,
    raw: dv.vector, peptideLike: dv.peptideLike, amideBonds: dv.amideBonds, y: pin.rows[i].pActivity,
  });
}
const peptides = rows.filter((r) => r.peptideLike).length;
console.log(`features          : ${rows.length} usable, ${dropped} dropped, ${featureMs} ms (batched)`);
console.log(`composition       : ${peptides} peptide-like (>=${FROZEN_PEPTIDE_AMIDE_MIN} amide bonds), ${rows.length - peptides} small-molecule`);

// --- split: the SAME scaffold-disjoint split V1 used -------------------------
const { train, calib, test } = scaffoldSplit(rows);
console.log(`split             : nTrain=${train.length} nCalib=${calib.length} nTest=${test.length}\n`);

// --- standardization fitted on TRAIN ONLY ------------------------------------
const std = fitStandardization(train.map((r) => r.raw));
const stdOf = new Map(rows.map((r) => [r.canonicalSmiles, applyStandardization(r.raw, std)]));
if (std.dropped.length) console.log(`zero-variance cols dropped: ${std.dropped.length}`);

const LAMBDA = gate.lambda ?? 1.0;
const vecOf = (rep, r) => representationVector(rep, r.bits, stdOf.get(r.canonicalSmiles));

// --- fit each representation, score on CALIBRATION only -----------------------
const candidates = [];
for (const rep of ['A', 'B', 'C']) {
  const w = denseRidge(train.map((r) => ({ x: vecOf(rep, r), y: r.y })), LAMBDA);
  const calibResiduals = calib.map((r) => Math.abs(r.y - densePredict(w, vecOf(rep, r))));
  const calibMAE = calibResiduals.reduce((a, b) => a + b, 0) / Math.max(1, calibResiduals.length);
  candidates.push({ id: rep, calibMAE, _w: w, _calibResiduals: calibResiduals, width: vecOf(rep, train[0]).length });
}
console.log('candidates (calibration error only — the test split has NOT been touched):');
for (const c of candidates) console.log(`  ${c.id}  width=${String(c.width).padStart(4)}  calibMAE=${c.calibMAE.toFixed(4)}   ${REPRESENTATIONS[c.id].slice(0, 62)}`);
console.log(`  D  ${REPRESENTATIONS.D}`);

const sel = selectRepresentation(candidates.map(({ id, calibMAE }) => ({ id, calibMAE })));
if (!sel.ok) { console.log(`\nOUTCOME: BLOCKED — ${sel.code}`); process.exit(0); }
const chosen = candidates.find((c) => c.id === sel.selected.id);
console.log(`\nselected          : ${chosen.id} by ${sel.rule.criterion} (${sel.rule.version})`);

// --- the test split is now scored ONCE, for the chosen model only ------------
const testPreds = test.map((r) => densePredict(chosen._w, vecOf(chosen.id, r)));
const m = metrics(testPreds, test.map((r) => r.y));
const conf = conformalHalfWidth(chosen._calibResiduals, 0.1);

const pep = test.map((r, i) => ({ r, p: testPreds[i] })).filter((o) => o.r.peptideLike);
const small = test.map((r, i) => ({ r, p: testPreds[i] })).filter((o) => !o.r.peptideLike);
const pepM = pep.length ? metrics(pep.map((o) => o.p), pep.map((o) => o.r.y)) : null;
const smallM = small.length ? metrics(small.map((o) => o.p), small.map((o) => o.r.y)) : null;

console.log('\n--- held-out test (scored once, after selection) ---');
console.log(`MAE / RMSE / R2   : ${m.mae.toFixed(4)} / ${m.rmse.toFixed(4)} / ${m.r2.toFixed(4)}   (n=${m.n})`);
if (pepM) console.log(`  peptide subset  : MAE ${pepM.mae.toFixed(4)}  R2 ${pepM.r2.toFixed(4)}  (n=${pepM.n})`);
if (smallM) console.log(`  small-molecule  : MAE ${smallM.mae.toFixed(4)}  R2 ${smallM.r2.toFixed(4)}  (n=${smallM.n})`);
console.log(`conformal 90%     : ${conf.ok ? `±${conf.halfWidth.toFixed(4)} pActivity (nCalib=${conf.nCalib})` : conf.code}`);

const decision = applyFrozenGate(gate, {
  nTrain: train.length, nTest: test.length, mae: m.mae, r2: m.r2,
  halfWidth: conf.ok ? conf.halfWidth : null,
});

const fingerprint = modelFingerprintV2({
  representation: chosen.id, lambda: LAMBDA, standardization: { mean: std.mean, sd: std.sd, dropped: std.dropped },
  splitPolicy: 'scaffold-hash-mod10', trainingDataHash: pin.contentSha256,
  gateFingerprint: gateResult.ruleFingerprint, rdkitVersion: rd.version, schema: chosen.id,
});

console.log('\n--- V1 vs V2 on the same pin, same split policy, same frozen gate ---');
console.log('V1  morgan-512 + sparse binary ridge : MAE 1.1726  R2 0.4820  -> BLOCKED (D-077a, measured)');
console.log(`V2  ${chosen.id.padEnd(1)} + dense ridge                  : MAE ${m.mae.toFixed(4)}  R2 ${m.r2.toFixed(4)}  -> ${decision.status}`);

console.log(`\nmodelFingerprint  : ${fingerprint}`);
console.log(`trainingDataHash  : ${pin.contentSha256}`);
console.log(`\nOUTCOME: GLP-1R efficacy axis ${decision.status}`);
if (decision.status === 'BLOCKED') {
  for (const r of decision.reasons) console.log(`  reason: ${r}`);
  console.log('\nThresholds were NOT relaxed. This is the correct result for this dataset and representation.');
} else {
  console.log('  every frozen threshold met; the axis is MODEL_ESTIMATE and still cannot promote a WinnerRecord (D-057).');
}
process.exit(0);
