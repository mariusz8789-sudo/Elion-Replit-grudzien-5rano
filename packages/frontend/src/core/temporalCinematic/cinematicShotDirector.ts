import type { CameraKeyframe } from './cameraPath';

/** V6.1 — pure cinematic presentation math. No world state and no renderer ownership. */
export type CinematicViewMode = 'street' | 'interior';
export type CinematicShotName = 'ESTABLISH' | 'TRACK' | 'HERO' | 'DETAIL';

export interface CinematicShotProfile {
  readonly name: CinematicShotName;
  readonly fov: number;
  readonly dofEnabled: boolean;
  readonly focusDistance: number;
  readonly lateralDriftM: number;
  readonly verticalDriftM: number;
  readonly lookAheadScale: number;
}

export function resolveCinematicShot(seconds: number, durationSeconds: number, viewMode: CinematicViewMode): CinematicShotProfile {
  const duration = Math.max(0.001, durationSeconds);
  const u = Math.max(0, Math.min(1, seconds / duration));
  if (viewMode === 'interior') {
    if (u < 0.25) return { name: 'ESTABLISH', fov: 54, dofEnabled: false, focusDistance: 4.5, lateralDriftM: 0.08, verticalDriftM: 0.03, lookAheadScale: 1 };
    if (u < 0.75) return { name: 'TRACK', fov: 48, dofEnabled: true, focusDistance: 2.6, lateralDriftM: 0.12, verticalDriftM: 0.025, lookAheadScale: 1 };
    return { name: 'DETAIL', fov: 42, dofEnabled: true, focusDistance: 1.8, lateralDriftM: 0.05, verticalDriftM: 0.015, lookAheadScale: 0.8 };
  }
  if (u < 0.18) return { name: 'ESTABLISH', fov: 58, dofEnabled: false, focusDistance: 18, lateralDriftM: 0.08, verticalDriftM: 0.025, lookAheadScale: 1.2 };
  if (u < 0.72) return { name: 'TRACK', fov: 50, dofEnabled: false, focusDistance: 12, lateralDriftM: 0.12, verticalDriftM: 0.02, lookAheadScale: 1 };
  return { name: 'HERO', fov: 44, dofEnabled: true, focusDistance: 7.5, lateralDriftM: 0.06, verticalDriftM: 0.015, lookAheadScale: 0.9 };
}

/** Applies a tiny deterministic handheld/dolly drift to an already-real canonical camera keyframe. */
export function applyCinematicDrift(base: CameraKeyframe, seconds: number, shot: CinematicShotProfile): CameraKeyframe {
  const dx = Math.sin(seconds * 0.73) * shot.lateralDriftM;
  const dy = Math.sin(seconds * 0.41 + 0.7) * shot.verticalDriftM;
  const dz = Math.cos(seconds * 0.51) * shot.lateralDriftM * 0.35;
  const lookDx = (base.lookAt.x - base.position.x) * (shot.lookAheadScale - 1) * 0.15;
  const lookDz = (base.lookAt.z - base.position.z) * (shot.lookAheadScale - 1) * 0.15;
  return {
    ...base,
    position: { x: base.position.x + dx, y: base.position.y + dy, z: base.position.z + dz },
    lookAt: { x: base.lookAt.x + lookDx, y: base.lookAt.y, z: base.lookAt.z + lookDz },
  };
}
