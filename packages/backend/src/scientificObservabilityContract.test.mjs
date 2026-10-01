import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScientificExecutionEvent } from './compute/scientificObservabilityContract.mjs';

const BASE = {
  requestId: 'request-001',
  researchRunId: 'research-run-001',
  experimentId: 'experiment-001',
  engineId: 'pyscf-2.14.0',
  status: 'SUCCESS',
  timing: { startedAt: '2026-10-01T00:00:00.000Z', finishedAt: '2026-10-01T00:00:01.000Z', runtimeMs: 1000 },
  resources: { cpuMs: 900, maxMemoryMb: 256, computeClass: 'CPU_SMALL' },
  artifactRefs: ['artifact:' + 'a'.repeat(64)],
};

describe('scientific execution observability', () => {
  it('emits correlated, bounded metadata without scientific payload bytes', () => {
    const result = createScientificExecutionEvent(BASE);
    assert.equal(result.ok, true);
    assert.equal(result.event.requestId, 'request-001');
    assert.equal(result.event.resources.maxMemoryMb, 256);
    assert.match(result.event.fingerprint, /^[a-f0-9]{64}$/);
  });

  it('rejects secrets and raw private datasets at any depth', () => {
    assert.equal(createScientificExecutionEvent({ ...BASE, token: 'secret' }).ok, false);
    assert.equal(createScientificExecutionEvent({ ...BASE, extra: { privateDataset: 'rows' } }).ok, false);
  });

  it('redacts paths and bounds error detail', () => {
    const result = createScientificExecutionEvent({ ...BASE, status: 'FAILED', errorCode: 'ENGINE_EXIT', errorDetail: 'failed at C:\\private\\engine\\run.py\nmore' });
    assert.equal(result.ok, true);
    assert.equal(result.event.errorDetail.includes('C:\\private'), false);
    assert.equal(result.event.errorDetail.includes('\n'), false);
  });
});
