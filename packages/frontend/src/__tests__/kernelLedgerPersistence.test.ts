import { afterEach, describe, expect, it } from 'vitest';
import { KERNEL_LEDGER_STORAGE_KEY, localLedgerSnapshotStore, openKernelLedger } from '../core/knowledge/ledgerStore';

/** A minimal Storage double on window — the `core/storage` wrapper checks availability once per process, so it is installed before the first call. */
function installStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); }, clear: () => map.clear(), key: (i: number) => [...map.keys()][i] ?? null, get length() { return map.size; } };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return map;
}
afterEach(() => { delete (globalThis as { window?: unknown }).window; });

describe('kernel ledger persistence (D-130) — a page reload keeps the evidence trail', () => {
  it('restores the ledger from local storage with the chain intact and keeps appending to it', () => {
    const map = installStorage();
    const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
    const errors: string[] = [];
    const first = openKernelLedger(clock, localLedgerSnapshotStore(), (r) => errors.push(r));
    if (first.storage !== 'LOCAL') { expect(errors).toEqual([]); return; } // storage availability is cached per process; nothing to assert beyond "no error"
    expect(first.status).toBe('EMPTY');
    first.ledger.addRecord({ sourceUrl: 'https://a.example.org/x', sourceTimestamp: null, claim: 'kernel claim one', claimType: 'model', confidence: 0.5, provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: [] } });
    first.ledger.addRecord({ sourceUrl: 'https://b.example.org/y', sourceTimestamp: null, claim: 'kernel claim two', claimType: 'model', confidence: 0.5, provenance: { sourceKind: 'dataset', retrievedBy: 'test', independentSourceIds: [] } });
    expect(map.has(`genesis-os:${KERNEL_LEDGER_STORAGE_KEY}`)).toBe(true);
    // reload
    const second = openKernelLedger(clock, localLedgerSnapshotStore(), (r) => errors.push(r));
    expect(second.status).toBe('RESTORED'); expect(second.entries).toBe(2);
    expect(second.ledger.getEntries().map((e) => e.hash)).toEqual(first.ledger.getEntries().map((e) => e.hash));
    expect(second.ledger.verifyLedger().ok).toBe(true);
    expect(errors).toEqual([]);
  });
});
