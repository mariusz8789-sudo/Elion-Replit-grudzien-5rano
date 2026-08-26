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
import { DuplicateRecordConflictError, InMemoryRecordStore, LocalRecordStore, type KeyedRecordStore } from '../provenance/recordStore';
import type { HazardInput, HazardRun, SourceArtifact } from './contracts';

export { DuplicateRecordConflictError as ImmutableConflictError };
export type ImmutableRecordStore<T> = KeyedRecordStore<T>;

/**
 * Minimal per-collection shape gates (see docs/PHASE0_2_PERSISTENCE_INTEGRITY.md).
 * Each checks only the identifying fields `hazardReplay.ts`/the registry
 * fence reads unconditionally — enough that a malformed or foreign-shaped
 * record is reported as absent (never thrown, never fabricated) instead of
 * flowing into fingerprint recomputation or a replay verdict.
 */
function isSourceArtifactShape(candidate: unknown): candidate is SourceArtifact {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  return typeof c.artifactId === 'string' && typeof c.contentHash === 'string' && typeof c.rawContentRef === 'string'
    && typeof c.provenance === 'object' && c.provenance !== null;
}

function isHazardInputShape(candidate: unknown): candidate is HazardInput {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  if (typeof c.hazardInputId !== 'string' || typeof c.hazardType !== 'string') return false;
  if (typeof c.sourceArtifactId !== 'string' || typeof c.inputFingerprint !== 'string') return false;
  // scientificFields is the actual scientific payload the fingerprint and every
  // evaluator read — a null/array/primitive here must never pass as a
  // retainable HazardInput, even when hazardInputId/inputFingerprint look fine.
  if (typeof c.scientificFields !== 'object' || c.scientificFields === null || Array.isArray(c.scientificFields)) return false;
  if (!(c.seed === null || typeof c.seed === 'number' || typeof c.seed === 'string')) return false;
  if (!(c.displayName === null || typeof c.displayName === 'string')) return false;
  return true;
}

function isHazardRunShape(candidate: unknown): candidate is HazardRun {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  return typeof c.hazardRunId === 'string' && typeof c.hazardInputId === 'string'
    && typeof c.hazardModuleVersion === 'string' && typeof c.codeCommitHash === 'string'
    && typeof c.resultFingerprint === 'string' && (c.status === 'COMPLETED' || c.status === 'FAILED');
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
  private artifacts = new InMemoryRecordStore<SourceArtifact>('reject-if-different', isSourceArtifactShape);
  private inputs = new InMemoryRecordStore<HazardInput>('reject-if-different', isHazardInputShape);
  private runs = new InMemoryRecordStore<HazardRun>('reject-if-different', isHazardRunShape);

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

/**
 * Persists Phase 0 provenance records in localStorage — survives a refresh,
 * same device only, mirrors LocalEvidenceStore. Uses three separate storage
 * keys (not `evidence-store/v1`) so a hazard record can never collide with,
 * or be misread as, an epidemic evidence record even if the same id string
 * were reused across domains.
 */
export class LocalHazardProvenanceStore implements HazardProvenanceStore {
  private artifacts = new LocalRecordStore<SourceArtifact>('hazard-provenance-store/artifacts/v1', 'reject-if-different', isSourceArtifactShape);
  private inputs = new LocalRecordStore<HazardInput>('hazard-provenance-store/inputs/v1', 'reject-if-different', isHazardInputShape);
  private runs = new LocalRecordStore<HazardRun>('hazard-provenance-store/runs/v1', 'reject-if-different', isHazardRunShape);

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
