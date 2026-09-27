export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];
export type EpistemicStatus = 'MEASURED' | 'RECONSTRUCTED' | 'MODEL' | 'SIMULATION' | 'HYPOTHESIS';
export type EvidenceClass = 'PRIMARY' | 'DERIVED' | 'MODEL' | 'AXIOM_ASSUMPTION';

export interface ProvenanceRef {
  readonly sourceId: string;
  readonly sourceType: 'DATASET' | 'MODEL' | 'SIMULATION' | 'ASSET' | 'USER' | 'SYSTEM';
  readonly version?: string;
  readonly uri?: string;
}

export interface EvidenceEvent {
  readonly type: string;
  readonly stage: 'V6' | 'V6.1' | 'V7';
  readonly modelId: string;
  readonly inputFingerprint: string;
  readonly resultFingerprint: string;
  readonly epistemicStatus: EpistemicStatus;
  readonly evidenceClass: EvidenceClass;
  readonly provenance: readonly ProvenanceRef[];
}

export interface EvidenceSink { emit(event: EvidenceEvent): void }
export interface DeterministicPort { fingerprint(value: unknown): string; stableUnit(key: string): number }

export interface VisualEntityState {
  readonly entityId: string;
  readonly kind: string;
  readonly position: Vec3;
  readonly scale: Vec3;
  readonly labels: Readonly<Record<string, string>>;
  readonly scalarState: Readonly<Record<string, number>>;
  readonly visible: boolean;
}

export interface CameraState {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fovDegrees: number;
  readonly focusDistance: number;
  readonly apertureFStop: number;
  readonly exposureEv: number;
}

export interface RenderFrameProbe {
  readonly frameIndex: number;
  readonly visibleEntityIds: readonly string[];
  readonly camera: CameraState;
  readonly frameFingerprint: string;
  readonly temporalHistoryReset: boolean;
}

export interface CanonicalVisualRuntimePort {
  upsertEntity(entity: VisualEntityState): void;
  removeEntity(entityId: string): void;
  readEntity(entityId: string): VisualEntityState | undefined;
  applyCamera(camera: CameraState, temporalHistoryReset: boolean): void;
  captureFrame(frameIndex: number): RenderFrameProbe;
}
