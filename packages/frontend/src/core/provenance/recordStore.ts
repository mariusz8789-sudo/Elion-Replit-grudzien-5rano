/**
 * PHASE 0.1 — SHARED KEYED RECORD STORE.
 *
 * The one mechanism Genesis's epidemic `EvidenceStore`
 * (core/discovery/evidenceStore.ts) and hazard `HazardProvenanceStore`
 * (core/hazard/hazardProvenanceStore.ts) both need: save-by-id, load-by-id,
 * list, canonical-content equality, and — for stores that want it — a
 * duplicate-id-with-different-content rejection. Extracted here because
 * building it a second time inside core/hazard/ would have been exactly the
 * "third parallel evidence system" both Phase 0 and this convergence pass
 * were told not to create.
 *
 * This module carries no domain policy. Whether duplicate ids may be
 * overwritten is a constructor choice (`DuplicateIdPolicy`), not something
 * this file decides — the epidemic evidence store keeps its existing
 * permissive behavior (an experiment may be re-saved/deleted/re-saved under
 * its own id) and the hazard provenance store opts into rejection. Neither
 * domain's persisted record SHAPE, storage key, or science changes because
 * of this extraction — only the get/put/list mechanics moved.
 */
import { canonicalJson } from '../events/hash';
import { readJSON, writeJSON } from '../storage';

export type DuplicateIdPolicy = 'overwrite' | 'reject-if-different';

export class DuplicateRecordConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Record "${id}" already exists with different content — this store's policy refuses to overwrite it.`);
    this.name = 'DuplicateRecordConflictError';
  }
}

export interface KeyedRecordStore<T> {
  put(id: string, record: T): Promise<void>;
  get(id: string): Promise<T | null>;
  list(): Promise<readonly string[]>;
  delete(id: string): Promise<void>;
}

function sameContent(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** In-memory backend — used by both domains' test suites and as a non-persistent fallback. */
export class InMemoryRecordStore<T> implements KeyedRecordStore<T> {
  private records = new Map<string, T>();

  constructor(private readonly policy: DuplicateIdPolicy = 'overwrite') {}

  async put(id: string, record: T): Promise<void> {
    if (this.policy === 'reject-if-different') {
      const existing = this.records.get(id);
      if (existing !== undefined && !sameContent(existing, record)) {
        throw new DuplicateRecordConflictError(id);
      }
    }
    this.records.set(id, record);
  }

  async get(id: string): Promise<T | null> {
    return this.records.get(id) ?? null;
  }

  async list(): Promise<readonly string[]> {
    return [...this.records.keys()].sort();
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }
}

/**
 * localStorage-backed implementation via the same `core/storage.ts` every
 * other locally-persisted Genesis feature uses. One `storageKey` holds a
 * flat `Record<string, T>` — the exact shape the pre-existing
 * `LocalEvidenceStore` already persisted under `'evidence-store/v1'`, so
 * records saved before this extraction remain readable without migration.
 */
export class LocalRecordStore<T> implements KeyedRecordStore<T> {
  constructor(
    private readonly storageKey: string,
    private readonly policy: DuplicateIdPolicy = 'overwrite',
  ) {}

  private readAll(): Record<string, T> {
    return readJSON<Record<string, T>>(this.storageKey, {});
  }

  async put(id: string, record: T): Promise<void> {
    const all = this.readAll();
    if (this.policy === 'reject-if-different') {
      const existing = all[id];
      if (existing !== undefined && !sameContent(existing, record)) {
        throw new DuplicateRecordConflictError(id);
      }
    }
    all[id] = record;
    writeJSON(this.storageKey, all);
  }

  async get(id: string): Promise<T | null> {
    return this.readAll()[id] ?? null;
  }

  async list(): Promise<readonly string[]> {
    return Object.keys(this.readAll()).sort();
  }

  async delete(id: string): Promise<void> {
    const all = this.readAll();
    delete all[id];
    writeJSON(this.storageKey, all);
  }
}
