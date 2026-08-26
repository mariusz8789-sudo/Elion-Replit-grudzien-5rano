/**
 * PHASE 0 — HAZARD PROVENANCE STORE.
 *
 * This is the domain-neutral generalization the audit doc asked for
 * ("Generalize the existing EvidenceStore/evidenceCrypto pattern behind a
 * domain-neutral interface before adding hazard evidence... Do not create a
 * third parallel evidence system.") It follows the exact same shape as
 * `core/discovery/evidenceStore.ts` — save/load/list, InMemory for tests and
 * a localStorage-backed implementation for the app, using the same
 * `core/storage.ts` primitives every other locally-persisted Genesis feature
 * uses — generalized to a content-addressable record instead of one
 * DiscoveryCase shape, and adding the one property the epidemic evidence
 * store never needed: immutability. A `SourceArtifact`, `HazardInput` or
 * `HazardRun` is frozen at creation (audit doc §8, "Fingerprints"); writing
 * the same id with different content is a bug, not an update, so it throws
 * rather than silently overwriting.
 *
 * The existing epidemic `EvidenceStore` is intentionally left untouched in
 * Phase 0 — migrating it onto this interface is a separate, later decision,
 * not required to avoid duplication (the duplication this generalizes away
 * is the STORE PATTERN and the HASHING PRIMITIVES, both reused here, not the
 * epidemic Discovery Engine's own data).
 */
import { canonicalJson } from '../events/hash';
import { readJSON, writeJSON } from '../storage';
import type { HazardInput, HazardRun, SourceArtifact } from './contracts';

export class ImmutableConflictError extends Error {
  constructor(public readonly id: string) {
    super(`Immutable hazard record "${id}" already exists with different content — refusing to overwrite.`);
    this.name = 'ImmutableConflictError';
  }
}

export interface ImmutableRecordStore<T> {
  /** Throws ImmutableConflictError if `id` already exists with different canonical content. Same content re-put is a harmless no-op. */
  put(id: string, record: T): Promise<void>;
  get(id: string): Promise<T | null>;
  list(): Promise<readonly string[]>;
}

function sameContent(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

export class InMemoryImmutableStore<T> implements ImmutableRecordStore<T> {
  private records = new Map<string, T>();

  async put(id: string, record: T): Promise<void> {
    const existing = this.records.get(id);
    if (existing !== undefined && !sameContent(existing, record)) {
      throw new ImmutableConflictError(id);
    }
    this.records.set(id, record);
  }

  async get(id: string): Promise<T | null> {
    return this.records.get(id) ?? null;
  }

  async list(): Promise<readonly string[]> {
    return [...this.records.keys()].sort();
  }
}

export class LocalImmutableStore<T> implements ImmutableRecordStore<T> {
  constructor(private readonly storageKey: string) {}

  private readAll(): Record<string, T> {
    return readJSON<Record<string, T>>(this.storageKey, {});
  }

  async put(id: string, record: T): Promise<void> {
    const all = this.readAll();
    const existing = all[id];
    if (existing !== undefined && !sameContent(existing, record)) {
      throw new ImmutableConflictError(id);
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
}

/** The three Phase 0 collections, kept separate because each has its own id namespace and shape. */
export interface HazardProvenanceStore {
  putArtifact(artifact: SourceArtifact): Promise<void>;
  getArtifact(artifactId: string): Promise<SourceArtifact | null>;
  listArtifacts(): Promise<readonly string[]>;

  putInput(input: HazardInput): Promise<void>;
  getInput(hazardInputId: string): Promise<HazardInput | null>;
  listInputs(): Promise<readonly string[]>;

  putRun(run: HazardRun): Promise<void>;
  getRun(hazardRunId: string): Promise<HazardRun | null>;
  listRuns(): Promise<readonly string[]>;
}

export class InMemoryHazardProvenanceStore implements HazardProvenanceStore {
  private artifacts = new InMemoryImmutableStore<SourceArtifact>();
  private inputs = new InMemoryImmutableStore<HazardInput>();
  private runs = new InMemoryImmutableStore<HazardRun>();

  putArtifact(artifact: SourceArtifact): Promise<void> { return this.artifacts.put(artifact.artifactId, artifact); }
  getArtifact(artifactId: string): Promise<SourceArtifact | null> { return this.artifacts.get(artifactId); }
  listArtifacts(): Promise<readonly string[]> { return this.artifacts.list(); }

  putInput(input: HazardInput): Promise<void> { return this.inputs.put(input.hazardInputId, input); }
  getInput(hazardInputId: string): Promise<HazardInput | null> { return this.inputs.get(hazardInputId); }
  listInputs(): Promise<readonly string[]> { return this.inputs.list(); }

  putRun(run: HazardRun): Promise<void> { return this.runs.put(run.hazardRunId, run); }
  getRun(hazardRunId: string): Promise<HazardRun | null> { return this.runs.get(hazardRunId); }
  listRuns(): Promise<readonly string[]> { return this.runs.list(); }
}

/** Persists Phase 0 provenance records in localStorage — survives a refresh, same device only, mirrors LocalEvidenceStore. */
export class LocalHazardProvenanceStore implements HazardProvenanceStore {
  private artifacts = new LocalImmutableStore<SourceArtifact>('hazard-provenance-store/artifacts/v1');
  private inputs = new LocalImmutableStore<HazardInput>('hazard-provenance-store/inputs/v1');
  private runs = new LocalImmutableStore<HazardRun>('hazard-provenance-store/runs/v1');

  putArtifact(artifact: SourceArtifact): Promise<void> { return this.artifacts.put(artifact.artifactId, artifact); }
  getArtifact(artifactId: string): Promise<SourceArtifact | null> { return this.artifacts.get(artifactId); }
  listArtifacts(): Promise<readonly string[]> { return this.artifacts.list(); }

  putInput(input: HazardInput): Promise<void> { return this.inputs.put(input.hazardInputId, input); }
  getInput(hazardInputId: string): Promise<HazardInput | null> { return this.inputs.get(hazardInputId); }
  listInputs(): Promise<readonly string[]> { return this.inputs.list(); }

  putRun(run: HazardRun): Promise<void> { return this.runs.put(run.hazardRunId, run); }
  getRun(hazardRunId: string): Promise<HazardRun | null> { return this.runs.get(hazardRunId); }
  listRuns(): Promise<readonly string[]> { return this.runs.list(); }
}
