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

// ============================================================================
// Visual highlight — the "actual visual interaction" half of this module: turning a hover/select
// STATE (above) into something the viewer can actually see, for an individual OBJECT-kind entity's
// Object3D (get one via `WorldFrameRenderer.getObjectForEntity`). An instanced-kind entity has no
// individual Object3D to highlight this way — see that function's own doc for the
// `setInstanceColor`-based alternative a caller needs for that case instead.
// ============================================================================

export type HighlightKind = 'hover' | 'select';

/** Tuned per-kind highlight tint/strength — select reads stronger than hover, matching the
 * convention every UI hover/select pair uses (a light touch on hover, a confident one on select). */
const HIGHLIGHT_PRESET: Record<HighlightKind, { color: number; minIntensity: number }> = {
  hover: { color: 0xffffff, minIntensity: 0.28 },
  select: { color: 0xffd166, minIntensity: 0.6 },
};

interface HighlightableMaterial {
  emissive: THREE_NS.Color;
  emissiveIntensity?: number;
  userData: Record<string, unknown>;
}

const HIGHLIGHT_ORIGINAL_KEY = '__genesisHighlightOriginal';

function forEachHighlightableMaterial(object: THREE_NS.Object3D, fn: (material: HighlightableMaterial) => void): void {
  object.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (material && typeof material === 'object' && 'emissive' in material) fn(material as unknown as HighlightableMaterial);
    }
  });
}

/**
 * Applies a hover/select highlight to every material in `object`'s subtree that has an `emissive`
 * channel (anything else — a `MeshBasicMaterial`, say — is silently skipped, since it has no
 * emissive channel to boost). Boosts `emissive`/`emissiveIntensity` toward the kind's preset,
 * remembering each material's ORIGINAL emissive/intensity (once, in `userData`) so `clearHighlight`
 * restores it exactly rather than guessing a baseline. Calling this again on an already-highlighted
 * object (a hover promoted to a select) re-applies from the SAME remembered original, so it never
 * compounds.
 */
export function applyHighlight(THREE: typeof THREE_NS, object: THREE_NS.Object3D, kind: HighlightKind): void {
  const preset = HIGHLIGHT_PRESET[kind];
  forEachHighlightableMaterial(object, (material) => {
    const original = (material.userData[HIGHLIGHT_ORIGINAL_KEY] as { color: number; intensity: number } | undefined)
      ?? { color: material.emissive.getHex(), intensity: material.emissiveIntensity ?? 0 };
    material.userData[HIGHLIGHT_ORIGINAL_KEY] = original;
    material.emissive.copy(new THREE.Color(original.color)).lerp(new THREE.Color(preset.color), 0.6);
    material.emissiveIntensity = Math.max(original.intensity, preset.minIntensity);
  });
}

/** Restores every material `applyHighlight` touched in `object`'s subtree to its remembered
 * original emissive/intensity. A safe no-op for a material that was never highlighted. */
export function clearHighlight(object: THREE_NS.Object3D): void {
  forEachHighlightableMaterial(object, (material) => {
    const original = material.userData[HIGHLIGHT_ORIGINAL_KEY] as { color: number; intensity: number } | undefined;
    if (!original) return;
    material.emissive.setHex(original.color);
    material.emissiveIntensity = original.intensity;
    delete material.userData[HIGHLIGHT_ORIGINAL_KEY];
  });
}
