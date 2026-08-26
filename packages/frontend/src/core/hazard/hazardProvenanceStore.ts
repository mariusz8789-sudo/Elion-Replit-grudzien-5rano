/**
 * PHASE 0 — HAZARD PROVENANCE STORE.
 *
 * Domain-neutral generalization the audit doc asked for ("Generalize the
 * existing EvidenceStore/evidenceCrypto pattern behind a domain-neutral
 * interface before adding hazard evidence... Do not create a third parallel
 * evidence system.")
 *
 * PHASE 0.1 UPDATE: the immutable get/put/list mechanics below are no longer
 * implemented twice. Both this store and the epidemic
 * `core/discovery/evidenceStore.ts` now delegate to the same
 * `core/provenance/recordStore.ts` primitive — this file only supplies the
 * hazard-specific policy choice (`'reject-if-different'`, i.e. immutable)
 * and the three hazard collections (artifacts/inputs/runs). See
 * docs/PHASE0_EVIDENCE_STORE_CONVERGENCE.md for what was deduplicated and
 * why the domain interfaces (`EvidenceStore` vs `HazardProvenanceStore`)
 * stay separate.
 *
 * `ImmutableConflictError` and `ImmutableRecordStore` are re-exported under
 * their original Phase 0 names so nothing that imported from this file
 * needs to change.
 */
import {
  DuplicateRecordConflictError,
  InMemoryRecordStore,
  LocalRecordStore,
  type KeyedRecordStore,
} from '../provenance/recordStore';
import type { HazardInput, HazardRun, SourceArtifact } from './contracts';

export { DuplicateRecordConflictError as ImmutableConflictError };
export type ImmutableRecordStore<T> = KeyedRecordStore<T>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Local JSON can retain a value that was never constructed by the current
 * TypeScript boundary. These are structural protections only: they keep an
 * unreadable record from reaching replay or a module evaluator; admission and
 * fingerprint checks remain the canonical replay responsibilities.
 */
function isHazardInputRecord(candidate: unknown): candidate is HazardInput {
  if (!isRecord(candidate)) return false;
  const input = candidate;
  const seed = input.seed;
  return (
    typeof input.hazardInputId === 'string' &&
    typeof input.hazardType === 'string' &&
    typeof input.sourceArtifactId === 'string' &&
    isRecord(input.scientificFields) &&
    (seed === null || typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed))) &&
    isNullableString(input.displayName) &&
    typeof input.inputFingerprint === 'string'
  );
}

function isSourceArtifactRecord(candidate: unknown): candidate is SourceArtifact {
  if (!isRecord(candidate) || !isRecord(candidate.provenance)) return false;
  const artifact = candidate;
  const provenance = artifact.provenance as Record<string, unknown>;
  const extent = artifact.extent;
  const validExtent =
    extent === null ||
    (isRecord(extent) &&
      [extent.minX, extent.minY, extent.maxX, extent.maxY].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      ));
  return (
    typeof artifact.artifactId === 'string' &&
    typeof artifact.contentHash === 'string' &&
    isNullableString(artifact.crs) &&
    validExtent &&
    typeof artifact.rawContentRef === 'string' &&
    typeof provenance.provider === 'string' &&
    isNullableString(provenance.sourceUrl) &&
    isNullableFiniteNumber(provenance.sourceTime) &&
    typeof provenance.retrievedAt === 'number' &&
    Number.isFinite(provenance.retrievedAt) &&
    provenance.retrievedAt >= 0 &&
    typeof provenance.license === 'string' &&
    typeof provenance.adapterVersion === 'string'
  );
}

function isHazardRunRecord(candidate: unknown): candidate is HazardRun {
  if (!isRecord(candidate)) return false;
  const run = candidate;
  return (
    typeof run.hazardRunId === 'string' &&
    typeof run.hazardInputId === 'string' &&
    typeof run.hazardModuleVersion === 'string' &&
    typeof run.codeCommitHash === 'string' &&
    isRecord(run.outputFields) &&
    typeof run.resultFingerprint === 'string' &&
    (run.status === 'COMPLETED' || run.status === 'FAILED') &&
    typeof run.createdAt === 'number' &&
    Number.isFinite(run.createdAt) &&
    run.createdAt >= 0
  );
}

