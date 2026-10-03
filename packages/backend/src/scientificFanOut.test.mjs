import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createEngineExecutionPort, ENGINE_EXECUTION_STATUS } from './compute/engineExecutionContract.mjs';
import { createScientificWorkerRuntime } from './compute/scientificWorkerRuntime.mjs';
import { createScientificJobQueuePort, createSqliteScientificJobQueueBackend } from './compute/workerInfrastructureContract.mjs';
import { openDatabase } from './store.mjs';

// One parent ResearchRun fans out into bounded child jobs that four independent runtimes drain
// concurrently from the single canonical lease queue. One child is poisoned on purpose: it must be
// recorded as DEAD_LETTER while every other child still completes, with distinct provenance.
const PARENT = 'research-run-fanout-parent';
const TOTAL = 32;
const POISONED = 'job-fanout-017';
const job = (n) => ({
  jobId: `job-fanout-${String(n).padStart(3, '0')}`,
  idempotencyKey: `idem-fanout-${String(n).padStart(3, '0')}`,
  researchRunId: PARENT,
  experimentId: `experiment-fanout-${String(n).padStart(3, '0')}`,
  capabilityId: 'quantum-chemistry',
  priority: 5,
  maxAttempts: 2,
  timeoutMs: 5_000,
  payload: { input: {
    smiles: '[H][H]', charge: 0, basis: 'sto-3g', method: 'RHF', forceField: 'ETKDGv3',
    atoms: [{ element: 'H', x: 0, y: 0, z: 0 }, { element: 'H', x: 0, y: 0, z: 0.5 + n / 100 }],
  } },
});

describe('bounded parallel fan-out under one ResearchRun', () => {
  it('drains 32 jobs with 4 concurrent workers, isolates one failure and keeps lineage distinct', async () => {
    const db = openDatabase();
    const backend = createSqliteScientificJobQueueBackend({ db });
    const queue = createScientificJobQueuePort({ backend });
    const executions = new Map();
    let inFlight = 0;
    let peak = 0;
    const executionPort = createEngineExecutionPort({
      admit: async (request) => (request.executionId === POISONED
        ? { ok: false, status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE, failureCode: 'POISONED_CHILD' }
        : { ok: true }),
      executor: { execute: async (request) => {
        executions.set(request.executionId, (executions.get(request.executionId) ?? 0) + 1);
        peak = Math.max(peak, ++inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return { ok: true, engine: { toolId: 'pyscf', version: 'fanout-test' }, environmentFingerprint: 'env-fanout', result: { bond: request.input.atoms[1].z } };
      } },
    });
    for (let n = 1; n <= TOTAL; n += 1) assert.equal((await queue.enqueue(job(n))).ok, true);

    const workers = ['worker-fanout-a', 'worker-fanout-b', 'worker-fanout-c', 'worker-fanout-d'];
    const handled = Object.fromEntries(workers.map((w) => [w, 0]));
    await Promise.all(workers.map(async (workerId) => {
      const runtime = createScientificWorkerRuntime({ queue, executionPort, workerId, leaseMs: 2_000, heartbeatMs: 500 });
      for (;;) {
        const result = await runtime.runOnce();
        if (result.state === 'IDLE') return;
        handled[workerId] += 1;
      }
    }));

    const rows = Array.from({ length: TOTAL }, (_, i) => backend.get(job(i + 1).jobId));
    const succeeded = rows.filter((r) => r.state === 'SUCCEEDED');
    const dead = rows.filter((r) => r.state === 'DEAD_LETTER');
    assert.equal(succeeded.length, TOTAL - 1);
    assert.deepEqual(dead.map((r) => r.jobId), [POISONED]);
    assert.equal(dead[0].failure.code, 'POISONED_CHILD');
    assert.equal(dead[0].result, null, 'a failed child never carries a fabricated result');
    for (const row of succeeded) assert.equal(executions.get(row.jobId), 1, `${row.jobId} executed exactly once`);
    assert.equal(executions.has(POISONED), false, 'the poisoned child never reached the engine');
    assert.equal(new Set(succeeded.map((r) => r.result.record.recordHash)).size, succeeded.length, 'record hashes are distinct');
    assert.ok(rows.every((r) => r.researchRunId === PARENT));
    assert.ok(Object.values(handled).filter((c) => c > 0).length >= 2, `work was shared: ${JSON.stringify(handled)}`);
    assert.ok(peak >= 2, `observed concurrency ${peak}`);
    db.close();
  });
});
