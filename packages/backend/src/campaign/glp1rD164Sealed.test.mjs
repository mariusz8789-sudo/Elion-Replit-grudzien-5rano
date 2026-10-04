import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalHash } from '../provenance.mjs';

/**
 * D-164 — guard on the sealed domain-coverage run.
 *
 * The run needs RDKit and several minutes, so it is not re-executed here. What is guarded
 * is what can rot silently: that the result was produced under the preregistration
 * actually in the repository, that it can never be read as a gate verdict or as a
 * statement about the model's accuracy, that a sufficient-coverage outcome cannot survive
 * a failed control or a fraction below the frozen floor, that the frozen prediction is
 * still recorded wrong rather than quietly dropped, and that nothing was nominated.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEALED = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d164-domain-coverage.sealed.json'), 'utf8'));
const PREREG = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d164-domain-coverage-prereg.json'), 'utf8'));
const D162 = JSON.parse(fs.readFileSync(path.join(HERE, 'glp1r-d162-applicability-domain.sealed.json'), 'utf8'));

const ALLOWED = PREREG.prespecifiedOutcomes.map((o) => o.outcome);

describe('D-164 sealed domain-coverage run', () => {
  test('it was produced under the preregistration this repository holds', () => {
    assert.equal(SEALED.decisionId, 'D-164');
    assert.equal(SEALED.preregFingerprint, canonicalHash(PREREG).slice(0, 16), 'the run was measured against a different preregistration than the repository holds — the result is void, not the preregistration');
  });

  test('the outcome is one the preregistration named in advance', () => {
    assert.ok(ALLOWED.includes(SEALED.outcome), `unexpected outcome ${SEALED.outcome}`);
  });

  test('it is never a gate verdict and never a model-accuracy claim, and says so in data', () => {
    assert.equal(SEALED.isGateVerdict, false);
    assert.ok(typeof SEALED.notAGateVerdictBecause === 'string' && SEALED.notAGateVerdictBecause.length > 0);
    assert.ok(!['MODEL_GATE_PASS', 'MODEL_GATE_FAILED'].includes(SEALED.outcome));
    const text = JSON.stringify(SEALED);
    for (const forbidden of ['"mae"', '"rmse"', '"r2"']) {
      assert.ok(!text.toLowerCase().includes(forbidden), `this run fits no model, so it must carry no ${forbidden}`);
    }
  });

  test('the distance boundary is D-162\'s own, reused by reference and not re-chosen', () => {
    assert.equal(SEALED.frozenCriteria.DOMAIN_FLOOR, PREREG.frozenCriteria.DOMAIN_FLOOR);
    assert.equal(SEALED.frozenCriteria.DOMAIN_FLOOR, D162.controls.distance.ceiling);
  });

  test('every frozen threshold in the seal is the preregistered one, not retuned', () => {
    for (const k of ['MIN_IN_DOMAIN_FRACTION', 'MIN_NOVEL_PRODUCTS', 'MIN_SMALL_MOLECULE_PARENTS', 'SMALL_MOLECULE_MAX_MOLWT', 'SMALL_MOLECULE_MAX_AMIDE_BONDS', 'GENERATION_GROUP_SIZE', 'GENERATION_MAX_PRODUCTS_PER_GROUP', 'GENERATION_MAX_DEPTH']) {
      assert.equal(SEALED.frozenCriteria[k], PREREG.frozenCriteria[k], `${k} differs between the seal and the preregistration`);
    }
  });

  test('the dataset is the D-152 functional arm at the preregistered size, roles read not recomputed', () => {
    assert.equal(SEALED.rolesFrom.decisionId, 'D-152');
    assert.equal(SEALED.dataset.functionalRows, PREREG.dataset.EXPECTED_ROWS);
    assert.equal(SEALED.dataset.functionalCompounds, PREREG.dataset.EXPECTED_COMPOUNDS);
  });

  test('DOMAIN_COVERAGE_SUFFICIENT would require every control to have held and the floor to have been met', () => {
    if (SEALED.outcome !== 'DOMAIN_COVERAGE_SUFFICIENT') return;
    assert.equal(SEALED.controls.noParentCountedAsAProduct.regeneratedParents, 0);
    assert.equal(SEALED.controls.determinism.ok, true);
    assert.ok(SEALED.generation.productsMeasured >= SEALED.frozenCriteria.MIN_NOVEL_PRODUCTS);
    assert.ok(SEALED.measurement.inDomainFraction >= SEALED.frozenCriteria.MIN_IN_DOMAIN_FRACTION);
  });

  test('a reported coverage number is impossible without enough products, by construction', () => {
    if (SEALED.generation.productsMeasured < SEALED.frozenCriteria.MIN_NOVEL_PRODUCTS) {
      assert.equal(SEALED.outcome, 'NO_GENERABLE_CANDIDATE_SPACE');
    }
  });

  test('no product was regenerated from a parent, so no trivially in-domain row inflates the fraction', () => {
    assert.equal(SEALED.controls.noParentCountedAsAProduct.regeneratedParents, 0);
    assert.equal(SEALED.controls.noParentCountedAsAProduct.ok, true);
  });

  test('the negative control is present whatever the outcome', () => {
    assert.equal(SEALED.negativeControl.kind, 'ARM_AGAINST_ITSELF_LEAVE_ONE_OUT');
    assert.ok(Number.isFinite(SEALED.negativeControl.median));
    assert.ok(Number.isFinite(SEALED.negativeControl.fractionAtOrAboveFloor));
  });

  test('the frozen prediction is recorded verbatim, and recorded wrong rather than dropped', () => {
    assert.deepEqual(SEALED.frozenPrediction, PREREG.frozenPrediction);
    assert.equal(SEALED.predictionCorrect, SEALED.frozenPrediction.primary === SEALED.outcome);
    assert.equal(SEALED.predictionAssessment.primaryOutcomePredicted, PREREG.frozenPrediction.primary);
  });

  test('the number seen between the freeze and the run is disclosed, not hidden', () => {
    assert.ok(Array.isArray(SEALED.disclosedAfterTheFreeze) && SEALED.disclosedAfterTheFreeze.length > 0);
    assert.ok(SEALED.disclosedAfterTheFreeze.some((s) => /AFTER this preregistration was committed/.test(s)));
  });

  test('nothing was nominated, ranked or registered', () => {
    assert.match(SEALED.boundary, /no candidate was nominated or ranked/);
    assert.match(SEALED.boundary, /no docking target was changed/);
    const text = JSON.stringify(SEALED);
    for (const forbidden of ['"candidateId"', '"winner"', '"finalist"', '"nominated"']) {
      assert.ok(!text.includes(forbidden), `the seal must not carry ${forbidden}`);
    }
  });

  test('the limitation that IN_DOMAIN is not a pass mark travels with the result', () => {
    assert.ok(SEALED.limitations.some((l) => /never means the model predicts that molecule well/.test(l)));
    assert.match(PREREG.frozenCriteria.DOMAIN_FLOOR_isNotAPassMark, /not yet shown to be outside/);
  });

  test('the artefact hash is the hash of its own body', () => {
    const { artifactHash, ...body } = SEALED;
    assert.equal(canonicalHash(body).slice(0, 16), artifactHash);
  });
});
