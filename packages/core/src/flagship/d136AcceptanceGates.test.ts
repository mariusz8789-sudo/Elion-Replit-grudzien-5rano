/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { verifyD136PersistenceGate, verifyD136SessionChainGate, verifyD136TamperNegativeGate } from './d136AcceptanceGates.js';
import { SessionEventLog } from './sessionEventLog.js';

const clock = { t: 0, now() { return (this.t += 1); } };
const input: NewEvidenceInput = { sourceUrl: 'https://example.invalid/x', sourceTimestamp: null, claim: 'c', claimType: 'observation', confidence: 0.9, provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: [] } };

describe('D-136 acceptance gates — real checks, never a hardcoded PASS', () => {
  it('persistence gate PASSes for a real, verified ledger snapshot and FAILs for a tampered one', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(input);
    const ok = verifyD136PersistenceGate(ledger, ledger.toSnapshot());
    expect(ok.ok).toBe(true);
    expect(ok.details.join(' ')).toContain('entries=1');

    const badSchema = verifyD136PersistenceGate(ledger, { ...ledger.toSnapshot(), schema: 'wrong/1' as never });
    expect(badSchema.ok).toBe(false);
    expect(badSchema.gate).toBe('LEDGER_SNAPSHOT_SCHEMA');
  });

  it('session chain gate PASSes for a real chain and FAILs for a hand-edited one', () => {
    const log = new SessionEventLog(clock);
    log.append('S1', 'SESSION_STARTED', { ok: true });
    log.append('S1', 'WORLD_CREATED', { world: 'x' });
    const events = log.read('S1');
    expect(verifyD136SessionChainGate(events).ok).toBe(true);
    const tampered = events.map((e, i) => (i === 0 ? { ...e, payload: { ok: false } } : e));
    const result = verifyD136SessionChainGate(tampered);
    expect(result.ok).toBe(false);
    expect(result.details.some((d) => d.includes('HASH_MISMATCH'))).toBe(true);
  });

  it('tamper-negative gate PASSes only when the given operation genuinely throws — an operation that silently succeeds FAILs the gate', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(input);
    const tampered = { ...ledger.toSnapshot(), entries: ledger.toSnapshot().entries.map((e, i) => (i === 0 ? { ...e, hash: 'deadbeef' } : e)) };
    const rejects = verifyD136TamperNegativeGate(() => EvidenceLedger.fromSnapshot(clock, tampered));
    expect(rejects.ok).toBe(true);
    expect(rejects.details[0]).toMatch(/LEDGER_SNAPSHOT_REJECTED/);

    const accepts = verifyD136TamperNegativeGate(() => 'no error thrown');
    expect(accepts.ok).toBe(false);
    expect(accepts.gate).toBe('TAMPER_NEGATIVE');
  });
});
