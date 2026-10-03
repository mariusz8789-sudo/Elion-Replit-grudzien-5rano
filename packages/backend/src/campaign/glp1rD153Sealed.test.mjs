import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rValidationGate } from './glp1rQsar.mjs';

/**
 * D-153 — guard on the sealed functional-subset validation.
 *
 * The run itself needs RDKit and several minutes, so it is not re-executed here.
 * What is checked is the thing that can rot without anybody noticing: that the
 * sealed artefact still agrees with the gate that is actually in the repository,
 * that its outcome is one of the three the preregistration allowed, and that a
 * MODEL_GATE_PASS cannot survive a failed leakage control or an out-of-gate
 * metric. If someone later loosens the gate, this test fails rather than letting
 * a stale pass keep standing on a moved threshold.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEALED = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d153-functional-model.sealed.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d153-functional-model-prereg.json'), 'utf8'));

const ALLOWED_OUTCOMES = ['MODEL_GATE_PASS', 'MODEL_GATE_FAILED', 'INSUFFICIENT_INDEPENDENCE'];

describe('D-153 sealed functional-subset validation', () => {
  test('the sealed run was validated against the gate now in the repository', () => {
    const gate = loadGlp1rValidationGate();
    assert.equal(gate.ok, true, 'the frozen GLP-1R validation gate must be loadable');
    assert.equal(
      SEALED.gateRuleFingerprint,
      gate.ruleFingerprint,
      'sealed verdict was produced against a different gate than the one in the repository — the verdict is void, not the gate',
    );
    assert.equal(SEALED.gateRuleFingerprint, PREREG.gate.ruleFingerprint);
    assert.equal(SEALED.gateUnchanged, true);
  });

  test('the outcome is one of the three the preregistration allowed', () => {
    assert.ok(ALLOWED_OUTCOMES.includes(SEALED.outcome), `unexpected outcome ${SEALED.outcome}`);
    assert.ok(Object.keys(PREREG.allowedOutcomes).includes(SEALED.outcome));
  });

  test('the dataset is the D-152 functional arm, at the preregistered size', () => {
    assert.equal(SEALED.rolesFrom.decisionId, 'D-152');
    assert.equal(SEALED.dataset.functionalRows, PREREG.dataset.expectedRows);
    assert.equal(SEALED.dataset.functionalCompounds, PREREG.dataset.expectedCompounds);
  });

  test('a pass requires every leakage control to have held', () => {
    if (SEALED.outcome !== 'MODEL_GATE_PASS') return;
    const c = SEALED.leakageControls;
    assert.equal(c.compoundDisjointness.ok, true);
    assert.equal(c.compoundDisjointness.sharedCompounds, 0);
    assert.equal(c.scaffoldDisjointness.ok, true);
    assert.equal(c.scaffoldDisjointness.sharedScaffolds, 0);
    assert.equal(c.assayConcentration.ok, true);
    assert.ok(c.assayConcentration.largestTestAssayShare <= c.assayConcentration.threshold);
    assert.equal(c.testAssayCoverage.ok, true);
    assert.ok(c.testAssayCoverage.distinctTestAssays >= c.testAssayCoverage.minimum);
    assert.equal(SEALED.independenceOk, true);
  });

  test('a pass requires the metrics to sit inside the gate, not near it', () => {
    if (SEALED.outcome !== 'MODEL_GATE_PASS') return;
    const gate = loadGlp1rValidationGate();
    const m = SEALED.validation.metrics;
    assert.equal(SEALED.validation.gateMet, true);
    assert.deepEqual(SEALED.validation.reasons, []);
    assert.ok(SEALED.split.nTrain >= gate.gate.MIN_TRAIN);
    assert.ok(SEALED.split.nTest >= gate.gate.MIN_TEST);
    assert.ok(m.n >= gate.gate.MIN_TEST);
    assert.ok(m.mae <= gate.gate.MAX_MAE, `MAE ${m.mae} exceeds MAX_MAE ${gate.gate.MAX_MAE}`);
    assert.ok(m.r2 >= gate.gate.MIN_R2, `R2 ${m.r2} below MIN_R2 ${gate.gate.MIN_R2}`);
    assert.ok(Number.isFinite(SEALED.validation.conformalHalfWidth), 'a missing conformal interval is a gate failure, not a nullable field');
    assert.ok(typeof SEALED.validation.modelFingerprint === 'string' && SEALED.validation.modelFingerprint.length > 0);
    assert.ok(typeof SEALED.dataset.trainingDataHash === 'string' && SEALED.dataset.trainingDataHash.length > 0);
  });

  test('the frozen prediction is carried into the artefact, right or wrong', () => {
    assert.equal(SEALED.frozenPrediction.primary, PREREG.frozenPrediction.primary);
    assert.deepEqual(SEALED.frozenPrediction.intervals, PREREG.frozenPrediction.intervals);
  });

  test('the artefact states its limitations and claims no candidate', () => {
    assert.ok(Array.isArray(SEALED.limitations) && SEALED.limitations.length >= 3);
    const text = JSON.stringify(SEALED).toLowerCase();
    assert.ok(!text.includes('winnerscore'), 'no magic winnerScore');
    assert.ok(!text.includes('candidate discovered'));
    assert.ok(SEALED.boundary.includes('no candidate was ranked'));
  });

  test('the post-hoc diagnostic never poses as part of the preregistration', () => {
    const p = path.join(HERE, 'glp1r-d153-posthoc-similarity.json');
    if (!fs.existsSync(p)) return;
    const post = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(post.kind, 'POST_HOC_DIAGNOSTIC');
    assert.ok(typeof post.notPartOfPreregistration === 'string' && post.notPartOfPreregistration.length > 0);
    assert.ok(!('outcome' in post), 'a post-hoc diagnostic reports no verdict');
    assert.ok(!('gateMet' in post));
    // it must beat the trivial baseline, or the sealed pass means nothing
    if (SEALED.outcome === 'MODEL_GATE_PASS') {
      assert.ok(SEALED.validation.metrics.mae < post.trainMeanBaseline.mae);
    }
  });
});
