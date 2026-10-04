import { InMemoryRecordStore, LocalRecordStore } from '../provenance/recordStore';
import type { DiscoveryCase, DiscoveryCaseStatus, LocalSimulationSnapshotPack } from './discoveryCase';
import { computeLocalSimulationSnapshotFingerprint } from './evidenceCrypto';

/**
 * LOCAL_SIMULATION_SNAPSHOT STORE — browser-local persistence for the
 * epidemic-city DEMO, and nothing else.
 *
 * ## THIS IS NOT GENESIS EVIDENCE, AND THIS IS NOT GENESIS REPLAY
 *
 * Canonical Genesis Evidence lives on the backend: one ledger
 * (`packages/backend/src/knowledgeApi.mjs`), proposed only from the ResearchRun
 * loop, replayed only by `packages/backend/src/campaign/verify.mjs`, and the
 * architectural invariants in `packages/backend/src/architecturalInvariants.test.mjs`
 * exist to keep it that way. What this module holds is a snapshot of a
 * browser-side epidemic-city simulation, written to the viewer's own
 * `localStorage`, readable by nobody else, on no device but theirs. It is a
 * demo artefact.
 *
 * The 2026-10-04 architecture audit found this cluster being read as a second
 * Evidence-and-Replay implementation, because it was named like one. The owner's
 * resolution was to rename rather than to delete, and to fix the vocabulary at
 * the root: the stored state is a **LOCAL_SIMULATION_SNAPSHOT**, the re-run is a
 * **DEMO_REPLAY**, and the words "Evidence" and "Replay" no longer name anything
 * this module owns — in code, in stored fields, or in the UI.
 *
 * ## DO NOT BUILD THE RESEARCHRUN MIGRATION NOW
 *
 * The full redirect of this surface into the canonical loop happens ONLY once the
 * epidemic scenario is a real ResearchRun. Until then this stays a browser-local
 * demo under an unambiguous name. A next session must not start that migration
 * here; see D-175 in `docs/DECISIONS.md`.
 *
 * ## What it actually is
 *
 * A small, swappable interface (save/load/list/delete) with two implementations —
 * `InMemoryLocalSimulationSnapshotStore` for tests,
 * `BrowserLocalSimulationSnapshotStore` for the app, backed by the same
 * `storage.ts` every other locally-persisted Genesis feature (onboarding,
 * discovery log) already uses.
 *
 * The FULL `DiscoveryCase` is stored, not just its `.snapshotPack` summary:
 * re-running a case later needs the actual per-arm run series and params
 * (`case.arms`), which the summary pack alone does not carry.
 */

/** Bumped only if the shape of a stored record changes in a way old records can't be read as. */
export const LOCAL_SIMULATION_SNAPSHOT_SCHEMA_VERSION = '2.0.0';

/**
 * The discriminant every stored record carries, so a reader can never mistake one
 * of these for a canonical Evidence Pack. The invariant test asserts on this exact
 * literal.
 */
export const LOCAL_SIMULATION_SNAPSHOT_KIND = 'LOCAL_SIMULATION_SNAPSHOT';

export interface LocalSimulationSnapshot {
  /** Always `LOCAL_SIMULATION_SNAPSHOT`. A record without it is rejected. */
  kind: typeof LOCAL_SIMULATION_SNAPSHOT_KIND;
  schemaVersion: string;
  record: DiscoveryCase;
  /**
   * SHA-256 over the snapshot pack's canonical content (see evidenceCrypto.ts) —
   * null if the pack was incomplete. A fingerprint of a browser-local demo
   * snapshot. It is NOT a signature: Genesis has no signing key, and canonical
   * evidence packages are UNSIGNED, described as fingerprints and replay.
   */
  snapshotFingerprint: string | null;
  /** Real git commit of the Genesis build that produced this run (see core/build/commitHash.ts). */
  codeCommitHash: string;
  savedAt: number;
}

export interface LocalSimulationSnapshotStore {
  save(entry: LocalSimulationSnapshot): Promise<void>;
  load(caseId: string): Promise<LocalSimulationSnapshot | null>;
  list(): Promise<readonly string[]>;
  delete(caseId: string): Promise<void>;
}

export interface LocalSimulationSnapshotValidation {
  valid: boolean;
  issues: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validates the persisted wrapper before any history, comparison or DEMO_REPLAY use.
 * This is deliberately a boundary check on a browser-local demo record, not a second
 * Evidence/Replay system: the in-process DiscoveryCase and its own demo re-run remain
 * the source of truth for this demo, and canonical Genesis Evidence is elsewhere
 * entirely (backend ledger).
 */
export async function validateLocalSimulationSnapshot(value: unknown): Promise<LocalSimulationSnapshotValidation> {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ['stored entry is not an object'] };
  if (value.kind !== LOCAL_SIMULATION_SNAPSHOT_KIND) issues.push(`kind must be ${LOCAL_SIMULATION_SNAPSHOT_KIND}`);
  if (value.schemaVersion !== LOCAL_SIMULATION_SNAPSHOT_SCHEMA_VERSION) issues.push('unsupported schemaVersion');
  if (!isRecord(value.record)) issues.push('missing record');
  if (typeof value.snapshotFingerprint !== 'string' && value.snapshotFingerprint !== null) issues.push('snapshotFingerprint must be string or null');
  if (typeof value.codeCommitHash !== 'string') issues.push('missing codeCommitHash');
  if (typeof value.savedAt !== 'number' || !Number.isFinite(value.savedAt)) issues.push('invalid savedAt');

