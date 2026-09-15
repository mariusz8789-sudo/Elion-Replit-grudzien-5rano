import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runIdentity, runIdentityFingerprint, sealRunArtifact, verifySealedArtifact,
  emitMetricClaim, verifyMetricClaim, printMetric, RUN_IDENTITY_FIELDS,
} from './security/metricClaim.mjs';
import { canonicalHash } from './provenance.mjs';

/** The REAL D-088 runs. Arm A measured 1.1726; arm B measured 1.0425. */
const BASE = {
  datasetPinSha: '5533d8b8940987fde860cd3438882e0b1bc509bc810f75f1cff4302530e69244',
  splitFingerprint: 'scaffold-hash-mod10',
  preregId: 'D-088-GLP1R-ENGINE-UNIFICATION',
  engine: 'glp1r-qsar',
  engineVersion: 'v1',
  modelConfigFingerprint: 'morgan-only-ridge',
  seed: null,
  target: 'GLP-1R',
  armId: 'A',
};
const armA = sealRunArtifact({ identity: BASE, metrics: { MAE: 1.172573164311559, R2: 0.4819503011281371, nTest: 45 }, decisionRecordId: '973db9cf615bf8b2', selectionClosedAt: null });
const armB = sealRunArtifact({
  identity: { ...BASE, engineVersion: 'v2', modelConfigFingerprint: 'representation-C', armId: 'B' },
  metrics: { MAE: 1.0424861001899126, R2: 0.5182048427495598, nTest: 45 },
  decisionRecordId: '973db9cf615bf8b2',
  selectionClosedAt: '2026-09-15T12:15:12.538Z',
});

test('REQUIRED 1: arm B\'s real 1.0425 FAILS when presented as arm A\'s number', () => {
  // The exact D-088 defect. The value is genuine and reproducible; it belongs
  // to a different run. This is the case a re-run can never catch.
  const claimB = emitMetricClaim(armB, 'MAE', 'POST_SELECTION_TEST');
  assert.equal(claimB.value, 1.0424861001899126);

  const v = verifyMetricClaim(claimB, armA);
  assert.equal(v.ok, false);
  assert.equal(v.event, 'METRIC_WITHOUT_PROVENANCE');

  // and the honest pairing still works
  assert.equal(verifyMetricClaim(claimB, armB).ok, true);
  assert.equal(verifyMetricClaim(emitMetricClaim(armA, 'MAE'), armA).ok, true);
});

test('REQUIRED 2: same dataset, changed engine/version/config/seed => different run identity', () => {
  const base = runIdentityFingerprint(BASE);
  assert.notEqual(base, runIdentityFingerprint({ ...BASE, engineVersion: 'v2' }));
  assert.notEqual(base, runIdentityFingerprint({ ...BASE, modelConfigFingerprint: 'other' }));
  assert.notEqual(base, runIdentityFingerprint({ ...BASE, seed: 1 }));
  assert.notEqual(base, runIdentityFingerprint({ ...BASE, armId: 'B' }));
  assert.notEqual(base, runIdentityFingerprint({ ...BASE, splitFingerprint: 'random-80-20' }));
  // and the SAME identity is stable
  assert.equal(base, runIdentityFingerprint({ ...BASE }));
});

test('REQUIRED 3: a claim cannot be its own witness — edited artifacts are refused', () => {
  // Mutating the sealed artifact's metric and re-presenting it must not verify,
  // because the seal covers identity AND metrics together.
  const claim = emitMetricClaim(armA, 'MAE');
  const forged = { ...armA, metrics: { ...armA.metrics, MAE: 0.5 } };
  assert.equal(verifySealedArtifact(forged).ok, false);
  assert.equal(verifyMetricClaim(claim, forged).event, 'ARTIFACT_TAMPERED');

  // Re-sealing the forgery gives it a valid self-hash, but the CLAIM still
  // fails: it was emitted from a different artifact.
  const resealed = sealRunArtifact({ identity: BASE, metrics: { ...armA.metrics, MAE: 0.5 }, decisionRecordId: '973db9cf615bf8b2', selectionClosedAt: null });
  assert.equal(verifySealedArtifact(resealed).ok, true);
  assert.equal(verifyMetricClaim(claim, resealed).event, 'METRIC_WITHOUT_PROVENANCE');
});

test('REQUIRED 4: a report cannot print a number without a resolving claim', () => {
  assert.throws(() => printMetric([], armA, 'MAE'), /METRIC_WITHOUT_PROVENANCE/);
  assert.throws(() => printMetric([emitMetricClaim(armB, 'MAE', 'POST_SELECTION_TEST')], armA, 'MAE'), /METRIC_WITHOUT_PROVENANCE/);
  assert.equal(printMetric([emitMetricClaim(armA, 'MAE')], armA, 'MAE'), 'MAE=1.172573164311559');
});

test('the caller cannot supply a value at all — there is no argument for one', () => {
  // emitMetricClaim takes a metric NAME. The number is read out of the sealed
  // artifact, so "emit MAE=1.0425 for arm A" is not expressible.
  assert.equal(emitMetricClaim(armA, 'MAE').value, 1.172573164311559);
  assert.throws(() => emitMetricClaim(armA, 'MAE_but_nicer'), /METRIC_NOT_IN_ARTIFACT/);
});

test('a post-selection metric cannot exist before selection closed', () => {
  assert.throws(() => emitMetricClaim(armA, 'MAE', 'POST_SELECTION_TEST'), /SELECTION_NOT_CLOSED/);
  assert.equal(emitMetricClaim(armB, 'MAE', 'POST_SELECTION_TEST').phase, 'POST_SELECTION_TEST');
});

test('run identity is complete or it is refused', () => {
  assert.equal(RUN_IDENTITY_FIELDS.length, 9);
  for (const f of RUN_IDENTITY_FIELDS) {
    const partial = { ...BASE };
    delete partial[f];
    assert.throws(() => runIdentity(partial), /RUN_IDENTITY_INCOMPLETE/, `missing ${f} must be refused`);
  }
});

test('ONE canonical hash applied ONCE — no second algorithm, no double hashing', () => {
  // The reviewed package proposed sha256Hex(canonicalHash(x)). sha256Hex does
  // not exist in provenance.mjs, and canonicalHash already returns a full
  // sha256 hex, so that expression is both an import error and a double hash.
  const id = runIdentity(BASE);
  assert.equal(runIdentityFingerprint(BASE), canonicalHash(id));
  assert.equal(runIdentityFingerprint(BASE).length, 64);
});

test('a non-finite metric can never be sealed', () => {
  for (const bad of [NaN, Infinity, null, '1.0']) {
    assert.throws(() => sealRunArtifact({ identity: BASE, metrics: { MAE: bad }, decisionRecordId: 'x' }), /METRIC_NOT_FINITE/);
  }
});
