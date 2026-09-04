/**
 * PHASE 0 / EARTHQUAKE VERTICAL SLICE — HAZARD PROVENANCE CONTRACTS.
 *
 * Domain-neutral shapes: no earthquake-specific science lives in this file.
 * `SourceArtifact`/`HazardInput`/`HazardRun` (Phase 0) plus `ExposureSnapshot`/
 * `ImpactResult` (added for the earthquake vertical slice, see
 * docs/EARTHQUAKE_VERTICAL_SLICE.md) are the frozen, fingerprinted building
 * blocks any hazard-specific scientific module plugs into. `CascadeEdge` and
 * `MultiHazardWorldState` remain deliberately deferred — see
 * docs/PHASE0_HAZARD_PROVENANCE_FOUNDATION.md.
 *
 * Field split mirrors docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md §3.1/§8:
 * `SourceArtifact` = immutable captured data, `HazardInput` = canonical
 * scientific input referencing one artifact, `HazardRun` = immutable output
 * descriptor referencing one input, `ExposureSnapshot` = versioned
 * asset/location references independent of any one hazard's physics,
 * `ImpactResult` = a scientific-module-owned projection of one `HazardRun`
 * onto one `ExposureSnapshot`. Nothing here reads or writes
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

/**
 * The audit doc's mandatory status vocabulary (§6, "Main risks and required
 * controls" — "Mandatory status labels"). Every exposure/impact record below
 * carries one of these; a vertical slice built on unreviewed, synthetic
 * fixture data must always read `'SCENARIO'`, never `'OBSERVED'`.
 */
export type HazardDatasetStatus = 'OBSERVED' | 'FORECAST' | 'SCENARIO' | 'VISUAL_ONLY' | 'NOT_MODELED';

/** One location/asset a hazard's impact can be evaluated against. Coordinates are an opaque local frame, not asserted geodesy. */
export interface ExposureSite {
  readonly siteId: string;
  readonly assetLabel: string;
  readonly vulnerabilityClass: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly x: number;
  readonly y: number;
}

/**
 * Versioned asset/location references a `HazardRun`'s output can be
 * projected onto. Deliberately independent of any one hazard's physics
 * (audit doc: "Versioned asset/population/location references and mapping
 * method" / prohibited: "Treating synthetic CityWorld locations as real
 * facilities" — `datasetStatus` exists precisely so this can never be
 * silently read as `'OBSERVED'`).
 */
export interface ExposureSnapshot {
  readonly exposureSnapshotId: string;
  readonly mappingMethod: string;
  readonly sites: readonly ExposureSite[];
  readonly datasetStatus: HazardDatasetStatus;
}

export type ImpactSeverityClass = 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';

/**
 * A scientific module's projection of one `HazardRun` onto one site of one
 * `ExposureSnapshot`. Audit doc: "Explicit result type, severity/unit,
 * confidence or uncertainty, provenance links" / prohibited: "Converting a
 * visual intensity into a modeled impact" — this flows science → visualization
 * only, never the reverse, and `uncertainty` is mandatory rather than a bare
 * point estimate.
 */
export interface ImpactResult {
  readonly impactResultId: string;
  readonly hazardRunId: string;
  readonly exposureSnapshotId: string;
  readonly siteId: string;
  readonly resultType: string;
  readonly severity: ImpactSeverityClass;
  readonly severityValue: number;
  readonly uncertainty: { readonly low: number; readonly high: number };
  readonly datasetStatus: HazardDatasetStatus;
  readonly provenance: { readonly hazardRunId: string; readonly hazardModuleVersion: string };
}

/**
 * A `DamageAssessment` is the NEXT layer beyond `ImpactResult`: structural
 * damage state, collapse probability, casualties, or infrastructure damage —
 * as opposed to `ImpactResult`'s ground-motion/hazard-intensity severity.
 * Genesis has no calibrated fragility/vulnerability model, no building
 * inventory, no occupancy data and no domain-expert review for any of this,
 * so `status` today can only ever be `'NOT_MODELED'` — there is no field or
 * code path anywhere that can set it to anything else. Fabricating a damage
 * number from `ImpactResult.severityValue` alone (a proxy for shaking
 * intensity, not for what a building actually does under that shaking) is
 * exactly the "false precision" risk this contract exists to make
 * structurally impossible: a caller can read `status` and `requiredData` and
 * know, without guessing, that no damage claim is being made and precisely
 * what would need to exist before one honestly could.
 */
export type DamageAssessmentStatus = 'NOT_MODELED';

/** One concrete missing model or dataset, and why it is required. Never a vague placeholder string. */
export interface DamageAssessmentRequirement {
  readonly requirement: string;
  readonly rationale: string;
}

export interface DamageAssessment {
  readonly damageAssessmentId: string;
  readonly hazardRunId: string;
  readonly impactResultId: string;
  readonly siteId: string;
  readonly status: DamageAssessmentStatus;
  readonly notModeledReason: string;
  readonly requiredData: readonly DamageAssessmentRequirement[];
  readonly datasetStatus: HazardDatasetStatus;
  readonly provenance: { readonly hazardRunId: string; readonly hazardModuleVersion: string };
}
