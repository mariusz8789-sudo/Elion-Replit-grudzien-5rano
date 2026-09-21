import { readJSON, writeJSON } from '../storage';
import { openPersistentLedger, type LedgerSnapshotStore, type LedgerRestoreResult } from '@genesis/core/knowledge/ledgerPersistence.js';
import type { LedgerSnapshot } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { Clock } from '@genesis/core/knowledge/evidenceTypes.js';

/**
 * The kernel ledger's durable home in the browser (D-130): the existing
 * `core/storage` wrapper (prefix `genesis-os:`), one key, a JSON snapshot
 * rewritten after every appended entry. Nothing else in the app reads the
 * key. When storage is unavailable (private window, quota) the ledger runs
 * in memory and the status says so; when the stored chain does not verify
 * it is REJECTED and left in place for inspection.
 */
export const KERNEL_LEDGER_STORAGE_KEY = 'kernel-evidence-ledger/v1';

export function localLedgerSnapshotStore(key = KERNEL_LEDGER_STORAGE_KEY): LedgerSnapshotStore {
  return {
    load: () => readJSON<LedgerSnapshot | null>(key, null),
    save: (snapshot) => writeJSON(key, snapshot),
  };
}

export interface KernelLedgerBoot extends LedgerRestoreResult { readonly persisting: boolean; readonly storage: 'LOCAL' | 'MEMORY_ONLY'; }

/** Open the kernel ledger: restored from local storage when a verified snapshot exists, persisting from then on. */
export function openKernelLedger(clock: Clock, store: LedgerSnapshotStore = localLedgerSnapshotStore(), onError: (reason: string) => void = (r) => console.error(`[kernel-ledger] ${r}`)): KernelLedgerBoot {
  const r = openPersistentLedger(clock, store, onError);
  // A refused save (no storage) is reported once by onError; the ledger keeps running in memory.
  return { ...r, storage: r.persisting && store.save(r.ledger.toSnapshot()) ? 'LOCAL' : 'MEMORY_ONLY' };
}