function readableRecord<T>(candidate: T | null, isValid: (value: unknown) => value is T): T | null {
  return isValid(candidate) ? candidate : null;
}

/** Keeps the public list/get contract aligned without deleting unreadable retained bytes. */
async function readableIds<T>(
  ids: readonly string[],
  read: (id: string) => Promise<T | null>,
): Promise<readonly string[]> {
  const records = await Promise.all(ids.map(read));
  return ids.filter((_id, index) => records[index] !== null);
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
  private artifacts = new InMemoryRecordStore<SourceArtifact>('reject-if-different');
  private inputs = new InMemoryRecordStore<HazardInput>('reject-if-different');
  private runs = new InMemoryRecordStore<HazardRun>('reject-if-different');

  putArtifact(artifact: SourceArtifact): Promise<void> {
    return this.artifacts.put(artifact.artifactId, artifact);
  }
  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return readableRecord(await this.artifacts.get(artifactId), isSourceArtifactRecord);
  }
  async listArtifacts(): Promise<readonly string[]> {
    return readableIds(await this.artifacts.list(), (id) => this.getArtifact(id));
  }

  putInput(input: HazardInput): Promise<void> {
    return this.inputs.put(input.hazardInputId, input);
  }
  async getInput(hazardInputId: string): Promise<HazardInput | null> {
    return readableRecord(await this.inputs.get(hazardInputId), isHazardInputRecord);
  }
  async listInputs(): Promise<readonly string[]> {
    return readableIds(await this.inputs.list(), (id) => this.getInput(id));
  }

  putRun(run: HazardRun): Promise<void> {
    return this.runs.put(run.hazardRunId, run);
  }
  async getRun(hazardRunId: string): Promise<HazardRun | null> {
    return readableRecord(await this.runs.get(hazardRunId), isHazardRunRecord);
  }
  async listRuns(): Promise<readonly string[]> {
    return readableIds(await this.runs.list(), (id) => this.getRun(id));
  }
}

/**
 * Persists Phase 0 provenance records in localStorage — survives a refresh,
 * same device only, mirrors LocalEvidenceStore. Uses three separate storage
 * keys (not `evidence-store/v1`) so a hazard record can never collide with,
 * or be misread as, an epidemic evidence record even if the same id string
 * were reused across domains.
 */
export class LocalHazardProvenanceStore implements HazardProvenanceStore {
  private artifacts = new LocalRecordStore<SourceArtifact>(
    'hazard-provenance-store/artifacts/v1',
    'reject-if-different',
  );
  private inputs = new LocalRecordStore<HazardInput>(
    'hazard-provenance-store/inputs/v1',
    'reject-if-different',
  );
  private runs = new LocalRecordStore<HazardRun>('hazard-provenance-store/runs/v1', 'reject-if-different');

  putArtifact(artifact: SourceArtifact): Promise<void> {
    return this.artifacts.put(artifact.artifactId, artifact);
  }
  async getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return readableRecord(await this.artifacts.get(artifactId), isSourceArtifactRecord);
  }
  async listArtifacts(): Promise<readonly string[]> {
    return readableIds(await this.artifacts.list(), (id) => this.getArtifact(id));
  }

  putInput(input: HazardInput): Promise<void> {
    return this.inputs.put(input.hazardInputId, input);
  }
  async getInput(hazardInputId: string): Promise<HazardInput | null> {
    return readableRecord(await this.inputs.get(hazardInputId), isHazardInputRecord);
  }
  async listInputs(): Promise<readonly string[]> {
    return readableIds(await this.inputs.list(), (id) => this.getInput(id));
  }

  putRun(run: HazardRun): Promise<void> {
    return this.runs.put(run.hazardRunId, run);
  }
  async getRun(hazardRunId: string): Promise<HazardRun | null> {
    return readableRecord(await this.runs.get(hazardRunId), isHazardRunRecord);
  }
  async listRuns(): Promise<readonly string[]> {
    return readableIds(await this.runs.list(), (id) => this.getRun(id));
  }
}