  const record = value.record;
  if (isRecord(record)) {
    if (typeof record.caseId !== 'string' || record.caseId.trim() === '') issues.push('missing record.caseId');
    if (!Array.isArray(record.arms)) issues.push('missing record.arms');
    if (record.snapshotPack !== null && !isRecord(record.snapshotPack)) issues.push('invalid record.snapshotPack');
    if (record.snapshotPack === null && value.snapshotFingerprint !== null) issues.push('fingerprint exists without snapshotPack');
    if (isRecord(record.snapshotPack)) {
      if (!Array.isArray(record.snapshotPack.missingFields)) issues.push('invalid snapshotPack.missingFields');
      if (typeof record.snapshotPack.localSnapshotId !== 'string') issues.push('missing snapshotPack.localSnapshotId');
      if (typeof value.snapshotFingerprint !== 'string') issues.push('completed snapshotPack is missing snapshotFingerprint');
    }
  }

  if (issues.length === 0 && isRecord(record) && isRecord(record.snapshotPack) && typeof value.snapshotFingerprint === 'string') {
    try {
      const actual = await computeLocalSimulationSnapshotFingerprint(record.snapshotPack as unknown as LocalSimulationSnapshotPack);
      if (actual !== value.snapshotFingerprint) issues.push('snapshotFingerprint mismatch');
    } catch {
      issues.push('snapshotFingerprint verification unavailable');
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Both implementations below delegate to the shared `core/provenance/recordStore.ts`
 * primitive (Phase 0.1 convergence) with policy `'overwrite'` — the exact
 * permissive behavior this store always had (an experiment may be
 * re-saved/deleted under its own id; nothing here newly enforces
 * immutability). Only the get/put/list mechanics moved; the persisted shape,
 * storage key, and save/load/list/delete public API are unchanged.
 */
export class InMemoryLocalSimulationSnapshotStore implements LocalSimulationSnapshotStore {
  private backing = new InMemoryRecordStore<LocalSimulationSnapshot>('overwrite');

  async save(entry: LocalSimulationSnapshot): Promise<void> {
    await this.backing.put(entry.record.caseId, entry);
  }

  async load(caseId: string): Promise<LocalSimulationSnapshot | null> {
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
 * The storage key moved from `'evidence-store/v1'` to this one as part of the
 * 2026-10-04 renaming (D-175). That is deliberate and not a migration bug: a
 * record written under the old key was named as Evidence, and nothing is carried
 * forward under a name that claimed more than the record is. A viewer's old demo
 * snapshots are simply not read any more; there is nothing in them Genesis depends on.
 */
const STORAGE_KEY = 'local-simulation-snapshot/v1';

/** Persists demo simulation snapshots in localStorage — survives a refresh, stays on this device. */
export class BrowserLocalSimulationSnapshotStore implements LocalSimulationSnapshotStore {
  private backing = new LocalRecordStore<LocalSimulationSnapshot>(STORAGE_KEY, 'overwrite');

  async save(entry: LocalSimulationSnapshot): Promise<void> {
    await this.backing.put(entry.record.caseId, entry);
  }

  async load(caseId: string): Promise<LocalSimulationSnapshot | null> {
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
 * SNAPSHOT LIST ROW — a flat, list-friendly projection of a stored record.
 * Every field is read from data the browser-local demo engine (or this store)
 * already computed; nothing here is a second source of truth, and nothing here
 * is canonical Genesis Evidence.
 */
export interface LocalSimulationSnapshotSummary {
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

export function summarizeLocalSimulationSnapshot(entry: LocalSimulationSnapshot): LocalSimulationSnapshotSummary {
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
export async function listLocalSimulationSnapshots(store: LocalSimulationSnapshotStore): Promise<LocalSimulationSnapshotSummary[]> {
  const ids = await store.list();
  const entries = await Promise.all(ids.map((id) => store.load(id)));
  const checked = await Promise.all(entries.map(async (entry) => {
    if (entry === null) return null;
    const validation = await validateLocalSimulationSnapshot(entry);
    return validation.valid ? entry : null;
  }));
  return checked
    .filter((entry): entry is LocalSimulationSnapshot => entry !== null)
    .map(summarizeLocalSimulationSnapshot)
    .sort((a, b) => b.timestamp - a.timestamp);
}
