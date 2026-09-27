/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger, type NewEvidenceInput } from '../knowledge/EvidenceLedger.js';
import { generateEvidenceManifest } from './evidenceManifest.js';
import { bindEvidenceLedgerToSessionLog } from './sessionEvidenceBridge.js';
import { SessionEventLog } from './sessionEventLog.js';

const clock = { t: 0, now() { return (this.t += 1); } };
const input = (claim: string): NewEvidenceInput => ({
  sourceUrl: 'https://example.invalid/source', sourceTimestamp: null, claim, claimType: 'observation', confidence: 0.9,
  provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: [] },
});

function realSession() {
  const ledger = new EvidenceLedger(clock);
  const log = new SessionEventLog(clock);
  log.append('S1', 'SESSION_STARTED', { ok: true });
  const dispose = bindEvidenceLedgerToSessionLog(ledger, log, () => 'S1', () => ({ commandId: 'cmd-1', actionKind: 'RUN_EXPERIMENT' }));
  ledger.addRecord(input('first'));
  ledger.addRecord(input('second'));
  dispose();
  return { ledger, log };
}

describe('D-136 Evidence Manifest — a real, deterministic projection over the ledger and session log, not a third store', () => {
  it('reports every EVIDENCE_APPENDED event, cross-checked against the real ledger entries, as reproducible', () => {
    const { ledger, log } = realSession();
    const manifest = generateEvidenceManifest('S1', log.read('S1'), ledger);
    expect(manifest.sessionChainIntact).toBe(true);
    expect(manifest.ledgerChainIntact).toBe(true);
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries.every((e) => e.ledgerBacked)).toBe(true);
    expect(manifest.entries[0]).toMatchObject({ commandId: 'cmd-1', actionKind: 'RUN_EXPERIMENT', ledgerEntryIndex: 0 });
    expect(manifest.commandCount).toBe(1); // both entries share the same commandId
    expect(manifest.eventTypeCounts.EVIDENCE_APPENDED).toBe(2);
    expect(manifest.reproducible).toBe(true);
  });

  it('is deterministic: two manifests built from the same session/ledger state are equal by value', () => {
    const { ledger, log } = realSession();
    const a = generateEvidenceManifest('S1', log.read('S1'), ledger);
    const b = generateEvidenceManifest('S1', log.read('S1'), ledger);
    expect(a).toEqual(b);
  });

  it('a session event claiming an evidence link the ledger no longer backs is flagged, not silently trusted', () => {
    const { ledger, log } = realSession();
    const events = log.read('S1').map((e) =>
      e.type === 'EVIDENCE_APPENDED' ? { ...e, payload: { ...(e.payload as object), contentHash: 'tampered-hash-not-in-ledger' } } : e,
    );
    const manifest = generateEvidenceManifest('S1', events, ledger);
    expect(manifest.entries.every((e) => e.ledgerBacked)).toBe(false);
    expect(manifest.reproducible).toBe(false);
    // the chain hash itself was NOT recomputed here (payload was swapped without re-chaining), so the
    // session chain also legitimately breaks - both signals agree the manifest is not reproducible.
    expect(manifest.sessionChainIntact).toBe(false);
  });

  it('a session with no evidence at all is still a valid, reproducible, empty manifest', () => {
    const ledger = new EvidenceLedger(clock);
    const log = new SessionEventLog(clock);
    log.append('S2', 'SESSION_STARTED', { ok: true });
    const manifest = generateEvidenceManifest('S2', log.read('S2'), ledger);
    expect(manifest.entries).toEqual([]);
    expect(manifest.reproducible).toBe(true);
  });
});
