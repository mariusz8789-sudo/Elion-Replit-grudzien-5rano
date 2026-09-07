import type { WorldCameraMode } from '../world/cameraPolicy';
import type { ViewpointKind } from './scenarioRequest';
import type { WorldBounds } from './scenarioWorld';

/**
 * LOOKING GLASS — PERSPECTIVES AS DATA.
 *
 * A perspective used to be a hint string ("street", "bench") looked up in a
 * hardcoded table of coordinates, which meant every new world had to invent
 * its own positions and every new vantage meant editing a switch. That is
 * the preset workaround this replaces.
 *
 * A perspective is now a DEFINITION — eye height, standoff, elevation,
 * mobility, what it is for — and a placement is DERIVED from it together
 * with the subject and the world's real extent. The same CITIZEN definition
 * therefore places correctly in a twelve-metre laboratory and a sixty-metre
 * city without either world knowing it exists.
 *
 * THE SEAM WITH THE GRAPHICS ENGINE. Looking Glass owns WHY a vantage is
 * useful and WHERE the subject is; the engine owns how a camera physically
 * gets there. `PerspectiveRequest` below is exactly the payload the engine's
 * camera rig consumes — intent, target, bounds, constraints — and nothing in
 * it is scientific. `placeCamera` computes a straightforward placement from
 * that request as a STAND-IN until the rig lands; when it does, this file
 * keeps the definitions and the request, and the placement function is
 * deleted rather than kept alongside.
 */

export type Mobility =
  /** Anchored to one spot — the premise of watching a world change around you. */
  | 'FIXED'
  /** On foot within the world. */
  | 'WALK'
  /** Following a road or route. */
  | 'VEHICLE'
  /** Unconstrained; not a person. */
  | 'FREE';

export interface PerspectiveDefinition {
  readonly kind: ViewpointKind;
  readonly label: string;
  /** What this vantage is FOR — the product reason it exists, not decoration. */
  readonly intent: string;
  /** Metres above the ground. Null where the vantage is not a person. */
  readonly eyeHeight: number | null;
  /**
   * Distance from the subject as a fraction of the world's largest extent, so
   * one definition works at laboratory and city scale alike.
   */
  readonly standoff: number;
  /** Downward tilt in radians. Zero is level with the subject. */
  readonly elevation: number;
  readonly mobility: Mobility;
  readonly cameraIntent: WorldCameraMode;
  /** A vantage that needs somewhere to stand cannot exist in a molecular world. */
  readonly requiresGround: boolean;
  /** Vertical field of view in degrees — a person's is narrower than a survey's. */
  readonly fov: number;
}

export const PERSPECTIVES: Readonly<Record<ViewpointKind, PerspectiveDefinition>> = {
  ANCHORED_HUMAN: {
    kind: 'ANCHORED_HUMAN', label: 'Mieszkaniec',
    intent: 'stand still at human height while the world changes around you',
    eyeHeight: 1.7, standoff: 0.22, elevation: 0.02, mobility: 'FIXED',
    cameraIntent: 'HUMAN_EYE', requiresGround: true, fov: 62,
  },
  DRIVER_POV: {
    kind: 'DRIVER_POV', label: 'Kierowca',
    intent: 'move through the world along its routes, seated and low',
    eyeHeight: 1.15, standoff: 0.3, elevation: 0.0, mobility: 'VEHICLE',
    cameraIntent: 'HUMAN_EYE', requiresGround: true, fov: 68,
  },
  SCIENTIST_POV: {
    kind: 'SCIENTIST_POV', label: 'Naukowiec',
    intent: 'work at arm’s length from the apparatus, eye level with it',
    eyeHeight: 1.7, standoff: 0.14, elevation: -0.04, mobility: 'WALK',
    cameraIntent: 'HUMAN_EYE', requiresGround: true, fov: 58,
  },
  OPERATOR_POV: {
    kind: 'OPERATOR_POV', label: 'Operator',
    intent: 'oversee the whole installation from a fixed control position',
    eyeHeight: 1.6, standoff: 0.34, elevation: 0.12, mobility: 'FIXED',
    cameraIntent: 'HUMAN_EYE', requiresGround: true, fov: 64,
  },
  RESPONDER_POV: {
    kind: 'RESPONDER_POV', label: 'Ratownik',
    intent: 'move toward the affected area at ground level',
    eyeHeight: 1.75, standoff: 0.26, elevation: 0.04, mobility: 'WALK',
    cameraIntent: 'HUMAN_EYE', requiresGround: true, fov: 66,
  },
  OBSERVER: {
    kind: 'OBSERVER', label: 'Obserwator',
    intent: 'follow the subject cinematically without standing anywhere in particular',
    eyeHeight: null, standoff: 0.45, elevation: 0.22, mobility: 'FREE',
    cameraIntent: 'CINEMATIC', requiresGround: false, fov: 48,
  },
  WIDE: {
    kind: 'WIDE', label: 'Panorama',
    intent: 'read the whole world at once and see spatial structure',
    eyeHeight: null, standoff: 0.95, elevation: 0.55, mobility: 'FREE',
    cameraIntent: 'WIDE', requiresGround: false, fov: 45,
  },
  MACRO: {
    kind: 'MACRO', label: 'Zbliżenie',
    intent: 'inspect one thing closely, at a scale a person could not stand at',
    eyeHeight: null, standoff: 0.06, elevation: 0.08, mobility: 'FREE',
    cameraIntent: 'MACRO', requiresGround: false, fov: 36,
  },
};

