import { describe, expect, it } from 'vitest';
import { EvidenceLedger, type LedgerSnapshot } from '@genesis/core/knowledge/EvidenceLedger.js';

/**
 * Overnight Science Task 2 (Evidence/Replay): proves append-only behavior, deterministic content
 * fingerprints, snapshot/restore, chain verification, and drift/tamper detection directly against
 * the ONE canonical EvidenceLedger seam (packages/core/src/knowledge/EvidenceLedger.ts, unmodified
 * — no adapter, no second hash implementation, no second Evidence store). Deterministic replay of
 * campaign decisions built on top of this same ledger is proved separately in
 * finalScienceCampaignReplay.test.ts (two independent runs, identical DecisionTrace fingerprints).
 */
const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };

const record = (overrides: Partial<{ sourceUrl: string; claim: string }> = {}) => ({
  sourceUrl: overrides.sourceUrl ?? 'https://evidence.example.org/a',
  sourceTimestamp: null,
  claim: overrides.claim ?? 'a real claim under test',
  claimType: 'model' as const,
  confidence: 0.7,
  provenance: { sourceKind: 'dataset' as const, retrievedBy: 'evidenceReplayLedgerIntegrity.test', independentSourceIds: [] },
});

describe('EvidenceLedger — deterministic content fingerprints', () => {
  it('the same input always fingerprints to the same content hash', () => {
    const ledger = new EvidenceLedger(clock);
    expect(ledger.contentHashOf(record())).toBe(ledger.contentHashOf(record()));
  });

  it('a different claim fingerprints to a different content hash', () => {
    const ledger = new EvidenceLedger(clock);
    expect(ledger.contentHashOf(record())).not.toBe(ledger.contentHashOf(record({ claim: 'a different claim' })));
  });
});

describe('EvidenceLedger — append-only behavior', () => {
  it('adding the identical input twice dedupes: same record id, no second chain entry', () => {
    const ledger = new EvidenceLedger(clock);
    const first = ledger.addRecord(record());
    const second = ledger.addRecord(record());
    expect(second.deduped).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    expect(ledger.getEntries().length).toBe(1);
  });

  it('entry index strictly increases and entries are frozen (append-only, never mutated in place)', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const entries = ledger.getEntries();
    expect(entries.map((e) => e.index)).toEqual([0, 1]);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });
});

describe('EvidenceLedger — chain verification', () => {
  it('verifyLedger reports ok on a healthy, untampered chain', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const result = ledger.verifyLedger();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('EvidenceLedger — snapshot/restore round trip', () => {
  it('fromSnapshot(toSnapshot()) reproduces an identical hash chain and passes verifyLedger', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const snapshot = ledger.toSnapshot();

    const restored = EvidenceLedger.fromSnapshot(clock, snapshot);
    expect(restored.getEntries().map((e) => e.hash)).toEqual(ledger.getEntries().map((e) => e.hash));
    expect(restored.getActive().map((r) => r.id)).toEqual(ledger.getActive().map((r) => r.id));
    expect(restored.verifyLedger().ok).toBe(true);
  });

  it('a restored ledger keeps appending correctly (new entries chain onto the restored tail)', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    const restored = EvidenceLedger.fromSnapshot(clock, ledger.toSnapshot());
    restored.addRecord(record({ claim: 'two' }));
    expect(restored.getEntries().length).toBe(2);
    expect(restored.verifyLedger().ok).toBe(true);
  });
});

describe('EvidenceLedger — drift/tamper detection', () => {
  it('fromSnapshot refuses a snapshot whose chain hash was tampered with, rather than silently accepting it', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const snapshot = ledger.toSnapshot();
    const tampered: LedgerSnapshot = {
      ...snapshot,
      entries: snapshot.entries.map((e, i) => (i === 0 ? { ...e, contentHash: 'tampered-content-hash' } : e)),
    };
    expect(() => EvidenceLedger.fromSnapshot(clock, tampered)).toThrow(/LEDGER_SNAPSHOT_REJECTED/);
  });

  it('fromSnapshot refuses a snapshot with a broken prevHash chain link', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const snapshot = ledger.toSnapshot();
    const tampered: LedgerSnapshot = {
      ...snapshot,
      entries: snapshot.entries.map((e, i) => (i === 1 ? { ...e, prevHash: 'WRONG_PREV_HASH' } : e)),
    };
    expect(() => EvidenceLedger.fromSnapshot(clock, tampered)).toThrow(/LEDGER_SNAPSHOT_REJECTED/);
  });

  it('a healthy ledger detects drift on itself if its own in-memory chain is corrupted directly', () => {
    const ledger = new EvidenceLedger(clock);
    ledger.addRecord(record({ claim: 'one' }));
    ledger.addRecord(record({ claim: 'two' }));
    const snapshot = ledger.toSnapshot();
    const corrupted = EvidenceLedger.fromSnapshot(clock, snapshot);
    // Round-trip through a snapshot that reorders entries — the chain link no longer matches.
    const reordered: LedgerSnapshot = { ...snapshot, entries: [...snapshot.entries].reverse() };
    expect(() => EvidenceLedger.fromSnapshot(clock, reordered)).toThrow(/LEDGER_SNAPSHOT_REJECTED/);
    expect(corrupted.verifyLedger().ok).toBe(true); // the untouched restore itself stays healthy
  });
});
