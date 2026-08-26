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

/**
 * Local JSON can retain a value that was never constructed by the current
 * TypeScript boundary. This is structural protection only: it keeps an
 * unreadable HazardInput from reaching a module evaluator; admission and
 * fingerprint checks remain the canonical replay responsibilities.
 */
function isHazardInputRecord(candidate: unknown): candidate is HazardInput {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const input = candidate as Record<string, unknown>;
  const seed = input.seed;
  return (
    typeof input.hazardInputId === 'string' &&
    typeof input.hazardType === 'string' &&
    typeof input.sourceArtifactId === 'string' &&
    input.scientificFields !== null &&
    typeof input.scientificFields === 'object' &&
    !Array.isArray(input.scientificFields) &&
    (seed === null || typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed))) &&
    (input.displayName === null || typeof input.displayName === 'string') &&
    typeof input.inputFingerprint === 'string'
  );
}

function readableHazardInput(candidate: HazardInput | null): HazardInput | null {
  return isHazardInputRecord(candidate) ? candidate : null;
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
  getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId);
  }
  listArtifacts(): Promise<readonly string[]> {
    return this.artifacts.list();
  }

  putInput(input: HazardInput): Promise<void> {
    return this.inputs.put(input.hazardInputId, input);
  }
  async getInput(hazardInputId: string): Promise<HazardInput | null> {
    return readableHazardInput(await this.inputs.get(hazardInputId));
  }
  listInputs(): Promise<readonly string[]> {
    return this.inputs.list();
  }

  putRun(run: HazardRun): Promise<void> {
    return this.runs.put(run.hazardRunId, run);
  }
  getRun(hazardRunId: string): Promise<HazardRun | null> {
    return this.runs.get(hazardRunId);
  }
  listRuns(): Promise<readonly string[]> {
    return this.runs.list();
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
  getArtifact(artifactId: string): Promise<SourceArtifact | null> {
    return this.artifacts.get(artifactId);
  }
  listArtifacts(): Promise<readonly string[]> {
    return this.artifacts.list();
  }

  putInput(input: HazardInput): Promise<void> {
    return this.inputs.put(input.hazardInputId, input);
  }
  async getInput(hazardInputId: string): Promise<HazardInput | null> {
    return readableHazardInput(await this.inputs.get(hazardInputId));
  }
  listInputs(): Promise<readonly string[]> {
    return this.inputs.list();
  }

  putRun(run: HazardRun): Promise<void> {
    return this.runs.put(run.hazardRunId, run);
  }
  getRun(hazardRunId: string): Promise<HazardRun | null> {
    return this.runs.get(hazardRunId);
  }
  listRuns(): Promise<readonly string[]> {
    return this.runs.list();
  }
}
