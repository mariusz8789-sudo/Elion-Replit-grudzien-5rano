import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifestEntry, requiredManifestFields, DATASET_CLASSIFICATION, EVALUATION_CATEGORIES } from './trainingDataManifest.mjs';

function validEntry(overrides = {}) {
  return {
    datasetId: 'genesis-video-ds-1', datasetVersion: '0.1.0',
    sourceWorldId: 'w1', sourceScientificStateFingerprint: 'fp-abc',
    promptOrShotDescription: 'dolly through the lab', frameOrVideoReferences: ['ref1.mp4'],
    cameraMetadata: { fov: 35 }, frameTiming: { fps: 24, durationSeconds: 4 },
    license: 'CC-BY-4.0', source: 'genesis-internal-capture',
    consentAndUsageConstraints: 'internal-training-only',
    classification: DATASET_CLASSIFICATION.GENERATED,
    qualityAnnotations: { sharpness: 0.9 }, scientificConsistencyAnnotations: { consistent: true },
    split: 'train', preprocessingVersion: '1', checkpointLineage: ['base-v0'], reproducibilitySeed: 42,
    ...overrides,
  };
}

describe('Test: training data manifest rejects absent licensing/provenance (item 15)', () => {
  test('a fully-populated entry validates and produces a stable fingerprint', () => {
    const r = validateManifestEntry(validEntry());
    assert.equal(r.ok, true);
    assert.match(r.fingerprint, /^[0-9a-f]{64}$/);
  });

  test('an entry missing `license` is rejected, never silently admitted', () => {
    const entry = validEntry(); delete entry.license;
    const r = validateManifestEntry(entry);
    assert.equal(r.ok, false);
    assert.ok(r.missingFields.includes('license'));
  });

  test('an entry missing `source` (provenance) is rejected', () => {
    const entry = validEntry(); delete entry.source;
    const r = validateManifestEntry(entry);
    assert.equal(r.ok, false);
    assert.ok(r.missingFields.includes('source'));
  });

  test('an entry with an empty-string license is treated as absent, not a real license', () => {
    const r = validateManifestEntry(validEntry({ license: '   ' }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'incomplete_licensing_or_provenance');
  });

  test('every required field individually triggers rejection when missing', () => {
    for (const field of requiredManifestFields()) {
      const entry = validEntry(); delete entry[field];
      const r = validateManifestEntry(entry);
      assert.equal(r.ok, false, `field "${field}" should be required`);
    }
  });

  test('an unknown classification value is rejected — generated vs observed must be explicit', () => {
    const r = validateManifestEntry(validEntry({ classification: 'MAYBE_GENERATED' }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_classification');
  });

  test('an unknown split value is rejected', () => {
    const r = validateManifestEntry(validEntry({ split: 'holdout' }));
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_split');
  });

  test('null/non-object input is rejected outright', () => {
    assert.equal(validateManifestEntry(null).ok, false);
    assert.equal(validateManifestEntry('not an object').ok, false);
  });

  test('the nine required evaluation categories are all documented', () => {
    const required = ['TEMPORAL_CONSISTENCY', 'OBJECT_IDENTITY_STABILITY', 'CAMERA_ADHERENCE', 'CONTROL_ADHERENCE', 'VISUAL_ARTIFACTS', 'ANATOMY_CONSISTENCY', 'SCIENTIFIC_STATE_CONSISTENCY', 'FORBIDDEN_CLAIM_PROMOTION', 'PROVENANCE_COMPLETENESS'];
    assert.deepEqual([...EVALUATION_CATEGORIES].sort(), required.sort());
  });
});
