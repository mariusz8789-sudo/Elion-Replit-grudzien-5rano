import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngineExecutionPort, ENGINE_EXECUTION_STATUS, validateEngineExecutionRequest } from './compute/engineExecutionContract.mjs';
import { computeOutputFingerprint, DISPATCH_STATE } from './compute/scientificCapabilityContract.mjs';

const REQUEST = {
  researchRunId: 'research-run-1', experimentId: 'experiment-1', executionId: 'execution-001',
  capabilityId: 'quantum-chemistry',
  input: { smiles: '[H][H]', atoms: [{ element: 'H', x: 0, y: 0, z: 0 }, { element: 'H', x: 0, y: 0, z: 0.74 }], charge: 0, basis: 'sto-3g', method: 'RHF', forceField: 'ETKDGv3' },
  replayCapability: 'DETERMINISTIC_WITH_PINNED_ENVIRONMENT',
};

function clock(...values) {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]);
}

describe('generic engine execution contract', () => {
  it('reuses the canonical capability schema and input fingerprint', () => {
    const valid = validateEngineExecutionRequest(REQUEST);
    assert.equal(valid.ok, true);
    assert.equal(valid.value.engineId, 'pyscf');
    assert.match(valid.value.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(validateEngineExecutionRequest({ ...REQUEST, input: { invented: true } }).ok, false);
  });

  it('maps a verified canonical dispatch into one complete EngineExecutionRecord', async () => {
    const result = { data: { energyHartree: -1.1 }, meta: { engine: 'PySCF 2.14.0', method: 'RHF', basis: 'sto-3g' } };
    const executor = { execute: async () => ({
      ok: true, state: DISPATCH_STATE.REMOTE_EXECUTION,
      engine: { toolId: 'pyscf', name: 'PySCF', version: '2.14.0', fingerprint: null },
      result, outputFingerprint: computeOutputFingerprint(result), environmentFingerprint: 'e'.repeat(64), durationMs: 5,
    }) };
    const port = createEngineExecutionPort({ executor, now: clock('2026-10-01T00:00:00Z', '2026-10-01T00:00:01Z') });
    const out = await port.execute(REQUEST);
    assert.equal(out.ok, true);
    assert.equal(out.record.status, 'SUCCESS');
    assert.equal(out.record.engineId, 'pyscf');
    assert.equal(out.record.engineVersion, '2.14.0');
    assert.equal(out.record.outputHash, computeOutputFingerprint(result));
    assert.equal(out.record.environmentIdentity, 'e'.repeat(64));
    assert.equal(out.record.runtimeMs, 1000);
    assert.match(out.record.recordHash, /^[a-f0-9]{64}$/);
  });

  it('blocks on licence admission before any engine call', async () => {
    let called = false;
    const port = createEngineExecutionPort({
      executor: { execute: async () => { called = true; return { ok: true }; } },
      admit: async () => ({ ok: false, status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE, failureCode: 'MODEL_WEIGHTS_LICENSE_UNKNOWN' }),
      now: clock('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
    });
    const out = await port.execute(REQUEST);
    assert.equal(called, false);
    assert.equal(out.record.status, 'BLOCKED_BY_LICENSE');
    assert.equal(out.record.failureCode, 'MODEL_WEIGHTS_LICENSE_UNKNOWN');
    assert.equal(out.record.outputHash, null);
  });

  it('maps canonical runtime, timeout, data and cancellation states without a fake output', async () => {
    const cases = [
      [DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE, 'BLOCKED_BY_RUNTIME'],
      [DISPATCH_STATE.WORKER_TIMEOUT, 'TIMEOUT'],
      [DISPATCH_STATE.BLOCKED_INVALID_INPUT, 'BLOCKED_BY_DATA'],
    ];
    for (const [state, expected] of cases) {
      const port = createEngineExecutionPort({ executor: { execute: async () => ({ ok: false, state, error: state }) }, now: clock('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z') });
      const out = await port.execute(REQUEST);
      assert.equal(out.record.status, expected);
      assert.equal(out.record.outputHash, null);
    }
    const controller = new AbortController(); controller.abort();
    let called = false;
    const cancelled = createEngineExecutionPort({ executor: { execute: async () => { called = true; } }, now: clock('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z') });
    const out = await cancelled.execute(REQUEST, { signal: controller.signal });
    assert.equal(called, false);
    assert.equal(out.record.status, 'CANCELLED');
  });

  it('turns an unexpected executor exception into FAILED', async () => {
    const port = createEngineExecutionPort({ executor: { execute: async () => { throw new Error('secret path'); } }, now: clock('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z') });
    const out = await port.execute(REQUEST);
    assert.equal(out.ok, false);
    assert.equal(out.record.status, 'FAILED');
    assert.equal(out.record.failureCode, 'EXECUTOR_THREW');
  });
});

