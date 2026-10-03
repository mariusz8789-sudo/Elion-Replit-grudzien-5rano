import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildEngineRuntimeProductProof, ENGINE_PROOF_STATUS } from './engine-runtime-product-proof.mjs';

const HASH = 'a'.repeat(64);

function report(workerGroup, tools) {
  return {
    workerGroup,
    ok: true,
    verificationLevel: 'LOCAL_CONTAINER_VERIFIED',
    references: tools.map(({ toolId, version }) => ({ toolId, status: 'AVAILABLE', version, outputHash: HASH })),
    executions: tools.flatMap(({ capabilities }) => capabilities.map((capabilityId) => ({
      capabilityId,
      ok: true,
      state: 'REMOTE_EXECUTION',
      inputFingerprint: HASH,
      outputFingerprint: HASH,
      environmentFingerprint: HASH,
    }))),
  };
}

const reports = new Map([
  ['structural', report('structural', [
    { toolId: 'openmm', version: '8.6.1', capabilities: ['molecular-dynamics'] },
    { toolId: 'vina', version: '1.2.7', capabilities: ['molecular-docking'] },
  ])],
  ['admet', report('admet', [
    { toolId: 'admet', version: '2.0.1', capabilities: ['admet-estimation'] },
    { toolId: 'toxicity', version: '2.0.1', capabilities: ['toxicity-risk-estimation'] },
  ])],
]);

describe('engine runtime and product proof', () => {
  it('separates executed container proof from commercial product admission', () => {
    const proof = buildEngineRuntimeProductProof({ reports, commit: 'abc', now: () => new Date('2026-10-02T00:00:00.000Z') });
    assert.equal(proof.ok, true);
    assert.deepEqual(proof.summary.executableNow, ['vina-meeko', 'openmm', 'admet-ai']);
    assert.deepEqual(proof.summary.productEligible, []);
    assert.deepEqual(proof.summary.blockedExternal, ['vina-meeko', 'openmm', 'admet-ai', 'aizynthfinder']);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'admet-ai').runtimeStatus, ENGINE_PROOF_STATUS.EXECUTABLE_NOW);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'admet-ai').productStatus, ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'aizynthfinder').runtimeStatus, ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL);
  });

  it('fails if a required container report is absent or not fully verified', () => {
    const incomplete = new Map(reports);
    incomplete.delete('structural');
    const proof = buildEngineRuntimeProductProof({ reports: incomplete });
    assert.equal(proof.ok, false);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'vina-meeko').runtimeStatus, ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'openmm').runtimeStatus, ENGINE_PROOF_STATUS.BLOCKED_EXTERNAL);
  });

  it('does not accept a reference case without authenticated capability execution fingerprints', () => {
    const altered = new Map(reports);
    altered.set('structural', { ...reports.get('structural'), executions: [] });
    const proof = buildEngineRuntimeProductProof({ reports: altered });
    assert.equal(proof.ok, false);
    assert.equal(proof.engines.find((entry) => entry.engineId === 'vina-meeko').runtimeProof.ok, false);
  });
});
