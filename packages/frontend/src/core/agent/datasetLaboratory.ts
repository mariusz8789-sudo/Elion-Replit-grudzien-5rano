import type { ExperimentRunStatus } from '../experimentFabric/types';
import type { ExternalDatasetProvenance } from './externalDatasetCase';

/**
 * P0.1 (Discovery Engine, `docs/DISCOVERY_ENGINE_FINAL_CLASSIFICATION_2026-09-12.md`
 * section 4/7) — the narrow seam that lets an autonomous discovery loop take a
 * PINNED REAL DATASET as its observation source, the one gap that blocked
 * `agent/inquiryLoop.ts`/`agent/discoveryLoop.ts` from running on real data:
 * both require `hiddenParameters`/`buildWorld()`, i.e. something simulatable.
 *
 * This is NOT a new engine and NOT a generalized 17-domain plugin system.
 * It is one declared contract with, for P0, exactly one implementation
 * (`biotechData/qe4DatasetLaboratory.ts`) — the same relationship
 * `backend/campaign/toolchain.mjs` already has to its 8 distinct science
 * tools (one shared shape, N independent implementations, zero monolith).
 * Generalizing this contract to other pinned datasets (CMS, ChEMBL, Kepler)
 * is P2, explicitly deferred.
 *
 * A `DatasetLaboratory` NEVER computes anything itself — every field on
 * `DatasetLaboratoryResult` is copied from a value some existing, already-
 * verified module already produced. This module is pure glue, exactly like
 * `biotechData/qe4EvidenceCase.ts` is pure glue over `qe4BrydgesAnalysis.ts`.
 */

export const DATASET_LABORATORY_CONTRACT_VERSION = '1.0.0';

/** One declared, real observation point in the dataset's own grid — never invented. */
export interface DatasetObservablePoint {
  readonly pointId: string;
  /** Human-readable, e.g. "clean 10-ion chain, T=5ms, k=5". */
  readonly label: string;
}

export interface DatasetLaboratoryConfig {
  readonly pointId: string;
}

export interface DatasetLaboratoryObservation {
  readonly pointId: string;
  readonly metric: string;
  readonly value: number;
  readonly uncertainty: number;
}

export interface DatasetLaboratoryReplay {
  readonly inputs: Readonly<Record<string, unknown>>;
  /** Non-null only when the underlying computation is itself seeded (e.g. a bootstrap RNG). */
  readonly seed: number | null;
}

export interface DatasetLaboratoryResult {
  readonly contractVersion: string;
  readonly labId: string;
  readonly status: ExperimentRunStatus;
  /** Null exactly when `status !== 'completed'` — never a fabricated placeholder observation. */
  readonly observation: DatasetLaboratoryObservation | null;
  readonly provenance: ExternalDatasetProvenance;
  readonly fingerprint: string;
  readonly replay: DatasetLaboratoryReplay;
  /** Set only on a rejected/unavailable point; explains why, never silently null. */
  readonly rejectedReason: string | null;
}

/**
 * `run` and `observableSpec` are deliberately synchronous, pure functions of
 * `(config, seed)` and of the pinned data respectively — no I/O, no network,
 * matching every other reused foundation this module sits on
 * (`fnv1a`/`canonicalJson`, `beliefRevision`, `tautologyGate`).
 */
export interface DatasetLaboratory {
  readonly labId: string;
  readonly observableSpec: () => readonly DatasetObservablePoint[];
  readonly run: (config: DatasetLaboratoryConfig, seed?: number) => DatasetLaboratoryResult;
}
