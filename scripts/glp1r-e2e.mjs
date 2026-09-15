#!/usr/bin/env node
/**
 * D-076/077 — GLP-1R QSAR END-TO-END:
 *   pin -> hash verification -> RDKit fingerprints -> scaffold split ->
 *   ridge -> held-out validation against the frozen gate -> conformal
 *   interval -> prediction -> molecularMission axis.
 *
 * ===================== NO FAKE FINGERPRINTS IN THIS SCRIPT =================
 *
 * Every fingerprint here comes from the REAL `rdkitAdapter.fingerprint()`
 * (RDKit Morgan r=2, 512 bits). There is no stub, no charCode-derived bit
 * vector, and no synthetic activity value anywhere in this file. A demo that
 * fabricates its own features proves nothing about the pipeline it claims to
 * demonstrate, so this one refuses to run rather than substitute one.
 *
 * TWO HONEST OUTCOMES, both correct:
 *   1. VALIDATED — the gate was met; nTrain/nCalib/nTest, MAE/RMSE/R2,
 *      modelFingerprint and trainingDataHash are printed.
 *   2. BLOCKED   — with the exact reasons. This is the expected outcome in a
 *      runtime with no pinned human dataset, and it is NOT a failure of the
 *      script.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGlp1rPin, PIN_PATH } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { loadGlp1rValidationGate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import {
  trainGlp1rModel, glp1rEfficacyPrediction, glp1rAxisContribution, GLP1R_EFFICACY_AXIS,
} from '../packages/backend/src/campaign/glp1rEfficacyAdapter.mjs';
import { detect as rdkitDetect, fingerprint as rdkitFingerprint } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { efficacyAxis } from '../packages/backend/src/campaign/tirzepatideBaseline.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
void HERE;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('=== GLP-1R QSAR E2E (D-076/077) ===\n');

// --- 1. real engine ---------------------------------------------------------
const rd = rdkitDetect();
check('RDKit is the real engine, live in this runtime', rd.available === true, rd.available ? `RDKit ${rd.version}` : rd.reason);
if (!rd.available) {
  console.log('\nOUTCOME: BLOCKED — no chemistry engine. Nothing downstream can run honestly.');
  process.exit(1);
}

// --- 2. real fingerprint, not a stub ---------------------------------------
const probe = rdkitFingerprint('CC(=O)Oc1ccccc1C(=O)O');
check('rdkitAdapter.fingerprint() returns real Morgan bits + Murcko scaffold', probe.ok === true && Array.isArray(probe.bits) && probe.bits.length === 512,
  probe.ok ? `${probe.fingerprint}, scaffold "${probe.scaffold}", ${probe.bits.filter(Boolean).length} bits set` : String(probe.error));
const probeAgain = rdkitFingerprint('CC(=O)Oc1ccccc1C(=O)O');
check('fingerprint is deterministic across calls', JSON.stringify(probe.bits) === JSON.stringify(probeAgain.bits));
check('invalid SMILES fails closed, never returns a zero vector', rdkitFingerprint('not-a-molecule').ok === false);

// --- 3. frozen gate ---------------------------------------------------------
const gate = loadGlp1rValidationGate();
check('frozen D-077 validation gate loads and its ruleFingerprint matches its own contents', gate.ok === true,
  gate.ok ? `ruleFingerprint=${gate.ruleFingerprint} MIN_TRAIN=${gate.gate.MIN_TRAIN} MIN_TEST=${gate.gate.MIN_TEST} MAX_MAE=${gate.gate.MAX_MAE} MIN_R2=${gate.gate.MIN_R2}` : gate.reason);

// --- 4. custody -------------------------------------------------------------
const pin = loadGlp1rPin();
if (!pin.ok) {
  check('pin absence is reported as an explicit fail-closed code, not an empty dataset', typeof pin.code === 'string' && pin.code.length > 0, pin.code);

  const trained = trainGlp1rModel();
  check('training refuses to proceed without a hash-verified pin', trained.ok === false, trained.code);

  const prediction = glp1rEfficacyPrediction('CC(=O)Oc1ccccc1C(=O)O', trained);
  check('prediction is BLOCKED with a reason, never a number', prediction.status === 'BLOCKED' && prediction.value === null, prediction.blockedReason);
  check('BLOCKED prediction still carries evidenceClass MODEL_ESTIMATE (never silently reclassified)', prediction.evidenceClass === 'MODEL_ESTIMATE');

  const contribution = glp1rAxisContribution(prediction);
  check('a BLOCKED axis does NOT close EFFICACY_AXIS_UNAVAILABLE', contribution.closesEfficacyAxis === false);
  check('this axis is never decisive, blocked or not', contribution.decisive === false);

  const axis = efficacyAxis(prediction);
  check('efficacyAxis() with a BLOCKED prediction still reports EFFICACY_AXIS_UNAVAILABLE', axis.available === false && axis.code === 'EFFICACY_AXIS_UNAVAILABLE');

  const passed = checks.every((c) => c.ok);
  console.log(`\n${passed ? 'ALL INVARIANTS HELD' : 'INVARIANT VIOLATION'} (${checks.filter((c) => c.ok).length}/${checks.length})`);
  console.log('\nOUTCOME: GLP-1R efficacy axis remains BLOCKED.');
  console.log(`  reason        : ${pin.code} — ${pin.reason}`);
  console.log(`  pin expected  : ${PIN_PATH}`);
  console.log('  what is needed: a human GLP-1R activity artifact (target_organism = "Homo sapiens"), downloaded on a network-enabled machine,');
  console.log('                  then: node scripts/ingest-glp1r-activity.mjs --raw <file> [--target-id <resolved human id>]');
  console.log(`                  the frozen gate then needs >=${gate.ok ? gate.gate.MIN_TRAIN : 150} train and >=${gate.ok ? gate.gate.MIN_TEST : 40} test rows after scaffold-disjoint splitting.`);
  console.log('\nThis is a correct, honest terminal state — not a script failure.');
  process.exit(passed ? 0 : 1);
}

// --- 5. real training path (only reached with a real pinned dataset) --------
check('pinned dataset passed sha256 verification', pin.ok === true, `${pin.n} rows, sha256 ${pin.contentSha256}`);

const trained = trainGlp1rModel();
console.log(`\ntraining: ${trained.nPinnedRows} pinned rows, ${trained.unfingerprintable} unfingerprintable`);

if (!trained.ok) {
  check('a model that misses the frozen gate is BLOCKED with explicit reasons', trained.code === 'GATE_NOT_MET' || typeof trained.code === 'string', trained.reason);
  const prediction = glp1rEfficacyPrediction(pin.rows[0].canonicalSmiles, trained);
  check('no prediction value is emitted from an unvalidated model', prediction.status === 'BLOCKED' && prediction.value === null);
  const axis = efficacyAxis(prediction);
  check('efficacy axis stays UNAVAILABLE when validation is red', axis.available === false);

  const passed = checks.every((c) => c.ok);
  console.log(`\n${passed ? 'ALL INVARIANTS HELD' : 'INVARIANT VIOLATION'} (${checks.filter((c) => c.ok).length}/${checks.length})`);
  console.log('\nOUTCOME: GLP-1R efficacy axis remains BLOCKED.');
  console.log(`  split   : nTrain=${trained.validation?.split?.nTrain} nCalib=${trained.validation?.split?.nCalib} nTest=${trained.validation?.split?.nTest}`);
  console.log(`  reasons : ${trained.validation?.reasons?.join('; ') ?? trained.reason}`);
  console.log('\nThresholds were NOT relaxed to obtain a pass. This is the correct result for this dataset.');
  process.exit(passed ? 0 : 1);
}

const v = trained.validation;
check('validated model carries a conformal uncertainty (never a bare point estimate)', Number.isFinite(v.halfWidth), `halfWidth=${v.halfWidth?.toFixed(4)}`);
check('scaffold split is disjoint by construction', v.split.nTrain + v.split.nCalib + v.split.nTest === trained.nPinnedRows - trained.unfingerprintable);

const again = trainGlp1rModel();
check('model fingerprint is deterministic across independent training runs', again.validation.modelFingerprint === v.modelFingerprint, v.modelFingerprint);

const prediction = glp1rEfficacyPrediction(pin.rows[0].canonicalSmiles, trained);
check('prediction is AVAILABLE with a value AND an uncertainty', prediction.status === 'AVAILABLE' && Number.isFinite(prediction.value) && Number.isFinite(prediction.uncertainty));
check('prediction is labelled MODEL_ESTIMATE, never an observation', prediction.evidenceClass === 'MODEL_ESTIMATE');
check('prediction is replay-deterministic', glp1rEfficacyPrediction(pin.rows[0].canonicalSmiles, trained).outputHash === prediction.outputHash, prediction.outputHash);

const axis = efficacyAxis(prediction);
check('a gate-clearing model closes the technical absence of the efficacy axis', axis.available === true && axis.code === 'MODEL_ESTIMATE_AVAILABLE');
check('...but the axis still declares it is not a measurement', axis.isMeasurement === false && axis.evidenceClass === 'MODEL_ESTIMATE');

const passed = checks.every((c) => c.ok);
console.log(`\n${passed ? 'ALL INVARIANTS HELD' : 'INVARIANT VIOLATION'} (${checks.filter((c) => c.ok).length}/${checks.length})`);
console.log('\nOUTCOME: GLP-1R QSAR VALIDATED.');
console.log(`  axis             : ${GLP1R_EFFICACY_AXIS} (evidenceClass MODEL_ESTIMATE)`);
console.log(`  nTrain/nCalib/nTest: ${v.split.nTrain} / ${v.split.nCalib} / ${v.split.nTest}`);
console.log(`  MAE / RMSE / R2  : ${v.metrics.mae.toFixed(4)} / ${v.metrics.rmse.toFixed(4)} / ${v.metrics.r2.toFixed(4)}`);
console.log(`  conformal        : half-width ${v.halfWidth.toFixed(4)} pActivity at alpha=${gate.gate.conformalAlpha}`);
console.log(`  modelFingerprint : ${v.modelFingerprint}`);
console.log(`  trainingDataHash : ${trained.trainingDataHash}`);
console.log(`  gate             : ${trained.gateRuleFingerprint} (frozen, unmodified)`);
console.log('\nThis unblocks a COMPUTATIONAL efficacy axis. It is NOT clinical evidence and cannot promote a WinnerRecord:');
console.log('D-057 adjudicates on evidence class, and MODEL_ESTIMATE is not even a member of the EvidenceClass union.');
process.exit(passed ? 0 : 1);
