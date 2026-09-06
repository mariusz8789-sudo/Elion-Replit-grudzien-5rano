import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Picking / Interaction Infrastructure
 *
 * Audit finding: `epidemicCity3D.ts` and `highFidelitySlice3D.ts` each independently hand-rolled
 * the exact same three pieces of picking boilerplate inside their own `pointer()` methods —
 * byte-for-byte identical in two places, a near-miss in a third:
 *
 *  1. Click-vs-drag detection (`pointerDown`/`pointerDragged` state, a `Math.hypot(...) > 6`
 *     threshold) — a raycast on pointer-up should only fire for an actual click, not the pointer-up
 *     that ends an orbit-control drag.
 *  2. Screen-space (x, y) → normalized device coordinates, the exact input `Raycaster.setFromCamera`
 *     needs.
 *  3. Walking up an `Object3D`'s `.parent` chain to find the ancestor actually carrying a semantic
 *     `userData` tag — three.js's raycast hit is always the leaf mesh, but the meaningful "what did
 *     I click" is usually tagged on a containing `Group` a few levels up.
 *
 * None of this is world semantics — deciding what a click on a tagged object MEANS (call
 * `selectAgent`, open an inspector, whatever) stays entirely the caller's business, same as
 * `stateVisualization.ts`'s own boundary. This module only owns the mechanical "where did the user
 * point, and what tagged thing (if any) is under it."
 */

/** Converts a screen-space point (canvas-relative pixels, y-down) into normalized device
 * coordinates ([-1, 1], y-up) — the exact input `THREE.Raycaster.setFromCamera` expects. Throws on
 * a zero/negative viewport rather than silently producing `Infinity`/`NaN` NDC values. */
export function screenToNDC(THREE: typeof THREE_NS, x: number, y: number, viewportWidth: number, viewportHeight: number): THREE_NS.Vector2 {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    throw new Error(`screenToNDC: viewport must be positive (got ${viewportWidth}x${viewportHeight})`);
  }
  return new THREE.Vector2((x / viewportWidth) * 2 - 1, -(y / viewportHeight) * 2 + 1);
}

/**
 * Raycasts from a screen-space point through `camera` against `targets`, combining
 * `screenToNDC` + `raycaster.setFromCamera` + `raycaster.intersectObjects` — the three calls every
 * current picking call site made together, in this order, every time.
 */
export function raycastFromScreenPoint(
  THREE: typeof THREE_NS,
  raycaster: THREE_NS.Raycaster,
  camera: THREE_NS.Camera,
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  targets: readonly THREE_NS.Object3D[],
  recursive = true,
): THREE_NS.Intersection[] {
  raycaster.setFromCamera(screenToNDC(THREE, x, y, viewportWidth, viewportHeight), camera);
  return raycaster.intersectObjects(targets as THREE_NS.Object3D[], recursive);
}

/**
 * Walks up from `object` through `.parent` until `predicate(node.userData)` is true, returning
 * that ancestor (or `null` if none matches, including when `object` itself is `null`). Generalizes
 * the `while (node && typeof node.userData.agentId !== 'number') node = node.parent` pattern found
 * duplicated (with a different tag key each time) across every current picking call site.
 */
export function findTaggedAncestor(
  object: THREE_NS.Object3D | null,
  predicate: (userData: Record<string, unknown>) => boolean,
): THREE_NS.Object3D | null {
  let node = object;
  while (node && !predicate(node.userData)) node = node.parent;
  return node;
}

/**
 * Distinguishes a genuine click from the pointer-up that ends a camera-orbit drag — the same
 * `down`/`move`/`up` event shape `Sim3D.pointer` already receives from `useThreeLoop.ts`. A raycast
 * pick should only fire on `up` when `wasDrag()` reports `false`; firing it after every drag would
 * re-select whatever happened to be under the cursor when the user let go of an orbit gesture.
 *
 * Stateful and tiny on purpose — one instance per scene, fed every `pointer()` call.
 */
export class ClickDragTracker {
  private downAt: { x: number; y: number } | null = null;
  private dragged = false;

  constructor(private readonly dragThresholdPx = 6) {}

  /** Feed every `down`/`move` event. Returns nothing — query `wasDrag()` on the matching `up`. */
  track(x: number, y: number, type: 'down' | 'move'): void {
    if (type === 'down') {
      this.downAt = { x, y };
      this.dragged = false;
      return;
    }
    if (this.downAt && Math.hypot(x - this.downAt.x, y - this.downAt.y) > this.dragThresholdPx) {
      this.dragged = true;
    }
  }

  /**
   * Call on the matching `up` event. Returns `true` if the pointer moved more than the drag
   * threshold since the last `down` (so the caller should skip raycasting), and resets state for
   * the next gesture either way.
   */
  finish(): boolean {
    const wasDrag = this.dragged;
    this.downAt = null;
    this.dragged = false;
    return wasDrag;
  }
}
