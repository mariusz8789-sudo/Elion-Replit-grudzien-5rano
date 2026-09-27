import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPABILITY, STATUS, MEDIA_CLASS, MEDIA_SCOPE,
  normalizeControlInput, isKnownCapability, listSupportedCapabilities,
  computeControlFingerprint, sha256Hex,
  assertNoScientificStatePromotion, ScientificStatePromotionRejected,
} from './videoControlContract.mjs';

describe('Test: capability vocabulary', () => {
  test('all five required capabilities are known and validate correctly (item 1)', () => {
    const required = ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'VIDEO_TO_VIDEO', 'FRAME_ENHANCEMENT', 'TEMPORAL_UPSCALE'];
    assert.deepEqual([...listSupportedCapabilities()].sort(), required.sort());
    for (const cap of required) {
      assert.equal(isKnownCapability(cap), true, cap);
      assert.equal(CAPABILITY[cap], cap);
    }
  });

  test('an unsupported capability is rejected at normalization time', () => {
    const r = normalizeControlInput({ capability: 'HOLOGRAM_PROJECTION', worldId: 'w1' });
    assert.equal(r.ok, false);
    assert.equal(r.status, STATUS.BLOCKED_UNSUPPORTED_CAPABILITY);
    assert.equal(isKnownCapability('HOLOGRAM_PROJECTION'), false);
  });
});

describe('Test: media classification is fixed and never mutable', () => {
  test('MEDIA_CLASS and MEDIA_SCOPE are exactly the required two constants', () => {
    assert.equal(MEDIA_CLASS, 'GENERATED_MEDIA');
    assert.equal(MEDIA_SCOPE, 'VISUALIZATION_ONLY');
  });
});

describe('Test: scientific-state-promotion rejection (item 12)', () => {
  test('a raw input attempting to set evidenceEligible is rejected before anything else', () => {
    assert.throws(
      () => assertNoScientificStatePromotion({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', evidenceEligible: true }),
      ScientificStatePromotionRejected,
    );
  });

  test('every forbidden promotion field is individually rejected', () => {
    const forbidden = ['evidenceEligible', 'scientificStateMutation', 'promoteToEvidence', 'evidenceProposal', 'replayTruth', 'candidateIdentity', 'scienceRunResult', 'campaignResult', 'wetLabClassification', 'clinicalClassification', 'worldGraphState', 'evidenceClass'];
    for (const field of forbidden) {
      assert.throws(() => assertNoScientificStatePromotion({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', [field]: 'anything' }), ScientificStatePromotionRejected, field);
    }
  });

  test('normalizeControlInput itself refuses a promotion attempt via the same guard', () => {
    assert.throws(() => normalizeControlInput({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', scientificStateMutation: true }), ScientificStatePromotionRejected);
  });

  test('an input with no forbidden fields passes the guard silently', () => {
    assert.doesNotThrow(() => assertNoScientificStatePromotion({ capability: 'TEXT_TO_VIDEO', worldId: 'w1' }));
  });
});

describe('Test: control input normalization — explicit absence, never manufactured', () => {
  test('every optional reference field is present and explicitly null when the caller omitted it', () => {
    const r = normalizeControlInput({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'science-fp' });
    assert.equal(r.ok, true);
    assert.equal(r.input.referenceImage, null);
    assert.equal(r.input.referenceVideo, null);
    assert.equal(r.input.depthReference, null);
    assert.equal(r.input.deterministicSeed, null);
  });

  test('a supplied reference is preserved verbatim, never altered or invented', () => {
    const r = normalizeControlInput({ capability: 'IMAGE_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'science-fp', referenceImage: 'sha256:abc123-real-caller-supplied-image' });
    assert.equal(r.ok, true);
    assert.equal(r.input.referenceImage, 'sha256:abc123-real-caller-supplied-image');
  });

  test('a missing worldId is refused', () => {
    const r = normalizeControlInput({ capability: 'TEXT_TO_VIDEO', sourceScientificStateFingerprint: 'science-fp' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'world_id_required');
  });

  test('a missing scientific-state fingerprint is refused instead of generating unbound media', () => {
    const r = normalizeControlInput({ capability: 'TEXT_TO_VIDEO', worldId: 'w1' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'source_scientific_state_fingerprint_required');
  });

  test('a non-object input is refused, never coerced', () => {
    assert.equal(normalizeControlInput(null).ok, false);
    assert.equal(normalizeControlInput('not an object').ok, false);
  });
});

describe('Test: fingerprinting is deterministic (item 16)', () => {
  test('repeated equivalent input (identical values, different key order) produces the SAME control fingerprint', () => {
    const a = { capability: 'TEXT_TO_VIDEO', worldId: 'w1', promptOrShotDescription: 'dolly in' };
    const b = { promptOrShotDescription: 'dolly in', worldId: 'w1', capability: 'TEXT_TO_VIDEO' };
    assert.equal(computeControlFingerprint(a), computeControlFingerprint(b));
  });

  test('a genuinely different input produces a different fingerprint', () => {
    const a = computeControlFingerprint({ capability: 'TEXT_TO_VIDEO', worldId: 'w1' });
    const b = computeControlFingerprint({ capability: 'TEXT_TO_VIDEO', worldId: 'w2' });
    assert.notEqual(a, b);
  });

  test('normalizeControlInput assigns the SAME controlPackageFingerprint to two equivalent raw calls', () => {
    const r1 = normalizeControlInput({ capability: 'TEXT_TO_VIDEO', worldId: 'w1', sourceScientificStateFingerprint: 'science-fp', promptOrShotDescription: 'dolly in' });
    const r2 = normalizeControlInput({ promptOrShotDescription: 'dolly in', capability: 'TEXT_TO_VIDEO', sourceScientificStateFingerprint: 'science-fp', worldId: 'w1' });
    assert.equal(r1.input.controlPackageFingerprint, r2.input.controlPackageFingerprint);
  });

  test('sha256Hex produces a real, full 64-character hex digest, never truncated', () => {
    const h = sha256Hex('genesis-local-ai-video');
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});
