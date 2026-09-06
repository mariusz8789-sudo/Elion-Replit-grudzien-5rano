import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — LOD + Culling
 *
 * The smallest real foundation for "can this population/scene stay
 * renderable when it gets much larger than today's demo": frustum culling,
 * distance culling, and projected-screen-size LOD tier selection, as pure,
 * allocation-conscious, GPU-independent math — every function here is
 * testable with plain numbers/a real `THREE.PerspectiveCamera` in Node,
 * with no renderer attached.
 *
 * This does NOT reimplement or fight three.js's own `InstancedMesh`
 * frustum culling — see `humanoidAgentVisual.ts`'s documented finding
 * (PERFORMANCE.md, "crowd frustum culling is disabled"): three.js's
 * default per-`InstancedMesh` check uses the base geometry's bounding
 * sphere, which ignores instance spread, so it can incorrectly cull an
 * entire scattered population. `PopulationLod` is the application-level
 * alternative: it tests each candidate's OWN world position/radius against
 * the real camera frustum, so a caller (e.g. a crowd's `update()`) can
 * decide per-instance whether to render/simplify/hide — correct regardless
 * of what any single `InstancedMesh`'s own bounding volume says, and
 * verifiable by unit test without a GPU.
 */

export type LodTierName = string;

export interface LodTier {
  /** Caller's own vocabulary, e.g. 'HIGH' | 'MEDIUM' | 'LOW' | 'IMPOSTOR'. */
  name: LodTierName;
  /** This tier applies when the candidate's projected screen size (px, tallest dimension) is >= this threshold. Pass tiers ordered from finest (largest threshold) to coarsest (smallest). */
  minProjectedSizePx: number;
}

export interface CullCandidate {
  id: string | number;
  position: THREE_NS.Vector3Tuple;
  /** Bounding-sphere radius (meters) — used for both frustum intersection and projected-size LOD. */
  radius: number;
}

export interface LodResult {
  id: string | number;
  /** Frustum + distance test only — never influenced by LOD tier configuration. */
  visible: boolean;
  distance: number;
  /** Approximate on-screen size in pixels (tallest dimension) — 0 when not visible. */
  projectedSizePx: number;
  /** `null` when not visible, tiers weren't supplied, or the candidate is smaller than every tier's threshold (caller's cue to skip/impostor it). */
  tier: LodTierName | null;
}

function distanceBetween(a: THREE_NS.Vector3Tuple, b: THREE_NS.Vector3Tuple): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Apparent on-screen size (px, tallest dimension) of a sphere of world
 * `radius` at `distance` from the camera, for a given vertical FOV and
 * viewport height. Standard perspective-projection size formula, derived
 * once and reused everywhere instead of re-deriving per caller:
 * `size = (radius * viewportHeightPx) / (distance * tan(fov/2))`.
 */
export function projectedScreenSizePx(radius: number, distance: number, verticalFovDegrees: number, viewportHeightPx: number): number {
  if (distance <= 0) return Number.POSITIVE_INFINITY; // camera is at/inside the object — treat as maximal detail, never divide by zero
  const fovRad = (verticalFovDegrees * Math.PI) / 180;
  return (radius * viewportHeightPx) / (distance * Math.tan(fovRad / 2));
}

/** First tier (in the given order) whose threshold the projected size still clears — `null` if it clears none. */
export function selectLodTier(projectedSizePx: number, tiers: readonly LodTier[]): LodTierName | null {
  for (const tier of tiers) {
    if (projectedSizePx >= tier.minProjectedSizePx) return tier.name;
  }
  return null;
}

/**
 * Reusable, allocation-free frustum test: owns its own scratch
 * `Frustum`/`Matrix4`/`Sphere`, recomputed from the camera's CURRENT
 * transform exactly once per `update()` call rather than once per
 * candidate — `isVisible` itself allocates nothing.
 */
export class FrustumCuller {
  private readonly frustum: THREE_NS.Frustum;
  private readonly matrix: THREE_NS.Matrix4;
  private readonly sphere: THREE_NS.Sphere;

  constructor(THREE: typeof THREE_NS) {
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
  }

  /** Recomputes the frustum from `camera`'s current world transform + projection. Call once per frame before any `isVisible` calls. */
  update(camera: THREE_NS.Camera): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
  }

  /** True when the given world-space bounding sphere intersects the last-`update()`d frustum. */
  isVisible(position: THREE_NS.Vector3Tuple, radius: number): boolean {
    return this.isVisibleXYZ(position[0], position[1], position[2], radius);
  }

  /** Same test as `isVisible`, taking raw coordinates instead of a tuple — for a hot per-instance loop that doesn't want to allocate an array literal per candidate. */
  isVisibleXYZ(x: number, y: number, z: number, radius: number): boolean {
    this.sphere.center.set(x, y, z);
    this.sphere.radius = radius;
    return this.frustum.intersectsSphere(this.sphere);
  }
}

export interface PopulationLodOptions {
  camera: THREE_NS.PerspectiveCamera;
  viewportHeightPx: number;
  /** Hard distance cull beyond which a candidate is never visible, regardless of frustum. Omit for no distance limit. */
  maxDistance?: number;
  /** Ordered finest -> coarsest. Omit (or pass `[]`) to skip LOD-tier assignment entirely (every visible candidate gets `tier: null`). */
  tiers?: readonly LodTier[];
}

/**
 * Per-frame visibility + LOD pass over a whole population in one call —
 * the "visibility → render set" / "distance/importance → representation"
 * seam. Returns one `LodResult` per candidate, in input order, so a caller
 * can zip it back against its own instance-index array (e.g. to decide
 * which `InstanceBatch`/`InstancedHumanoidCrowd` slots get a full pose
 * this frame and which get scaled to zero — see `instancing.ts`'s own
 * documented "scale to 0" hide convention).
 */
export class PopulationLod {
  private readonly culler: FrustumCuller;

  constructor(THREE: typeof THREE_NS) {
    this.culler = new FrustumCuller(THREE);
  }

  update(candidates: readonly CullCandidate[], options: PopulationLodOptions): LodResult[] {
    this.culler.update(options.camera);
    const cameraPos: THREE_NS.Vector3Tuple = [options.camera.position.x, options.camera.position.y, options.camera.position.z];
    const fov = options.camera.fov;
    const maxDistance = options.maxDistance ?? Number.POSITIVE_INFINITY;
    const tiers = options.tiers ?? [];

    return candidates.map((candidate): LodResult => {
      const distance = distanceBetween(cameraPos, candidate.position);
      const visible = distance <= maxDistance && this.culler.isVisible(candidate.position, candidate.radius);
      const projectedSizePx = visible ? projectedScreenSizePx(candidate.radius, distance, fov, options.viewportHeightPx) : 0;
      const tier = visible && tiers.length > 0 ? selectLodTier(projectedSizePx, tiers) : null;
      return { id: candidate.id, visible, distance, projectedSizePx, tier };
    });
  }
}
