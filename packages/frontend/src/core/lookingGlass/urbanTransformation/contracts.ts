import type { ViewpointKind } from '../scenarioRequest';

/**
 * URBAN TRANSFORMATION — the real domain binding for the `URBAN_TRANSFORMATION`
 * scenario kind `scenarioResolution.ts` has named since before this module
 * existed, with an explicit note that nothing routed to it yet
 * ("no standalone Looking Glass binding to route to it regardless"). This is
 * that binding — scoped honestly, not the full brief every future version of
 * this domain could eventually cover.
 *
 * WHAT THIS DELIBERATELY IS NOT: a second WorldGraph, a second camera system,
 * or a second NL request grammar. Locations are resolved into real WorldGraph
 * entities through the EXISTING `worldGenerator.ts` blueprint compiler; camera
 * vantages reuse `perspective.ts`'s `PerspectiveRequest`/`ViewpointKind`
 * vocabulary; the natural-language surface is a new grammar family because
 * `scenarioRequest.ts`'s own grammar has no year/date vocabulary at all — it
 * was never meant to parse a decade, only a scenario kind and a viewpoint. Real
 * geometry per architectural era, real historical archives, and a wired video
 * encoder do not exist in this environment; every place that would need one is
 * a named, honestly-reported gap below, not a silent stub.
 */

export const SUPPORTED_YEAR_RANGE = { min: 1900, max: 2026 } as const;

export type KnowledgeStatus = 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'ESTIMATED' | 'GENERATED' | 'UNKNOWN';

export interface HistoricalEntityTemporalValidity {
  readonly validFrom: number;
  /** Absent means "still standing/in service as of the supported range's upper bound". */
  readonly validTo?: number;
}

export interface HistoricalProvenance {
  readonly source: string;
  readonly knowledgeStatus: KnowledgeStatus;
  /** 0..1. Never fabricated precision — the era knowledge base only ever states 0.4/0.6/0.8, never e.g. 0.73. */
  readonly confidence: number;
  readonly generationMethod: 'ERA_LOOKUP' | 'INTERPOLATED';
}

export type HistoricalEntityKind = 'BUILDING' | 'VEHICLE' | 'POPULATION' | 'CLOTHING' | 'INFRASTRUCTURE' | 'ENVIRONMENT';

export interface HistoricalEntity {
  readonly id: string;
  readonly kind: HistoricalEntityKind;
  readonly label: string;
  /** World-space position; fixed across every year this entity's validity spans (stable spatial identity). */
  readonly position: readonly [number, number, number];
  readonly validity: HistoricalEntityTemporalValidity;
  readonly provenance: HistoricalProvenance;
  readonly attributes: Readonly<Record<string, string>>;
}

export interface TemporalLocationAnchor {
  readonly locationId: string;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  /** The bounds every resolved year's entities are placed within — fixed, so the same street stays the same street. */
  readonly extentMeters: number;
}

/* ---------------- Request ---------------- */

export type TemporalSceneType = 'WALK' | 'DRIVE' | 'STREET_VIEW' | 'AERIAL' | 'STATIC' | 'CINEMATIC' | 'TIMELAPSE' | 'TRANSFORMATION';

export interface TemporalSceneRequest {
  readonly prompt: string;
  readonly location: { readonly name: string } | null;
  readonly time: {
    readonly year?: number;
    readonly startYear?: number;
    readonly endYear?: number;
    readonly years?: readonly number[];
    readonly intervalYears?: number;
  };
  readonly scene: {
    readonly type: TemporalSceneType;
    readonly durationSeconds: number;
    readonly fps: number;
  };
  readonly atmosphere: {
    readonly weather?: string;
    readonly season?: string;
    readonly timeOfDay?: string;
  };
  readonly viewpoint: ViewpointKind;
}

/* ---------------- Resolved temporal world ---------------- */

export interface HistoricalWorldState {
  readonly locationId: string;
  readonly year: number;
  readonly anchor: TemporalLocationAnchor;
  readonly entities: readonly HistoricalEntity[];
  readonly worldGraphSnapshotId: string;
}

export type ConsistencyViolationKind = 'INVALID_TEMPORAL_ENTITY' | 'BROKEN_SPATIAL_ANCHOR';

export interface ConsistencyViolation {
  readonly kind: ConsistencyViolationKind;
  readonly entityId: string;
  readonly year: number;
  readonly reason: string;
}

export interface ConsistencyResult {
  readonly ok: boolean;
  readonly violations: readonly ConsistencyViolation[];
}

/* ---------------- Camera / frames ---------------- */

export interface CameraPathPoint {
  readonly timestampSeconds: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

export interface CameraPath {
  readonly points: readonly CameraPathPoint[];
  readonly viewpoint: ViewpointKind;
}

export type FrameSource = 'CAPTURED' | 'NOT_RENDERED';

export interface FrameArtifact {
  readonly year: number;
  readonly timestampSeconds: number;
  readonly source: FrameSource;
  /** Only present when `source === 'CAPTURED'`. A real PNG byte length, never fabricated. */
  readonly byteLength?: number;
  readonly note: string;
}

export type VideoEncoderStatus = 'AVAILABLE' | 'BLOCKED_BY_RUNTIME';

export interface VideoArtifact {
  readonly status: VideoEncoderStatus;
  readonly format: 'MP4' | 'WEBM' | 'IMAGE_SEQUENCE';
  readonly frameCount: number;
  readonly note: string;
}

/* ---------------- Result ---------------- */

export type TemporalCinematicStatus = 'COMPLETED' | 'PARTIAL' | 'BLOCKED' | 'FAILED';

export interface TemporalCinematicResult {
  readonly requestId: string;
  readonly status: TemporalCinematicStatus;
  readonly temporalStates: readonly HistoricalWorldState[];
  readonly frames: readonly FrameArtifact[];
  readonly video: VideoArtifact | null;
  readonly cameraPath: CameraPath | null;
  readonly assumptions: readonly string[];
  readonly unresolved: readonly string[];
  readonly confidence: number;
  readonly fingerprint: string;
}
