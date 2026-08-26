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
 *
 * PHASE 0.2 — PERSISTENCE INTEGRITY BOUNDARY (see
 * docs/PHASE0_2_PERSISTENCE_INTEGRITY.md for the full writeup). Contract in
 * brief:
 *
 * - Accepted shape: a genuine flat `Record<string, T>` — an object whose own
 *   prototype is exactly `Object.prototype` (never `null`, an array, or a
 *   primitive) — with each *entry* additionally passing this store's
 *   `validateRecord` predicate, when one was supplied by the caller.
 * - Reject shape: anything else read back from storage — corrupted JSON
 *   (already handled by `core/storage.ts`'s own try/catch), `null`, an
 *   array, a string/number/boolean, or an object whose prototype was
 *   tampered with — is treated as an EMPTY collection, never thrown to the
 *   UI and never partially trusted.
 * - Recovery: rejecting the *collection* never deletes what is actually
 *   sitting in `localStorage` — the next successful `put()` merges into
 *   whatever the raw bytes still are, so a transient bad read never causes
 *   permanent data loss. Rejecting one *record* (fails `validateRecord`) is
 *   even narrower: `get()` reports it as absent (`null`) but every sibling
 *   record in the same collection, and the corrupted record's own raw
 *   bytes, are left completely untouched.
 * - Legacy records: a collection written by an older Genesis build that is
 *   still a genuine flat `Record<string, T>` of shape-valid entries reads
 *   back exactly as before — this boundary adds a guard in front of the
 *   existing read path, it does not change the persisted shape or require
 *   migration.
 * - No-fabrication rule: this file never invents a fingerprint, hash,
 *   replay verdict, or provenance field. An unreadable/invalid record is
 *   reported as `null` (via `get()`) or excluded from `list()`'s effective
 *   results (via the caller's own `null`-filtering, unchanged); the
 *   verdict of what that absence MEANS (`NOT_REPRODUCIBLE`, `BLOCKED`,
 *   silently skipped) is entirely the calling domain's existing, unchanged
 *   error model — this file supplies "safely absent," never "safely
 *   substituted."
 * - Reserved keys: `__proto__`, `constructor`, and `prototype` can never be
 *   used as a record id. On read they are stripped before the collection is
 *   handed to any caller; on write, using one as an id throws — the same
 *   fail-closed posture as any other invalid input, not a data-loss path.
 */
import { canonicalJson } from '../events/hash';
import { readJSON, writeJSON } from '../storage';

export type DuplicateIdPolicy = 'overwrite' | 'reject-if-different';

const RESERVED_RECORD_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** True only for a genuine flat dictionary — never null, an array, or a primitive, and never an object with a tampered prototype. */
function isPlainRecordCollection(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Rebuilds a trusted, flat collection from whatever raw value storage
 * returned. Reserved keys are dropped. `Object.defineProperty` (not bracket
 * assignment) is used so a stray `__proto__` entry can never be
 * reinterpreted as a request to change the rebuilt object's own prototype.
 */
function sanitizeRecordCollection<T>(raw: unknown, validateRecord?: (candidate: unknown) => candidate is T): Record<string, T> {
  const safe: Record<string, T> = {};
  if (!isPlainRecordCollection(raw)) return safe;
  for (const key of Object.keys(raw)) {
    if (RESERVED_RECORD_KEYS.has(key)) continue;
    const candidate = raw[key];
    if (validateRecord && !validateRecord(candidate)) continue;
    Object.defineProperty(safe, key, { value: candidate as T, writable: true, enumerable: true, configurable: true });
  }
  return safe;
}

/** Same reserved-key guard for a single write, using defineProperty for the same reason as sanitizeRecordCollection. */
function setRecordEntry<T>(all: Record<string, T>, id: string, record: T): void {
  if (RESERVED_RECORD_KEYS.has(id)) {
    throw new Error(`Record id "${id}" is reserved and cannot be used as a store key.`);
  }
  Object.defineProperty(all, id, { value: record, writable: true, enumerable: true, configurable: true });
}

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

  constructor(
    private readonly policy: DuplicateIdPolicy = 'overwrite',
    private readonly validateRecord?: (candidate: unknown) => candidate is T,
  ) {}

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
    const existing = this.records.get(id);
    if (existing === undefined) return null;
    if (this.validateRecord && !this.validateRecord(existing)) return null;
    return existing;
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
 *
 * `validateRecord`, when supplied, gates only what `get()` will hand back as
 * `T` — it never deletes anything. `put()`/`delete()` always operate on the
 * shape-sanitized-but-content-unvalidated raw collection (`readRawAll()`) so
 * a write for one id can never silently drop a sibling id's bytes just
 * because that sibling fails content validation.
 */
export class LocalRecordStore<T> implements KeyedRecordStore<T> {
  constructor(
    private readonly storageKey: string,
    private readonly policy: DuplicateIdPolicy = 'overwrite',
    private readonly validateRecord?: (candidate: unknown) => candidate is T,
  ) {}

  /** Flat dict, reserved keys stripped — but NOT content-validated. The true set of what storage holds. */
  private readRawAll(): Record<string, unknown> {
    return sanitizeRecordCollection<unknown>(readJSON<unknown>(this.storageKey, {}));
  }

  async put(id: string, record: T): Promise<void> {
    const rawAll = this.readRawAll();
    if (this.policy === 'reject-if-different' && Object.prototype.hasOwnProperty.call(rawAll, id)) {
      const existing = rawAll[id];
      const existingIsValid = this.validateRecord ? this.validateRecord(existing) : true;
      // An id already occupied by something we cannot even confirm is the same content
      // (invalid shape) must never be silently treated as free — that would let a fresh
      // put() quietly replace a corrupted piece of provenance under its own id.
      if (!existingIsValid || !sameContent(existing, record)) {
        throw new DuplicateRecordConflictError(id);
      }
    }
    setRecordEntry(rawAll, id, record as unknown);
    writeJSON(this.storageKey, rawAll);
  }

  async get(id: string): Promise<T | null> {
    const rawAll = this.readRawAll();
    if (!Object.prototype.hasOwnProperty.call(rawAll, id)) return null;
    const candidate = rawAll[id];
    if (this.validateRecord && !this.validateRecord(candidate)) return null;
    return candidate as T;
  }

  async list(): Promise<readonly string[]> {
    return Object.keys(this.readRawAll()).sort();
  }

  async delete(id: string): Promise<void> {
    const rawAll = this.readRawAll();
    delete rawAll[id];
    writeJSON(this.storageKey, rawAll);
  }
}
