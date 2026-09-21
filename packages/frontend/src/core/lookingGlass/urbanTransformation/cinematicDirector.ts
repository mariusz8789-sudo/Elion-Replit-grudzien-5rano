import { perspectiveRequest, placeCamera } from '../perspective';
import type { CameraPath, CameraPathPoint, TemporalLocationAnchor } from './contracts';
import type { ViewpointKind } from '../scenarioRequest';

/**
 * CINEMATIC DIRECTOR — builds a `CameraPath` by calling the EXISTING
 * `perspectiveRequest`/`placeCamera` (Looking Glass's own camera math) at a
 * sweeping azimuth over the clip's duration, rather than inventing a second
 * camera placement system. `placeCamera`'s own doc says it is a temporary
 * stand-in "to be DELETED when the rig lands, not kept beside it" — this
 * module inherits that same temporariness by construction, since it calls
 * nothing but `placeCamera`.
 */
export function generateCameraPath(anchor: TemporalLocationAnchor, viewpoint: ViewpointKind, durationSeconds: number, fps: number): CameraPath {
  const bounds = {
    min: [anchor.position[0] - anchor.extentMeters / 2, 0, anchor.position[2] - anchor.extentMeters / 2] as const,
    max: [anchor.position[0] + anchor.extentMeters / 2, 20, anchor.position[2] + anchor.extentMeters / 2] as const,
  };
  const frameCount = Math.max(1, Math.round(durationSeconds * fps));
  const points: CameraPathPoint[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = frameCount === 1 ? 0 : i / (frameCount - 1);
    // A full orbit over the clip for TIMELAPSE/TRANSFORMATION viewpoints
    // (ANCHORED_HUMAN), a fixed forward azimuth otherwise — matches
    // `anchor`'s own `yaw`, the direction the location is defined to face.
    const azimuth = viewpoint === 'ANCHORED_HUMAN' ? anchor.yaw + t * Math.PI * 2 : anchor.yaw;
    const req = perspectiveRequest(viewpoint, anchor.position, bounds, azimuth);
    const placement = placeCamera(req);
    points.push({ timestampSeconds: (i / fps), position: placement.position, target: placement.lookAt, fov: placement.fov });
  }
  return { points, viewpoint };
}
