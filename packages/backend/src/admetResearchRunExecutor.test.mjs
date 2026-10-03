import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { capabilityAvailable } from './campaign/toolchain.mjs';
import {
  ADMET_CANONICAL_ASPIRIN,
  ADMET_MODEL_IDENTITY,
  ADMET_USE_PURPOSE,
  admitAdmetUse,
  createAdmetResearchRunExecutor,
} from './compute/admetResearchRunExecutor.mjs';
import { DISPATCH_STATE } from './compute/scientificCapabilityContract.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('ADMET ResearchRun admission', () => {
  it('pins the reviewed runtime while keeping weights and training licences honest', () => {
    const requirements = readFileSync(ROOT + '/packages/backend/requirements-admet.txt', 'utf8');
    const constraints = readFileSync(ROOT + '/packages/backend/workers/admet/constraints.txt', 'utf8');
    assert.match(requirements, /^admet-ai==2\.0\.1$/m);
    assert.match(constraints, /^admet_ai==2\.0\.1$/m);
    assert.equal(ADMET_MODEL_IDENTITY.packageLicence.spdx, 'MIT');
    assert.equal(ADMET_MODEL_IDENTITY.weights.identityStatus, 'UNKNOWN');
    assert.equal(ADMET_MODEL_IDENTITY.weights.licenceStatus, 'UNKNOWN');
    assert.equal(ADMET_MODEL_IDENTITY.trainingData.licenceStatus, 'UNKNOWN');
    assert.equal(ADMET_MODEL_IDENTITY.outputClassification, 'MODEL_ESTIMATE');
    assert.equal(ADMET_MODEL_IDENTITY.measurementStatus, 'NOT_A_MEASUREMENT');
  });

  it('blocks commercial product execution before the worker while licence evidence is incomplete', async () => {
    let called = false;
    const runner = createAdmetResearchRunExecutor({
      executor: { execute: async () => { called = true; return { ok: true }; } },
    });
    const out = await runner.runCanonicalAspirin({
      researchRunId: 'rr-admet-commercial',
      executionId: 'admet-commercial-001',
    });
    assert.equal(called, false);
    assert.equal(out.ok, false);
    assert.equal(out.record.status, 'BLOCKED_BY_LICENSE');
    assert.equal(out.record.failureCode, 'ADMET_WEIGHTS_AND_TRAINING_DATA_LICENSE_UNVERIFIED');
    assert.equal(out.record.outputHash, null);
    assert.equal(out.epistemicClassification, 'MODEL_ESTIMATE');
  });

  it('allows bounded technical validation without promoting commercial rights or measurements', async () => {
    const executor = {
      execute: async () => ({
        ok: true,
        state: DISPATCH_STATE.LOCAL_EXECUTION,
        engine: { toolId: 'admet', name: 'ADMET-AI', version: '2.0.1' },
        environmentFingerprint: 'a'.repeat(64),
        result: { outputs: { Caco2_Wang: 0.42 }, units: { Caco2_Wang: null } },
      }),
    };
    const runner = createAdmetResearchRunExecutor({
      executor,
      purpose: ADMET_USE_PURPOSE.TECHNICAL_VALIDATION,
    });
    const out = await runner.runCanonicalAspirin({
      researchRunId: 'rr-admet-validation',
      executionId: 'admet-validation-001',
    });
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'admet');
    assert.equal(out.record.engineVersion, '2.0.1');
    assert.equal(out.epistemicClassification, 'MODEL_ESTIMATE');
    assert.equal(out.measurementStatus, 'NOT_A_MEASUREMENT');
    assert.equal(out.modelIdentity.commercialUseStatus, 'BLOCKED_PENDING_WEIGHTS_AND_TRAINING_DATA_AUDIT');
  });

  it('runs the real technical reference when installed or records honest runtime blocking', async () => {
    const runner = createAdmetResearchRunExecutor({ purpose: ADMET_USE_PURPOSE.TECHNICAL_VALIDATION });
    const out = await runner.runCanonicalAspirin({
      researchRunId: 'rr-admet-runtime',
      executionId: 'admet-runtime-001',
    });
    if (!capabilityAvailable(ADMET_CANONICAL_ASPIRIN.capabilityId)) {
      assert.equal(out.ok, false);
      assert.equal(out.record.status, 'BLOCKED_BY_RUNTIME');
      assert.equal(out.record.outputHash, null);
      return;
    }
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'admet');
    assert.match(out.record.engineVersion, /^2\.0\./);
    assert.match(out.record.environmentIdentity, /^[a-f0-9]{64}$/);
    assert.equal(out.epistemicClassification, 'MODEL_ESTIMATE');
    assert.ok(Object.keys(out.result.outputs).length > 0);
  });

  it('rejects unknown use purposes instead of guessing', () => {
    assert.deepEqual(admitAdmetUse({ purpose: 'MARKETING' }), {
      ok: false,
      status: 'BLOCKED_BY_CONFIGURATION',
      failureCode: 'ADMET_USE_PURPOSE_INVALID',
    });
  });
});
