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
    super(
      `Record "${id}" already exists with different content — this store's policy refuses to overwrite it.`,
    );
    this.name = 'DuplicateRecordConflictError';
  }
}

/** A retained local value is not a usable keyed collection when it is an array, scalar, or null. */
export class MalformedRecordCollectionError extends Error {
  constructor(public readonly storageKey: string) {
    super(
      `Stored collection "${storageKey}" is not a flat record map — refusing to overwrite unreadable retained data.`,
    );
    this.name = 'MalformedRecordCollectionError';
  }
}

/** Keys that can alter an ordinary JavaScript object's prototype or constructor behavior. */
export class UnsafeRecordIdError extends Error {
  constructor(public readonly id: string) {
    super(`Record id "${id}" is not permitted in a local record collection.`);
    this.name = 'UnsafeRecordIdError';
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

const UNSAFE_RECORD_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafeRecordId(id: string): void {
  if (UNSAFE_RECORD_IDS.has(id)) {
    throw new UnsafeRecordIdError(id);
  }
}

function isFlatRecordMap(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownRecordValue<T>(records: Record<string, T>, id: string): T | undefined {
  return Object.hasOwn(records, id) ? records[id] : undefined;
}

/** In-memory backend — used by both domains' test suites and as a non-persistent fallback. */
export class InMemoryRecordStore<T> implements KeyedRecordStore<T> {
  private records = new Map<string, T>();

  constructor(private readonly policy: DuplicateIdPolicy = 'overwrite') {}

  async put(id: string, record: T): Promise<void> {
    assertSafeRecordId(id);
    if (this.policy === 'reject-if-different') {
      const existing = this.records.get(id);
      if (existing !== undefined && !sameContent(existing, record)) {
        throw new DuplicateRecordConflictError(id);
      }
    }
    this.records.set(id, record);
  }

  async get(id: string): Promise<T | null> {
    if (UNSAFE_RECORD_IDS.has(id)) return null;
    return this.records.get(id) ?? null;
  }

  async list(): Promise<readonly string[]> {
    return [...this.records.keys()].sort();
  }

  async delete(id: string): Promise<void> {
    if (UNSAFE_RECORD_IDS.has(id)) return;
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

  private readAll(): Record<string, T> | null {
    const value = readJSON<unknown>(this.storageKey, {});
    return isFlatRecordMap(value) ? (value as Record<string, T>) : null;
  }

  async put(id: string, record: T): Promise<void> {
    assertSafeRecordId(id);
    const all = this.readAll();
    if (all === null) {
      throw new MalformedRecordCollectionError(this.storageKey);
    }
    if (this.policy === 'reject-if-different') {
      const existing = ownRecordValue(all, id);
      if (existing !== undefined && !sameContent(existing, record)) {
        throw new DuplicateRecordConflictError(id);
      }
    }
    all[id] = record;
    writeJSON(this.storageKey, all);
  }

  async get(id: string): Promise<T | null> {
    if (UNSAFE_RECORD_IDS.has(id)) return null;
    const all = this.readAll();
    return all === null ? null : (ownRecordValue(all, id) ?? null);
  }

  async list(): Promise<readonly string[]> {
    const all = this.readAll();
    return all === null
      ? []
      : Object.keys(all)
          .filter((id) => !UNSAFE_RECORD_IDS.has(id))
          .sort();
  }

  async delete(id: string): Promise<void> {
    if (UNSAFE_RECORD_IDS.has(id)) return;
    const all = this.readAll();
    if (all === null) return;
    delete all[id];
    writeJSON(this.storageKey, all);
  }
}
