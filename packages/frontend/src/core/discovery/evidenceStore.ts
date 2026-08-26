import { InMemoryRecordStore, LocalRecordStore } from '../provenance/recordStore';
import type { DiscoveryCase, DiscoveryCaseStatus } from './discoveryCase';

/**
 * EVIDENCE STORE — the persistence Genesis's Discovery Engine never had.
 *
 * `runDiscoveryCase()` already returns a complete, evidence-verified
 * `DiscoveryCase` (comparison + replay + evidence pack, all real). Nothing
 * about that pipeline is duplicated here. What was missing is somewhere to
 * put the result: today a `DiscoveryCase` lives only in whatever React state
 * happens to hold it and is gone on refresh — there was no way to come back
 * later and press "replay". This is a small, swappable interface
 * (save/load/list/delete) with two implementations — `InMemoryEvidenceStore`
 * for tests, `LocalEvidenceStore` for the app, backed by the same
 * `storage.ts` every other locally-persisted Genesis feature (onboarding,
 * discovery log) already uses. Swapping in a real backend later means
 * writing one more class against this same interface, not touching any
 * caller.
 *
 * The FULL `DiscoveryCase` is stored, not just its `.evidence` summary pack:
 * replaying an experiment later needs the actual per-arm run series and
 * params (`case.arms`), which the evidence pack alone does not carry.
 */

/** Bumped only if the shape of a stored record changes in a way old records can't be read as. */
export const EVIDENCE_STORE_SCHEMA_VERSION = '1.0.0';

export interface StoredEvidence {
  schemaVersion: string;
  record: DiscoveryCase;
  /** SHA-256 of record.evidence's canonical content (see evidenceCrypto.ts) — null if evidence was incomplete. */
  sha256: string | null;
  /** Real git commit of the Genesis build that produced this run (see core/build/commitHash.ts). */
  codeCommitHash: string;
  savedAt: number;
}

export interface EvidenceStore {
  save(entry: StoredEvidence): Promise<void>;
  load(caseId: string): Promise<StoredEvidence | null>;
  list(): Promise<readonly string[]>;
  delete(caseId: string): Promise<void>;
}

/**
 * Minimal shape gate for a persisted record read back as `unknown` (see
 * docs/PHASE0_2_PERSISTENCE_INTEGRITY.md). Not a schema library — just the
 * handful of fields every consumer (`summarizeStoredEvidence`, replay) reads
 * unconditionally, so a legacy-correct record still passes and a malformed
 * or semantically-wrong one is reported as absent rather than crashing a
 * caller on `undefined.caseId`.
 */
function isStoredEvidenceShape(candidate: unknown): candidate is StoredEvidence {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const c = candidate as Record<string, unknown>;
  if (typeof c.schemaVersion !== 'string' || typeof c.codeCommitHash !== 'string' || typeof c.savedAt !== 'number') return false;
  if (c.sha256 !== null && typeof c.sha256 !== 'string') return false;
  if (typeof c.record !== 'object' || c.record === null) return false;
  return typeof (c.record as Record<string, unknown>).caseId === 'string';
}

/**
 * Both implementations below delegate to the shared `core/provenance/recordStore.ts`
 * primitive (Phase 0.1 convergence) with policy `'overwrite'` — the exact
 * permissive behavior this store always had (an experiment may be
 * re-saved/deleted under its own id; nothing here newly enforces
 * immutability). Only the get/put/list mechanics moved; the persisted shape,
 * storage key, and save/load/list/delete public API are unchanged.
 */
export class InMemoryEvidenceStore implements EvidenceStore {
  private backing = new InMemoryRecordStore<StoredEvidence>('overwrite', isStoredEvidenceShape);

  async save(entry: StoredEvidence): Promise<void> {
    await this.backing.put(entry.record.caseId, entry);
  }

  async load(caseId: string): Promise<StoredEvidence | null> {
    return this.backing.get(caseId);
  }

  async list(): Promise<readonly string[]> {
    return this.backing.list();
  }

  async delete(caseId: string): Promise<void> {
    await this.backing.delete(caseId);
  }
}

const STORAGE_KEY = 'evidence-store/v1';

/** Persists discovery cases (with their evidence) in localStorage — survives a refresh, stays on this device. */
export class LocalEvidenceStore implements EvidenceStore {
  private backing = new LocalRecordStore<StoredEvidence>(STORAGE_KEY, 'overwrite', isStoredEvidenceShape);

  async save(entry: StoredEvidence): Promise<void> {
    await this.backing.put(entry.record.caseId, entry);
  }

  async load(caseId: string): Promise<StoredEvidence | null> {
    return this.backing.get(caseId);
  }

  async list(): Promise<readonly string[]> {
    return this.backing.list();
  }

  async delete(caseId: string): Promise<void> {
    await this.backing.delete(caseId);
  }
}

/**
 * EXPERIMENT REGISTRY — a flat, list-friendly projection of a stored record.
 * Every field is read from data the Discovery Engine (or this store) already
 * computed; nothing here is a second source of truth.
 */
export interface ExperimentRegistryEntry {
  experimentId: string;
  scenarioId: string;
  seed: number;
  modelVersion: string;
  codeCommitHash: string;
  inputFingerprint: string;
  /** Case-level fingerprint combining both arms' results (DiscoveryCase.runFingerprint) — null if a run failed. */
  resultFingerprint: string | null;
  timestamp: number;
  status: DiscoveryCaseStatus;
  provenance: {
    modelId: string;
    engine: string;
    domainId: string;
    codeCommitHash: string;
  };
}

export function summarizeStoredEvidence(entry: StoredEvidence): ExperimentRegistryEntry {
  const { record } = entry;
  return {
    experimentId: record.caseId,
    scenarioId: `${record.scenarios.baseline}→${record.scenarios.variant}`,
    seed: record.seed,
    modelVersion: record.model.modelVersion,
    codeCommitHash: entry.codeCommitHash,
    inputFingerprint: record.inputFingerprint,
    resultFingerprint: record.runFingerprint,
    timestamp: entry.savedAt,
    status: record.status,
    provenance: {
      modelId: record.model.modelId,
      engine: record.model.engine,
      domainId: record.model.domainId,
      codeCommitHash: entry.codeCommitHash,
    },
  };
}

/** Every saved experiment as a registry entry, newest first. */
export async function listExperimentRegistry(store: EvidenceStore): Promise<ExperimentRegistryEntry[]> {
  const ids = await store.list();
  const entries = await Promise.all(ids.map((id) => store.load(id)));
  return entries
    .filter((entry): entry is StoredEvidence => entry !== null)
    .map(summarizeStoredEvidence)
    .sort((a, b) => b.timestamp - a.timestamp);
}
