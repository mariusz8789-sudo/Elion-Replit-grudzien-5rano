import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildScientificRuntimeStatus } from './scientificRuntimeStatus.mjs';

const env = {
  GENESIS_CHEM_LIGHT_WORKER_URL: 'http://chem-light.railway.internal:8090',
  GENESIS_SCIENTIFIC_WORKER_TOKEN: 'x'.repeat(48),
};

describe('effective scientific runtime status', () => {
  it('requires both current worker health and a canonical real remote ScienceRun', async () => {
    const db = { prepare: () => ({ all: () => [{
      capability: 'quantum-chemistry', engine: 'PySCF', engine_version: '2.14.0', created_at: 123,
      provenance_json: JSON.stringify({ execution: { mode: 'REMOTE_EXECUTION', workerGroup: 'chem-light', outputFingerprint: 'abc' } }),
    }] }) };
    const fetchImpl = async () => ({ ok: true, json: async () => ({
      ok: true, workerGroup: 'chem-light', contractVersion: '1.0.0', executionAuth: 'configured',
      executableCapabilities: ['quantum-chemistry', 'protein-structure-ingestion'],
    }) });
    const status = await buildScientificRuntimeStatus(db, { env, fetchImpl });
    const qm = status.engines.find((engine) => engine.capabilityId === 'quantum-chemistry');
    const protein = status.engines.find((engine) => engine.capabilityId === 'protein-structure-ingestion');
    assert.equal(qm.status, 'AVAILABLE');
    assert.equal(qm.version, '2.14.0');
    assert.equal(protein.status, 'PENDING_REAL_EXECUTION');
  });

  it('never promotes a historical proof when the worker is offline', async () => {
    const db = { prepare: () => ({ all: () => [{
      capability: 'quantum-chemistry', engine: 'PySCF', engine_version: '2.14.0', created_at: 123,
      provenance_json: JSON.stringify({ execution: { mode: 'REMOTE_EXECUTION', workerGroup: 'chem-light' } }),
    }] }) };
    const status = await buildScientificRuntimeStatus(db, { env, fetchImpl: async () => { throw new Error('offline'); }, timeoutMs: 10 });
    assert.equal(status.engines.find((engine) => engine.capabilityId === 'quantum-chemistry').status, 'BLOCKED_BY_RUNTIME');
  });
});