export type Vec3 = readonly [number, number, number];

/**
 * EXACTLY the payload the Graphics Engine camera rig consumes. No scientific
 * semantics cross this line: it carries a vantage, a point of interest and
 * the extent of the space, and nothing about what the subject means.
 */
export interface PerspectiveRequest {
  readonly kind: ViewpointKind;
  readonly cameraIntent: WorldCameraMode;
  /** What the vantage is looking at, in world units. */
  readonly target: Vec3;
  readonly bounds: WorldBounds;
  readonly eyeHeight: number | null;
  readonly standoff: number;
  readonly elevation: number;
  readonly fov: number;
  readonly mobility: Mobility;
  /** Azimuth the vantage approaches from, radians. Keeps a sequence coherent. */
  readonly azimuth: number;
}

export function perspectiveRequest(
  kind: ViewpointKind,
  target: Vec3,
  bounds: WorldBounds,
  azimuth = Math.PI / 4,
): PerspectiveRequest {
  const definition = PERSPECTIVES[kind];
  return {
    kind,
    cameraIntent: definition.cameraIntent,
    target,
    bounds,
    eyeHeight: definition.eyeHeight,
    standoff: definition.standoff,
    elevation: definition.elevation,
    fov: definition.fov,
    mobility: definition.mobility,
    azimuth,
  };
}

export interface PerspectivePlacement {
  readonly position: Vec3;
  readonly lookAt: Vec3;
  readonly fov: number;
  readonly mobility: Mobility;
}

/** Largest horizontal extent of a world — the scale everything is relative to. */
export function worldExtent(bounds: WorldBounds): number {
  return Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], 1);
}

/**
 * TEMPORARY. Derives a placement from the request so perspectives are usable
 * before the engine's camera rig exists. It is deliberately the simplest
 * correct thing — polar offset, ground clamp — rather than a second camera
 * system, and it is to be DELETED when the rig lands, not kept beside it.
 */
export function placeCamera(request: PerspectiveRequest): PerspectivePlacement {
  const extent = worldExtent(request.bounds);
  const distance = Math.max(0.8, extent * request.standoff);
  const [tx, ty, tz] = request.target;

  const horizontal = distance * Math.cos(request.elevation);
  const x = tx + Math.cos(request.azimuth) * horizontal;
  const z = tz + Math.sin(request.azimuth) * horizontal;

  // An embodied vantage stands on the ground at its own eye height; a free
  // one rises with the elevation angle. Conflating the two is what made a
  // "citizen" float above a city.
  const y = request.eyeHeight !== null
    ? request.bounds.min[1] + request.eyeHeight
    : ty + distance * Math.sin(request.elevation);

  return {
    position: [x, Math.min(y, request.bounds.max[1]), z],
    lookAt: [tx, request.eyeHeight !== null ? request.bounds.min[1] + request.eyeHeight * 0.9 : ty, tz],
    fov: request.fov,
    mobility: request.mobility,
  };
}
