import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rValidationGate } from './glp1rQsar.mjs';

/**
 * D-162 — guard on the sealed applicability-domain probe.
 *
 * The run needs RDKit and a few minutes, so it is not re-executed here. What is
 * guarded is what can rot silently: that the probe was measured against the gate
 * actually in the repository, that it can never be read as a gate verdict, that a
 * supported-extrapolation outcome cannot survive a failed control or an
 * out-of-threshold metric, and that D-153's own seal was not touched by it.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEALED = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d162-applicability-domain.sealed.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d162-applicability-domain-prereg.json'), 'utf8'));
const D153 = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d153-functional-model.sealed.json'), 'utf8'));

const ALLOWED = PREREG.prespecifiedOutcomes.map((o) => o.outcome);

describe('D-162 sealed applicability-domain probe', () => {
  test('the probe was measured against the gate now in the repository, unedited', () => {
    const gate = loadGlp1rValidationGate();
    assert.equal(gate.ok, true);
    assert.equal(SEALED.gateRuleFingerprint, gate.ruleFingerprint, 'the probe was measured against a different gate than the repository holds — the result is void, not the gate');
    assert.equal(SEALED.gateRuleFingerprint, PREREG.frozenCriteria.expectedGateRuleFingerprint);
    assert.equal(SEALED.gateUnchanged, true);
  });

  test('it is never a gate verdict and says so in data, not only in prose', () => {
    assert.equal(SEALED.isGateVerdict, false);
    assert.equal(SEALED.gateVerdict, null);
    assert.ok(typeof SEALED.notAGateVerdictBecause === 'string' && SEALED.notAGateVerdictBecause.length > 0);
    assert.ok(!['MODEL_GATE_PASS', 'MODEL_GATE_FAILED'].includes(SEALED.outcome), 'a probe outcome must never be spelled as a gate verdict');
  });

  test('the outcome is one the preregistration named in advance', () => {
    assert.ok(ALLOWED.includes(SEALED.outcome), `unexpected outcome ${SEALED.outcome}`);
  });

  test('the dataset is the D-152 functional arm at the preregistered size, roles read not recomputed', () => {
    assert.equal(SEALED.rolesFrom.decisionId, 'D-152');
    assert.equal(SEALED.dataset.functionalRows, PREREG.dataset.EXPECTED_ROWS);
    assert.equal(SEALED.dataset.functionalCompounds, PREREG.dataset.EXPECTED_COMPOUNDS);
  });

  test('the frozen thresholds in the seal are the preregistered ones, not retuned', () => {
    assert.equal(SEALED.controls.distance.ceiling, PREREG.frozenCriteria.DISTANCE_CEILING);
    assert.equal(SEALED.clustering.cutoff, PREREG.frozenCriteria.CLUSTER_CUTOFF);
  });

  test('EXTRAPOLATION_SUPPORTED requires every control to have held and both thresholds to have been met', () => {
    if (SEALED.outcome !== 'EXTRAPOLATION_SUPPORTED') return;
    const gate = loadGlp1rValidationGate();
    assert.equal(SEALED.controlsOk, true);
    for (const [name, c] of Object.entries(SEALED.controls)) assert.equal(c.ok, true, `control ${name} did not hold`);
    assert.ok(SEALED.measurement, 'a supported outcome must carry a measurement');
    assert.deepEqual(SEALED.measurement.thresholdsNotMet, []);
    assert.ok(SEALED.measurement.mae <= gate.gate.MAX_MAE);
    assert.ok(SEALED.measurement.r2 >= gate.gate.MIN_R2);
    assert.ok(SEALED.split.nTrain >= gate.gate.MIN_TRAIN);
    assert.ok(SEALED.split.nTest >= gate.gate.MIN_TEST);
  });

  test('a measured outcome carries a demonstrably distant split', () => {
    if (!['EXTRAPOLATION_SUPPORTED', 'EXTRAPOLATION_NOT_SUPPORTED'].includes(SEALED.outcome)) return;
    assert.equal(SEALED.controls.distance.ok, true);
    assert.ok(
      SEALED.controls.distance.maxNearestNeighbourTanimotoTestToTrain < PREREG.frozenCriteria.DISTANCE_CEILING,
      'a measured extrapolation outcome requires every test row to be below the frozen distance ceiling',
    );
  });

  test('the frozen prediction travels with the result and is scored, right or wrong', () => {
    assert.ok(SEALED.frozenPrediction && SEALED.frozenPrediction.primary);
    assert.equal(SEALED.predictionCorrect, SEALED.outcome === SEALED.frozenPrediction.primary);
    assert.equal(SEALED.predictionAssessment.primaryOutcomeCorrect, SEALED.predictionCorrect);
  });

  test('the negative control is present whenever a measurement is', () => {
    if (!SEALED.measurement) return;
    assert.ok(SEALED.negativeControl, 'a measurement without its train-mean baseline hides how hard the test was');
    assert.equal(SEALED.negativeControl.kind, 'TRAIN_MEAN_BASELINE');
    assert.equal(SEALED.negativeControl.n, SEALED.measurement.n);
  });

  test('D-153 stands exactly as sealed: this probe did not move its verdict or its numbers', () => {
    assert.equal(D153.outcome, 'MODEL_GATE_PASS');
    assert.equal(D153.decisionId, 'D-153');
    assert.equal(D153.validation.metrics.n, 53);
  });

  test('the probe nominates nothing and ranks nothing', () => {
    const text = JSON.stringify(SEALED);
    assert.ok(!/"candidate/i.test(text), 'the probe artefact must not carry a candidate');
    assert.ok(!/"winner/i.test(text), 'the probe artefact must not carry a winner');
    assert.ok(typeof SEALED.boundary === 'string' && /no candidate was nominated or ranked/i.test(SEALED.boundary));
  });
});
