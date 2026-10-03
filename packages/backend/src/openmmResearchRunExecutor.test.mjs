import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { capabilityAvailable } from './campaign/toolchain.mjs';
import { OPENMM_CANONICAL_TIP3P, createOpenMmResearchRunExecutor } from './compute/openmmResearchRunExecutor.mjs';
import { DISPATCH_STATE } from './compute/scientificCapabilityContract.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('OpenMM ResearchRun admission', () => {
  it('pins the reviewed OpenMM worker and bounded protocol', () => {
    const requirements = readFileSync(ROOT + '/packages/backend/requirements-openmm.txt', 'utf8');
    const constraints = readFileSync(ROOT + '/packages/backend/workers/structural/constraints.txt', 'utf8');
    const dockerfile = readFileSync(ROOT + '/packages/backend/workers/structural/Dockerfile', 'utf8');
    assert.match(requirements, /^openmm==8\.6\.1$/m);
    assert.match(constraints, /^OpenMM==8\.6\.1$/m);
    assert.match(dockerfile, /import rdkit, openmm, vina, meeko/);
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.forceField, 'amber14/tip3p.xml');
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.integrator, 'LangevinMiddleIntegrator');
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.timestepPs, 0.002);
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.temperatureK, 300);
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.seed, 42);
    assert.equal(OPENMM_CANONICAL_TIP3P.protocol.platform, 'CPU');
  });

  it('keeps the bounded reference classified as model output, never candidate stability', async () => {
    const executor = {
      execute: async () => ({
        ok: true,
        state: DISPATCH_STATE.LOCAL_EXECUTION,
        engine: { toolId: 'openmm', name: 'OpenMM', version: '8.6.1' },
        environmentFingerprint: 'b'.repeat(64),
        result: {
          case: 'TIP3P reference',
          data: {
            waters: 185,
            atoms: 555,
            steps: 300,
            timestepPs: 0.002,
            temperatureK: 298,
            potentialEnergyInitialKjmol: -100,
            potentialEnergyMinimizedKjmol: -200,
            potentialEnergyProductionKjmol: -180,
            forceField: 'amber14/tip3p.xml',
            seed: 42,
          },
          platform: 'CPU',
          expectation: 'bounded software reference',
          pass: true,
        },
      }),
    };
    const out = await createOpenMmResearchRunExecutor({ executor }).runCanonicalTip3p({
      researchRunId: 'rr-openmm-fixture',
      executionId: 'openmm-fixture-001',
    });
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineVersion, '8.6.1');
    assert.equal(out.record.replayCapability, 'REPLAY_UNSUPPORTED_PLATFORM_NUMERICS');
    assert.equal(out.epistemicClassification, 'MODEL_ESTIMATE');
    assert.equal(out.scope, 'SOFTWARE_INTEGRATION_REFERENCE_NOT_CANDIDATE_STABILITY');
    assert.equal(out.runtime.enginePlatform, 'CPU');
    assert.equal(out.runtime.hardwareIdentity, null);
  });

  it('runs the real bounded simulation when installed or blocks without synthetic energies', async () => {
    const out = await createOpenMmResearchRunExecutor().runCanonicalTip3p({
      researchRunId: 'rr-openmm-runtime',
      executionId: 'openmm-runtime-001',
    });
    if (!capabilityAvailable(OPENMM_CANONICAL_TIP3P.capabilityId)) {
      assert.equal(out.ok, false);
      assert.equal(out.record.status, 'BLOCKED_BY_RUNTIME');
      assert.equal(out.record.outputHash, null);
      return;
    }
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'openmm');
    assert.match(out.record.engineVersion, /^8\.6\./);
    assert.equal(out.result.platform, 'CPU');
    assert.equal(out.result.data.forceField, OPENMM_CANONICAL_TIP3P.protocol.forceField);
    assert.equal(out.result.data.seed, OPENMM_CANONICAL_TIP3P.protocol.seed);
    assert.equal(out.result.data.timestepPs, OPENMM_CANONICAL_TIP3P.protocol.timestepPs);
    assert.equal(out.result.data.steps, OPENMM_CANONICAL_TIP3P.input.steps);
    assert.match(out.record.environmentIdentity, /^[a-f0-9]{64}$/);
  });
});
