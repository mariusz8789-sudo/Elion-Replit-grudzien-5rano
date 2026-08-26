/**
 * PHASE 0 — HAZARD PROVENANCE CONTRACTS.
 *
 * Domain-neutral shapes only: no earthquake/flood/fire/weather/contamination
 * science lives here, and none is implied. These three contracts are the
 * frozen, fingerprinted building blocks a future hazard-specific scientific
 * module would plug into — see docs/PHASE0_HAZARD_PROVENANCE_FOUNDATION.md
 * for what is deliberately deferred (ExposureSnapshot, ImpactResult,
 * CascadeEdge, MultiHazardWorldState, any solver).
 *
 * Field split mirrors docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md §3.1/§8:
 * `SourceArtifact` = immutable captured data, `HazardInput` = canonical
 * scientific input referencing one artifact, `HazardRun` = immutable output
 * descriptor referencing one input. Nothing here reads or writes
 * EpidemicCitySimulation, resolveContacts, Hospital Model, Scenario Engine,
 * Discovery Engine, epidemic replay, or WorldEngineContract.
 */

/** Replay verdicts. A false MATCH is never acceptable — see hazardReplay.ts. */
export type HazardReplayStatus = 'MATCH' | 'DRIFT' | 'BLOCKED' | 'NOT_REPRODUCIBLE';

export interface GeoExtent {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SourceArtifactProvenance {
  readonly provider: string;
  readonly sourceUrl: string | null;
  /** When the provider says the data is from — not when Genesis fetched it. */
  readonly sourceTime: number | null;
  /** When Genesis captured/froze this artifact. */
  readonly retrievedAt: number;
  readonly license: string;
  /** Version of the adapter/normalizer that produced this artifact from raw provider output. */
  readonly adapterVersion: string;
}

/**
 * An immutable, frozen capture of external data. Replay reads this — and
 * only this — by `contentHash`; it never re-fetches a live endpoint (audit
 * doc §8, "Source artifact replay").
 */
export interface SourceArtifact {
  readonly artifactId: string;
  /** SHA-256 of the canonical raw content. Immutable once set. */
  readonly contentHash: string;
  /** EPSG code or similar, null when the artifact is not geospatial. */
  readonly crs: string | null;
  readonly extent: GeoExtent | null;
  /** Opaque reference to retained raw bytes (e.g. a local blob key) — never a live URL to re-fetch. */
  readonly rawContentRef: string;
  readonly provenance: SourceArtifactProvenance;
}

/**
 * Canonical scientific input for one hazard run request, referencing exactly
 * one frozen `SourceArtifact`. `scientificFields` and `displayName` are kept
 * apart deliberately: the fingerprint below covers only the former, so
 * renaming a run in the UI can never silently change what replay compares.
 */
export interface HazardInput {
  readonly hazardInputId: string;
  /** Free-form label (e.g. "earthquake"). No solver is selected or implied by this string in Phase 0. */
  readonly hazardType: string;
  readonly sourceArtifactId: string;
  /** Scientific/model-config fields only. Never a place for presentation values. */
  readonly scientificFields: Readonly<Record<string, unknown>>;
  readonly seed: number | string | null;
  /** Presentation-only. Excluded from inputFingerprint by construction — see fingerprint.ts. */
  readonly displayName: string | null;
  /** SHA-256 over canonical (hazardType, sourceArtifact contentHash, scientificFields, seed). Immutable once set. */
  readonly inputFingerprint: string;
}

/**
 * Immutable descriptor of one hazard run's output. In Phase 0 `outputFields`
 * comes only from a test-local deterministic reference evaluator (see
 * hazardReplay.ts) — never a real hazard solver.
 */
export interface HazardRun {
  readonly hazardRunId: string;
  readonly hazardInputId: string;
  /** Versioned independently of codeCommitHash — the audit doc treats normalization/model version as executable, not invisible. */
  readonly hazardModuleVersion: string;
  /** Reuses the existing build-time git provenance — see core/build/commitHash.ts. Not recomputed here. */
  readonly codeCommitHash: string;
  readonly outputFields: Readonly<Record<string, unknown>>;
  /** SHA-256 over canonical (hazardInputId, hazardModuleVersion, codeCommitHash, outputFields). Immutable once set. */
  readonly resultFingerprint: string;
  readonly status: 'COMPLETED' | 'FAILED';
  readonly createdAt: number;
}
