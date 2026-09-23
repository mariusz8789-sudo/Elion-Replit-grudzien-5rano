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
  // A unit quad, scaled to the body's own extent on the plane, so the section frame always hugs the twin.
  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
  const indicator: THREE_NS.Mesh<THREE_NS.BufferGeometry, THREE_NS.MeshBasicMaterial> = new THREE.Mesh(geo, mat);
  indicator.name = 'twin:section-plane';
  indicator.visible = false;
  // A crisp frame at the cut: the faint fill alone reads as haze, the outline reads as a deliberate section.
  const edges = new THREE.EdgesGeometry(geo);
  const edgeMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
  const outline = new THREE.LineSegments(edges, edgeMat);
  outline.name = 'twin:section-outline';
  indicator.add(outline);
  const centre = new THREE.Vector3();
  const onPlane = new THREE.Vector3();
  const facing = new THREE.Vector3();
  return {
    plane,
    indicator,
    apply(state, bounds) {
      const p = planeFromState(state, bounds);
      plane.normal.set(p.normal[0], p.normal[1], p.normal[2]);
      plane.constant = p.constant;
      indicator.visible = state.enabled;
      if (!state.enabled) return;
      // `bounds` and the plane are in WORLD space (that is what material clipping uses), while the
      // indicator lives inside the twin's group. Position it through the parent, or it lands offset by
      // the chamber's own position.
      centre.set((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, (bounds.minZ + bounds.maxZ) / 2);
      plane.projectPoint(centre, onPlane);
      facing.copy(onPlane).add(plane.normal);
      const parent = indicator.parent;
      if (parent) { parent.updateMatrixWorld(true); indicator.position.copy(parent.worldToLocal(onPlane.clone())); } else indicator.position.copy(onPlane);
      indicator.lookAt(facing);
      const sx = bounds.maxX - bounds.minX; const sy = bounds.maxY - bounds.minY; const sz = bounds.maxZ - bounds.minZ;
      const [w, h] = state.axis === 'SAGITTAL' ? [sz, sy] : state.axis === 'CORONAL' ? [sx, sy] : [sx, sz];
      indicator.scale.set(Math.max(0.05, w * 1.08), Math.max(0.05, h * 1.04), 1);
    },
    dispose() { geo.dispose(); mat.dispose(); edges.dispose(); edgeMat.dispose(); },
  };
}

/**
 * While a cut is open, a single-sided shell shows nothing where it was cut: the viewer looks into a
 * hole. Rendering the back faces of the cut materials turns the opening into a readable shell wall.
 * The original side is remembered and restored exactly when the cut closes.
 */
const ORIGINAL_SIDE = new WeakMap<THREE_NS.Material, THREE_NS.Side>();
export function setSectionShellSides(THREE: typeof THREE_NS, materials: Iterable<THREE_NS.Material>, open: boolean): void {
  for (const m of materials) {
    if (open) {
      if (!ORIGINAL_SIDE.has(m)) ORIGINAL_SIDE.set(m, m.side);
      if (m.side !== THREE.DoubleSide) { m.side = THREE.DoubleSide; m.needsUpdate = true; }
    } else if (ORIGINAL_SIDE.has(m)) {
      const side = ORIGINAL_SIDE.get(m)!;
      ORIGINAL_SIDE.delete(m);
      if (m.side !== side) { m.side = side; m.needsUpdate = true; }
    }
  }
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
