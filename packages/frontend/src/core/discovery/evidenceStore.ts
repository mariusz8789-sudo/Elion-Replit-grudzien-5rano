import { readJSON, writeJSON } from '../storage';
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

export class InMemoryEvidenceStore implements EvidenceStore {
  private records = new Map<string, StoredEvidence>();

  async save(entry: StoredEvidence): Promise<void> {
    this.records.set(entry.record.caseId, entry);
  }

  async load(caseId: string): Promise<StoredEvidence | null> {
    return this.records.get(caseId) ?? null;
  }

  async list(): Promise<readonly string[]> {
    return [...this.records.keys()].sort();
  }

  async delete(caseId: string): Promise<void> {
    this.records.delete(caseId);
  }
}

const STORAGE_KEY = 'evidence-store/v1';

/** Persists discovery cases (with their evidence) in localStorage — survives a refresh, stays on this device. */
export class LocalEvidenceStore implements EvidenceStore {
  private readAll(): Record<string, StoredEvidence> {
    return readJSON<Record<string, StoredEvidence>>(STORAGE_KEY, {});
  }

  async save(entry: StoredEvidence): Promise<void> {
    const all = this.readAll();
    all[entry.record.caseId] = entry;
    writeJSON(STORAGE_KEY, all);
  }

  async load(caseId: string): Promise<StoredEvidence | null> {
    return this.readAll()[caseId] ?? null;
  }

  async list(): Promise<readonly string[]> {
    return Object.keys(this.readAll()).sort();
  }

  async delete(caseId: string): Promise<void> {
    const all = this.readAll();
    delete all[caseId];
    writeJSON(STORAGE_KEY, all);
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
