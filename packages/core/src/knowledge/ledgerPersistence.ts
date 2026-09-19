/* Proprietary / All Rights Reserved - Genesis OS */
import { EvidenceLedger, type LedgerSnapshot } from './EvidenceLedger.js';
import type { Clock } from './evidenceTypes.js';

/**
 * LEDGER PERSISTENCE — the provider-neutral contract the delivered gap-closure
 * pack asked for, bound to the stores the repository already has (the frontend
 * `core/storage` localStorage wrapper, the backend's data directory beside
 * genesis.db). Nothing here is a second ledger: the ledger snapshots itself
 * after every appended entry and is rebuilt only from a snapshot whose hash
 * chain verifies. A broken snapshot is REJECTED and left in place for
 * inspection — a fresh in-memory ledger runs, and the caller is told.
 */
export interface LedgerSnapshotStore { load(): LedgerSnapshot | null; save(snapshot: LedgerSnapshot): boolean; }

export type LedgerRestoreStatus = 'EMPTY' | 'RESTORED' | 'REJECTED';
export interface LedgerRestoreResult { readonly ledger: EvidenceLedger; readonly status: LedgerRestoreStatus; readonly entries: number; readonly reason: string | null; }

/** Rebuild a ledger from the store (EMPTY → fresh, RESTORED → verified chain, REJECTED → fresh ledger, stored snapshot untouched, reason returned). */
export function restoreLedger(clock: Clock, store: LedgerSnapshotStore): LedgerRestoreResult {
  let snapshot: LedgerSnapshot | null;
  try { snapshot = store.load(); } catch (e) { return { ledger: new EvidenceLedger(clock), status: 'REJECTED', entries: 0, reason: `LOAD_FAILED: ${(e as Error).message}` }; }
  if (!snapshot) return { ledger: new EvidenceLedger(clock), status: 'EMPTY', entries: 0, reason: null };
  try { const ledger = EvidenceLedger.fromSnapshot(clock, snapshot); return { ledger, status: 'RESTORED', entries: ledger.getEntries().length, reason: null }; }
  catch (e) { return { ledger: new EvidenceLedger(clock), status: 'REJECTED', entries: 0, reason: (e as Error).message }; }
}

/** Save a snapshot after every appended entry (and once now). Returns the unsubscribe function. */
export function attachLedgerPersistence(ledger: EvidenceLedger, store: LedgerSnapshotStore, onError?: (reason: string) => void): () => void {
  const save = (): void => { try { if (!store.save(ledger.toSnapshot())) onError?.('SAVE_REFUSED'); } catch (e) { onError?.(`SAVE_FAILED: ${(e as Error).message}`); } };
  if (ledger.getEntries().length > 0) save();
  return ledger.onAppend(save);
}

/** One call for the common case: restore, then keep persisting unless the stored snapshot was rejected (in which case it is left for inspection). */
export function openPersistentLedger(clock: Clock, store: LedgerSnapshotStore, onError?: (reason: string) => void): LedgerRestoreResult & { readonly persisting: boolean } {
  const r = restoreLedger(clock, store);
  if (r.status === 'REJECTED') { onError?.(r.reason ?? 'REJECTED'); return { ...r, persisting: false }; }
  attachLedgerPersistence(r.ledger, store, onError);
  return { ...r, persisting: true };
}

/** In-memory store (tests, ephemeral deployments); `snapshots` counts saves. */
export class MemoryLedgerSnapshotStore implements LedgerSnapshotStore {
  private snapshot: LedgerSnapshot | null = null; saves = 0;
  load(): LedgerSnapshot | null { return this.snapshot ? JSON.parse(JSON.stringify(this.snapshot)) as LedgerSnapshot : null; }
  save(s: LedgerSnapshot): boolean { this.snapshot = JSON.parse(JSON.stringify(s)) as LedgerSnapshot; this.saves += 1; return true; }
}
