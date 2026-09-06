import type * as THREE_NS from 'three';
import type { WorldFrameEntityId } from './worldFrame';
import { raycastFromScreenPoint, ClickDragTracker } from './picking';

/**
 * GENESIS GRAPHICS RUNTIME — Interaction Foundation
 *
 * The visual interaction layer a world-builder needs to answer "what did the user just point at /
 * click," expressed in terms of WorldFrame entity ids rather than raw three.js objects — composed
 * entirely from already-proven pieces (`picking.ts`'s raycasting mechanics + `ClickDragTracker`,
 * `worldFrameRenderer.ts`'s new `resolveEntityId`), not a new picking implementation.
 *
 * This module has NO business logic. It never decides what "selecting" an entity MEANS (open an
 * inspector panel, highlight it, log an analytics event) — that is entirely the caller's business,
 * supplied via `onHoverChange`/`onSelect` callbacks. It only owns the mechanical pipeline: screen
 * point -> raycast -> intersected object -> WorldFrame entity id -> hover/select state transition.
 *
 * CAVEAT (matches any raw `THREE.Raycaster` use, not specific to this module): raycasting reads
 * each object's `matrixWorld`, which only `WebGLRenderer.render()` keeps current automatically. In
 * a normal `Sim3D` scene this is a non-issue (a pointer event always lands after at least one real
 * frame has rendered), but a caller driving this controller OUTSIDE a render loop — a test, or a
 * pointer handler that can fire before the first frame — must call `scene.updateMatrixWorld(true)`
 * itself first, or a just-moved/just-added object raycasts against its stale (possibly identity)
 * transform.
 */

/** The minimal shape this module needs from a renderer — satisfied by `WorldFrameRenderer` itself,
 * so a caller passes the renderer directly, but a test (or a future non-WorldFrame consumer) can
 * satisfy this with a plain object instead of constructing a whole renderer. */
export interface EntityResolver {
  resolveEntityId(intersection: THREE_NS.Intersection): WorldFrameEntityId | null;
}

export interface InteractionControllerOptions {
  camera: THREE_NS.Camera;
  resolver: EntityResolver;
  /** Live accessor for the current pickable target list — a function, not a fixed array, since a
   * scene's target set commonly grows after construction (new buildings/assets loading in). */
  getTargets: () => readonly THREE_NS.Object3D[];
  /** Forwarded to `raycaster.intersectObjects`. Default `true` — the common case, since a WorldFrame
   * entity's tagged root is often several levels above the leaf mesh a raycast actually hits. */
  recursive?: boolean;
  /** Pixel distance beyond which a pointer-down-to-up gesture counts as a drag, not a click — see
   * `ClickDragTracker`. Default 6 (that class's own default). */
  dragThresholdPx?: number;
  /** Called whenever the hovered entity id changes (including transitions to/from `null`). */
  onHoverChange?: (id: WorldFrameEntityId | null) => void;
  /** Called on a genuine click (pointer-up that wasn't a drag), with the entity id under the
   * pointer, or `null` for a click that hit nothing pickable (a "deselect by clicking empty space"
   * signal a caller commonly wants). */
  onSelect?: (id: WorldFrameEntityId | null) => void;
}

/**
 * Stateful per-scene interaction controller: feed it raw pointer events (screen-space pixels, y
 * down — the same convention `screenToNDC` already expects), read back hover/selection state via
 * `hovered`/`selected` or the `onHoverChange`/`onSelect` callbacks.
 */
export class InteractionController {
  private readonly raycaster: THREE_NS.Raycaster;
  private readonly dragTracker: ClickDragTracker;
  private hoveredId: WorldFrameEntityId | null = null;
  private selectedId: WorldFrameEntityId | null = null;

  constructor(
    private readonly THREE: typeof THREE_NS,
    private readonly options: InteractionControllerOptions,
  ) {
    this.raycaster = new THREE.Raycaster();
    this.dragTracker = new ClickDragTracker(options.dragThresholdPx);
  }

  get hovered(): WorldFrameEntityId | null {
    return this.hoveredId;
  }

  get selected(): WorldFrameEntityId | null {
    return this.selectedId;
  }

  /** Feed every pointer-down event (screen-space pixels). Starts drag tracking; does not itself
   * change hover/selection. */
  pointerDown(x: number, y: number): void {
    this.dragTracker.track(x, y, 'down');
  }

  /** Feed every pointer-move event. Updates hover state (and fires `onHoverChange` on a real
   * change) by raycasting at the current point — independent of drag tracking, since hover should
   * update continuously even mid-drag. */
  pointerMove(x: number, y: number, viewportWidth: number, viewportHeight: number): void {
    this.dragTracker.track(x, y, 'move');
    const id = this.pick(x, y, viewportWidth, viewportHeight);
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.options.onHoverChange?.(id);
    }
  }

  /** Feed every pointer-up event. Fires `onSelect` (and updates `selected`) only for a genuine
   * click — a pointer-up that ends an orbit-drag gesture is silently ignored, matching
   * `ClickDragTracker`'s own contract. */
  pointerUp(x: number, y: number, viewportWidth: number, viewportHeight: number): void {
    const wasDrag = this.dragTracker.finish();
    if (wasDrag) return;
    const id = this.pick(x, y, viewportWidth, viewportHeight);
    this.selectedId = id;
    this.options.onSelect?.(id);
  }

  /** Clears hover state without a pointer event — call on `pointerleave`/`pointercancel` so a
   * hover highlight doesn't stick after the cursor leaves the canvas. */
  clearHover(): void {
    if (this.hoveredId === null) return;
    this.hoveredId = null;
    this.options.onHoverChange?.(null);
  }

  private pick(x: number, y: number, viewportWidth: number, viewportHeight: number): WorldFrameEntityId | null {
    const targets = this.options.getTargets();
    if (targets.length === 0) return null;
    const hits = raycastFromScreenPoint(
      this.THREE, this.raycaster, this.options.camera, x, y, viewportWidth, viewportHeight,
      targets, this.options.recursive ?? true,
    );
    if (hits.length === 0) return null;
    return this.options.resolver.resolveEntityId(hits[0]!);
  }
}
