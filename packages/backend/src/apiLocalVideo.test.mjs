import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

function call(method, pathname, body = undefined) {
  return handleApi(openDatabase(), { method, pathname, body });
}

const validPlan = {
  capability: 'TEXT_TO_VIDEO',
  worldId: 'world-test-1',
  scenarioId: 'MARS_RESEARCH',
  sourceScientificStateFingerprint: 'canonical-world-fingerprint',
  promptOrShotDescription: 'A bounded cinematic orbit around the generated research world.',
};

describe('public local AI-video admission API', () => {
  test('reports real sanitized runtime state and immutable scientific boundaries', () => {
    const response = call('GET', '/api/compute/local-video/runtime');
    assert.equal(response.status, 200);
    assert.equal(response.body.mediaClass, 'GENERATED_MEDIA');
    assert.equal(response.body.mediaScope, 'VISUALIZATION_ONLY');
    assert.equal(response.body.evidenceEligible, false);
    assert.equal(response.body.scientificStateMutation, false);
    assert.ok(response.body.capabilities.includes('TEXT_TO_VIDEO'));
    assert.equal('directory' in response.body.runtime.localModels, false);
    assert.equal('checkpoints' in response.body.runtime.localModels, false);
    assert.equal('executable' in response.body.runtime.ffmpeg, false);
    if (response.body.runtime.gpu.available) {
      assert.ok(response.body.runtime.gpu.devices.length > 0);
      assert.equal(typeof response.body.runtime.gpu.devices[0].name, 'string');
    }
  });

  test('valid canonical control package remains honestly blocked without a registered local model', () => {
    const response = call('POST', '/api/compute/local-video/plan', validPlan);
    assert.equal(response.status, 200);
    assert.equal(response.body.plan.ready, false);
    assert.equal(response.body.plan.status, 'BLOCKED_MODEL_UNAVAILABLE');
    assert.equal(response.body.plan.sourceScientificStateFingerprint, validPlan.sourceScientificStateFingerprint);
    assert.match(response.body.plan.controlPackageFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(response.body.plan.evidenceEligible, false);
    assert.equal(response.body.plan.scientificStateMutation, false);
  });

  test('refuses an unbound request without scientific-state fingerprint', () => {
    const response = call('POST', '/api/compute/local-video/plan', { ...validPlan, sourceScientificStateFingerprint: '' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'source_scientific_state_fingerprint_required');
  });

  test('refuses scientific promotion fields before planning', () => {
    const response = call('POST', '/api/compute/local-video/plan', { ...validPlan, evidenceEligible: true });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'scientific_state_promotion_rejected');
  });

  test('does not expose a production generation endpoint before a real runner exists', () => {
    const response = call('POST', '/api/compute/local-video/execute', validPlan);
    assert.equal(response.status, 404);
  });
});
