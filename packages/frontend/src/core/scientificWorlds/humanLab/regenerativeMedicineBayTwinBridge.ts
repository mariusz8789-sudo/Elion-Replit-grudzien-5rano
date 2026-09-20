import type { HumanDigitalTwinManifest } from './types';

export interface RegenerativeBayTwinBinding {
  readonly twinId: string;
  readonly scale: 'REAL_WORLD_1_TO_1';
  readonly linked: true;
  readonly rootNodeId: string;
  readonly subjectId: string;
  readonly selectedNodeId: string;
}

/** Reuses the existing HumanDigitalTwin manifest. It never creates another patient/twin. */
export function bindExistingHumanTwinToRegenerativeBay(twin: HumanDigitalTwinManifest, subjectId = twin.twinId, selectedNodeId = twin.rootNodeId): RegenerativeBayTwinBinding {
  return {
    twinId: twin.twinId,
    scale: twin.scale,
    linked: true,
    rootNodeId: twin.rootNodeId,
    subjectId,
    selectedNodeId,
  };
}

export function bayInputsFromHumanTwin(twin: HumanDigitalTwinManifest, subjectId = twin.twinId): Readonly<Record<string, string | number | boolean>> {
  return {
    subjectId,
    twinId: twin.twinId,
    heightMeters: twin.parameters.heightMeters,
    massKg: twin.parameters.massKg,
    shoulderWidthMeters: twin.parameters.shoulderWidthMeters,
    eyeHeightMeters: twin.parameters.eyeHeightMeters,
    handSpanMeters: twin.parameters.handSpanMeters,
    footLengthMeters: twin.parameters.footLengthMeters,
  };
}

/** Deterministic bed anchor in bay-local metres. */
export function regenerativeBayTwinAnchor(): { readonly x: number; readonly y: number; readonly z: number; readonly yaw: number } {
  return { x: 0, y: 1.08, z: 0.05, yaw: 0 };
}
