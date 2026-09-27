/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from './EvidenceLedger.js';
import type { NewEvidenceInput } from './EvidenceLedger.js';
import { MemoryLedgerSnapshotStore, attachLedgerPersistence, openPersistentLedger, restoreLedger } from './ledgerPersistence.js';
import { huntContradictions } from './contradictionHunter.js';
import { generateCuriosityQuestions } from './curiosity.js';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
const rec = (sourceUrl: string, claim: string): NewEvidenceInput => ({ sourceUrl, sourceTimestamp: null, claim, claimType: 'reported_claim', confidence: 0.8, provenance: { sourceKind: 'document', retrievedBy: 'test', independentSourceIds: [] } });

describe('ledger persistence — restart keeps the chain, records, proposals, contradictions and curiosity', () => {
  it('snapshot → restore reproduces the hash chain bit for bit and the next append continues it', () => {
    const store = new MemoryLedgerSnapshotStore();
    const a = new EvidenceLedger(clock);
    attachLedgerPersistence(a, store);
    a.addRecord(rec('https://a.example.org/x', 'SEIRD run r0=2.5 peakDay=41'));
    a.addRecord(rec('https://b.example.org/y', 'SEIRD run r0=3.1 peakDay=41'));
    const pr = a.propose(rec('https://c.example.org/z', 'pending claim about r0'));
    a.publish(pr, 'human-1');
    expect(store.saves).toBe(4);
    const before = a.toSnapshot();
    // "restart": a fresh process rebuilds from the store
    const r = restoreLedger(clock, store);
    expect(r.status).toBe('RESTORED'); expect(r.entries).toBe(4);
    const b = r.ledger;
    expect(b.verifyLedger().ok).toBe(true);
    expect(b.getEntries().map((e) => e.hash)).toEqual(a.getEntries().map((e) => e.hash));
    expect(b.getActive().map((x) => x.id)).toEqual(a.getActive().map((x) => x.id));
    expect(b.getVersion()).toBe(a.getVersion());
    expect(b.getProposals()[0]?.status).toBe('approved');
    expect(JSON.stringify(b.toSnapshot())).toBe(JSON.stringify(before));
    // derived knowledge state survives because it is derived from the same records
    expect(huntContradictions(b.getActive()).fingerprint).toBe(huntContradictions(a.getActive()).fingerprint);
    expect(generateCuriosityQuestions(b.getActive()).fingerprint).toBe(generateCuriosityQuestions(a.getActive()).fingerprint);
    // appending after the restart chains onto the restored head
    const head = b.getEntries().at(-1)!.hash;
    b.addRecord(rec('https://d.example.org/w', 'new after restart'));
    expect(b.getEntries().at(-1)!.prevHash).toBe(head);
    expect(b.verifyLedger().ok).toBe(true);
  });
  it('a tampered snapshot is REJECTED, left in the store, and the process runs on a fresh ledger without persisting over it', () => {
    const store = new MemoryLedgerSnapshotStore();
    const a = new EvidenceLedger(clock); attachLedgerPersistence(a, store);
    a.addRecord(rec('https://a.example.org/x', 'claim one'));
    a.addRecord(rec('https://b.example.org/y', 'claim two'));
    const snap = store.load()!;
    const tampered = { ...snap, records: snap.records.map((r, i) => (i === 0 ? { ...r, claim: 'claim one EDITED' } : r)), entries: snap.entries.map((e, i) => (i === 0 ? { ...e, contentHash: 'deadbeef' } : e)) };
    store.save(tampered);
    const errors: string[] = [];
    const r = openPersistentLedger(clock, store, (reason) => errors.push(reason));
    expect(r.status).toBe('REJECTED'); expect(r.persisting).toBe(false);
    expect(errors[0]).toMatch(/LEDGER_SNAPSHOT_REJECTED: HASH_MISMATCH@0/);
    r.ledger.addRecord(rec('https://c.example.org/z', 'fresh'));
    expect(store.load()!.entries[0].contentHash).toBe('deadbeef'); // untouched for inspection
  });
  it('an empty store starts EMPTY and persists from the first append; a snapshot with an unknown active id is refused', () => {
    const store = new MemoryLedgerSnapshotStore();
    const r = openPersistentLedger(clock, store);
    expect(r.status).toBe('EMPTY'); expect(store.load()).toBeNull();
    r.ledger.addRecord(rec('https://a.example.org/x', 'first'));
    expect(store.load()!.entries.length).toBe(1);
    const bad = { ...store.load()!, activeIds: ['EV-nope'] };
    expect(() => EvidenceLedger.fromSnapshot(clock, bad)).toThrow(/ACTIVE_ID_UNKNOWN/);
  });
});
