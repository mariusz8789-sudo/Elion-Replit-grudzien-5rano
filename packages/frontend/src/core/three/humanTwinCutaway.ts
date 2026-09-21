import type * as THREE_NS from 'three';

/**
 * HUMAN DIGITAL TWIN — CUTAWAY / SECTION (D-131).
 *
 * Until now `cutawayEnabled` existed in the V3 anatomy state and in the visual-mode
 * contract (`clippingPlane`), but NOTHING in the renderer implemented it: no clipping
 * plane existed anywhere in the scene code, so the flag was dead state. This module
 * implements it for real, with three.js's own local clipping.
 *
 * WHAT A CUT SHOWS, HONESTLY. Clipping removes fragments in front of a plane; it does
 * not compute a cross-section of tissue. Cutting the twin reveals the organ proxies
 * inside it — which are atlas ellipsoids, not scanned anatomy. The cut is therefore a
 * SCHEMATIC SECTION of a model, and the HUD says so. Nothing here produces a medical
 * cross-section, and no session or evidence record is created by moving the plane.
 */

export type SectionAxis = 'SAGITTAL' | 'CORONAL' | 'AXIAL';

export interface CutawayState {
  readonly enabled: boolean;
  readonly axis: SectionAxis;
  /** Where the plane sits along its axis, 0..1 across the body's own bounds. 0.5 = mid-body. */
  readonly position: number;
  /** Flip which half is removed. */
  readonly flipped: boolean;
}

export const DEFAULT_CUTAWAY: CutawayState = { enabled: false, axis: 'SAGITTAL', position: 0.5, flipped: false };

/** The anatomical planes, as unit normals in the twin's own space (y up, z forward). */
const AXIS_NORMAL: Readonly<Record<SectionAxis, readonly [number, number, number]>> = {
  SAGITTAL: [1, 0, 0], // left / right
  CORONAL: [0, 0, 1],  // front / back
  AXIAL: [0, 1, 0],    // top / bottom
};

export const SECTION_AXIS_LABEL_PL: Readonly<Record<SectionAxis, string>> = {
  SAGITTAL: 'strzałkowy (lewo–prawo)',
  CORONAL: 'czołowy (przód–tył)',
  AXIAL: 'poprzeczny (góra–dół)',
};

export interface CutawayBounds {
  readonly minX: number; readonly maxX: number;
  readonly minY: number; readonly maxY: number;
  readonly minZ: number; readonly maxZ: number;
}

/** Bounds of the twin in world space; the plane's travel is expressed inside them, so it always cuts the body. */
export function measureCutawayBounds(THREE: typeof THREE_NS, object: THREE_NS.Object3D): CutawayBounds {
  const box = new THREE.Box3().setFromObject(object);
  return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
}

/**
 * The plane constant for a state within bounds. three.js clips away everything on the NEGATIVE
 * side of `normal·p + constant`, so `flipped` simply negates both.
 */
export function planeFromState(state: CutawayState, bounds: CutawayBounds): { normal: readonly [number, number, number]; constant: number } {
  const t = Math.max(0, Math.min(1, state.position));
  const n = AXIS_NORMAL[state.axis];
  const span = state.axis === 'SAGITTAL'
    ? { lo: bounds.minX, hi: bounds.maxX }
    : state.axis === 'CORONAL'
      ? { lo: bounds.minZ, hi: bounds.maxZ }
      : { lo: bounds.minY, hi: bounds.maxY };
  const at = span.lo + (span.hi - span.lo) * t;
  const sign = state.flipped ? -1 : 1;
  return { normal: [n[0] * sign, n[1] * sign, n[2] * sign], constant: -at * sign };
}

export interface CutawayHandle {
  /** The live plane; materials hold a reference to this object, so updates are free. */
  readonly plane: THREE_NS.Plane;
  /** A faint quad drawn at the cut so the section reads as deliberate, not as clipped-away geometry. */
  readonly indicator: THREE_NS.Mesh<THREE_NS.BufferGeometry, THREE_NS.MeshBasicMaterial>;
  apply(state: CutawayState, bounds: CutawayBounds): void;
  dispose(): void;
}

/**
 * Create the one section plane for a twin plus its visual indicator. The renderer must have
 * `localClippingEnabled = true`; the caller sets that once (see AgentLabScene3D).
 */
export function createCutaway(THREE: typeof THREE_NS, color = 0x7dd3fc): CutawayHandle {
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
  const geo = new THREE.PlaneGeometry(1.6, 2.4);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
  const indicator: THREE_NS.Mesh<THREE_NS.BufferGeometry, THREE_NS.MeshBasicMaterial> = new THREE.Mesh(geo, mat);
  indicator.name = 'twin:section-plane';
  indicator.visible = false;
  return {
    plane,
    indicator,
    apply(state, bounds) {
      const p = planeFromState(state, bounds);
      plane.normal.set(p.normal[0], p.normal[1], p.normal[2]);
      plane.constant = p.constant;
      indicator.visible = state.enabled;
      if (!state.enabled) return;
      // Sit the indicator on the plane, facing along its normal.
      const centre = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, (bounds.minZ + bounds.maxZ) / 2);
      const onPlane = plane.projectPoint(centre, new THREE.Vector3());
      indicator.position.copy(onPlane);
      indicator.lookAt(onPlane.clone().add(plane.normal));
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/**
 * Attach or detach the plane on every material of an object. Detaching restores the opaque path,
 * so a scene with the cutaway off costs exactly what it cost before this feature existed.
 */
export function setClippingOnObject(object: THREE_NS.Object3D, plane: THREE_NS.Plane | null): void {
  object.traverse((o) => {
    const mesh = o as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      const mat = m as THREE_NS.Material;
      mat.clippingPlanes = plane ? [plane] : null;
      mat.clipShadows = plane !== null;
      mat.needsUpdate = true;
    }
  });
}
