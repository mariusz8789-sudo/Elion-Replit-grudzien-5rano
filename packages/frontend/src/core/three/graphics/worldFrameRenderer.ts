import type * as THREE_NS from 'three';
import type { WorldFrame, WorldFrameEntity, WorldFrameEntityId } from './worldFrame';
import { disposeSceneResources } from './lifecycle';
import { InstanceBatch } from './instancing';

/**
 * GENESIS GRAPHICS RUNTIME — WorldFrame → Scene (the generic render pathway)
 * ==========================================================================
 *
 * The first real WorldFrame → entity resolution → scene graph → C2 rendering pathway. Diffs one
 * `WorldFrame` against the previous one and reconciles the scene: entities appear, move,
 * rescale, change visual state, or disappear — all through generic transform/hierarchy/scalar
 * fields (`worldFrame.ts`), never a domain branch. Grep this file: there is no `if (entity.
 * visualHint === 'hospital')` anywhere, and there must never be one added.
 *
 * WHERE DOMAIN KNOWLEDGE IS ALLOWED TO ENTER, AND ONLY THERE: the caller-supplied `resolveVisual`
 * function. This renderer has no idea what an entity IS — it asks the resolver "what does THIS
 * entity look like" and gets back an `EntityVisualSpec`. A Looking-Glass/world-builder layer owns
 * that function and any domain branching inside it; this file only ever calls it and manages the
 * lifecycle of whatever it returns. Same boundary `stateVisualization.ts` already draws for scalar
 * values — extended here to whole-entity visuals.
 *
 * TWO ENTITY LIFECYCLES, BOTH GENERIC:
 *  - `'object'` — one `Object3D` per entity, created once on first appearance, transformed every
 *    `sync()`, disposed on disappearance. Use for anything that needs individual identity
 *    (a hero object, a small population, anything a caller picks/inspects individually).
 *  - `'instanced'` — entities sharing the same `visualHint` are combined into ONE `InstancedMesh`
 *    via `instancing.ts`'s `InstanceBatch`, REBUILT FROM SCRATCH every `sync()` call (the previous
 *    batch is disposed, a fresh one built from the current frame's matching entities). This is a
 *    correct, simple, generic large-population path — not yet the most GPU-optimal one. The
 *    already-proven partial-buffer-update primitives (`setInstanceColor`/`setInstanceTransform` —
 *    see `instancing.ts`) target INCREMENTAL updates to an already-built batch; wiring THIS
 *    renderer to detect "only N of 1000 instances changed" and use those instead of a full rebuild
 *    is real, valuable, NOT YET DONE follow-up work — see this module's own "next task" note in
 *    the engine README, not invented here without a measured need.
 *
 * HONEST BOUNDARIES, NOT FABRICATED DETAIL: an entity with `grounding: 'NOT_MODELED'` never reaches
 * the caller's resolver at all — it always renders as `createBoundaryPlaceholder`'s generic,
 * domain-blind marker (a translucent wireframe-look sphere), so a viewer can SEE that something
 * exists there conceptually without this engine inventing what it looks like. A caller can override
 * the placeholder's own look via `options.resolveBoundaryPlaceholder`, but never skip the signal
 * entirely — grounding is read by this file, not delegated to the domain resolver, specifically so
 * "not modeled" can never be silently rendered as if it were real.
 */

export type EntityVisualSpec =
  | { kind: 'object'; object: THREE_NS.Object3D }
  | { kind: 'instanced'; batchKey: string; geometry: THREE_NS.BufferGeometry; material: THREE_NS.Material; color?: THREE_NS.ColorRepresentation; castShadow?: boolean };

export interface WorldFrameRendererOptions {
  /**
   * Called once, the first time an entity (by id) appears in a synced frame, for `'object'`-kind
   * entities — and every `sync()` call for `'instanced'`-kind entities, since their whole batch
   * rebuilds each time (see the module doc). Omit to use the built-in default: every entity
   * becomes a small individual sphere (`'object'` kind, radius scaled to `entity.scale`) — a
   * genuinely usable, if plain, default, not a stub.
   */
  resolveVisual?: (entity: WorldFrameEntity) => EntityVisualSpec;
  /**
   * Called every `sync()` for a live `'object'`-kind entity — including the very first sync right
   * after it's created, so state-driven material/color is correct from frame one, not just from
   * the second frame onward — after its transform has already been applied. The hook for a caller
   * to refresh material/visual state from the entity's current `scalars`/`status` without
   * recreating geometry. Omit for transform-only updates (no-op).
   */
  updateVisual?: (entity: WorldFrameEntity, object: THREE_NS.Object3D) => void;
  /** Overrides the built-in honest-boundary placeholder for `grounding: 'NOT_MODELED'` entities. */
  resolveBoundaryPlaceholder?: (THREE: typeof THREE_NS, entity: WorldFrameEntity) => THREE_NS.Object3D;
}

function defaultResolveVisual(THREE: typeof THREE_NS, entity: WorldFrameEntity): EntityVisualSpec {
  const radius = 0.5 * (entity.scale ?? 1);
  const object = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 10), new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7 }));
  return { kind: 'object', object };
}

function defaultBoundaryPlaceholder(THREE: typeof THREE_NS, entity: WorldFrameEntity): THREE_NS.Object3D {
  const radius = 0.5 * (entity.scale ?? 1);
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x5a6b7a, wireframe: true, transparent: true, opacity: 0.35 }),
  );
}

interface TrackedObjectEntity {
  kind: 'object';
  object: THREE_NS.Object3D;
  parentId: WorldFrameEntityId | null;
  isPlaceholder: boolean;
}

/**
 * Reconciles a sequence of `WorldFrame`s into a THREE scene. One instance per world/scene — call
 * `sync(frame)` whenever a new frame is available (typically once per `Sim3D.syncScene`), and
 * `dispose()` on scene teardown to free every entity this renderer ever created.
 */
export class WorldFrameRenderer {
  private readonly tracked = new Map<WorldFrameEntityId, TrackedObjectEntity>();
  private readonly instancedBatches = new Map<string, THREE_NS.Object3D>();

  constructor(
    private readonly THREE: typeof THREE_NS,
    private readonly root: THREE_NS.Object3D,
    private readonly options: WorldFrameRendererOptions = {},
  ) {}

  /** Reconciles the scene to match `frame`: entities present now but not before are created;
   * entities present before but not now (or with `visible: false`) are removed and disposed;
   * everything else has its transform re-applied and `updateVisual` (if supplied) called. */
  sync(frame: WorldFrame): void {
    const instancedGroups = new Map<string, WorldFrameEntity[]>();

    // Pass 1: create any newly-appeared 'object'-kind entities (and honest-boundary placeholders) —
    // `this.tracked` only ever holds object-kind/placeholder entities, never instanced ones, so
    // this loop also naturally re-collects EVERY 'instanced'-kind entity into its batchKey group on
    // EVERY sync() call (not just first appearance), matching that lifecycle's own "whole batch
    // rebuilds every sync" design (see the module doc). Two passes total (this one, then transform
    // application below) so parentId never depends on array order within the frame.
    for (const entity of frame.entities) {
      if (entity.visible === false) continue;
      if (this.tracked.has(entity.id)) continue;

      if (entity.grounding === 'NOT_MODELED') {
        const object = (this.options.resolveBoundaryPlaceholder ?? defaultBoundaryPlaceholder)(this.THREE, entity);
        this.tracked.set(entity.id, { kind: 'object', object, parentId: entity.parentId ?? null, isPlaceholder: true });
        continue;
      }

      const spec = this.resolveVisual(entity);
      if (spec.kind === 'instanced') {
        const group = instancedGroups.get(spec.batchKey) ?? [];
        group.push(entity);
        instancedGroups.set(spec.batchKey, group);
        continue;
      }
      this.tracked.set(entity.id, { kind: 'object', object: spec.object, parentId: entity.parentId ?? null, isPlaceholder: false });
    }

    // Pass 2: parent + transform every currently-tracked 'object'-kind entity that's in this frame.
    const byId = new Map(frame.entities.map((e) => [e.id, e]));
    for (const [id, tracked] of this.tracked) {
      const entity = byId.get(id);
      if (!entity || entity.visible === false) continue;
      // parentId can change between frames (an entity reassigned to a different container) — refresh
      // it from the CURRENT entity every sync, not just at creation time, or a reparent would never
      // take effect after the first frame.
      tracked.parentId = entity.parentId ?? null;
      this.applyTransform(tracked.object, entity);
      this.ensureParented(tracked);
      if (!tracked.isPlaceholder) this.options.updateVisual?.(entity, tracked.object);
    }

    this.rebuildInstancedBatches(instancedGroups);

    // Remove anything tracked that's no longer present (or now invisible) in this frame.
    for (const [id, tracked] of [...this.tracked]) {
      const entity = byId.get(id);
      if (entity && entity.visible !== false) continue;
      tracked.object.parent?.remove(tracked.object);
      disposeSceneResources(tracked.object);
      this.tracked.delete(id);
    }
  }

  private resolveVisual(entity: WorldFrameEntity): EntityVisualSpec {
    return this.options.resolveVisual ? this.options.resolveVisual(entity) : defaultResolveVisual(this.THREE, entity);
  }

  private applyTransform(object: THREE_NS.Object3D, entity: WorldFrameEntity): void {
    object.position.set(...entity.position);
    if (entity.rotation) object.rotation.set(...entity.rotation);
    const scale = entity.scale ?? 1;
    object.scale.setScalar(scale);
  }

  private ensureParented(tracked: TrackedObjectEntity): void {
    const desiredParent = tracked.parentId ? this.tracked.get(tracked.parentId)?.object ?? this.root : this.root;
    if (tracked.object.parent !== desiredParent) desiredParent.add(tracked.object);
  }

  private rebuildInstancedBatches(groups: Map<string, WorldFrameEntity[]>): void {
    // Every batch key seen THIS sync gets rebuilt fresh; any batch key from a PREVIOUS sync that no
    // longer has any entities is torn down entirely (its population dropped to zero).
    for (const [batchKey, previous] of [...this.instancedBatches]) {
      if (!groups.has(batchKey)) {
        previous.parent?.remove(previous);
        disposeSceneResources(previous);
        this.instancedBatches.delete(batchKey);
      }
    }

    for (const [batchKey, entities] of groups) {
      const previous = this.instancedBatches.get(batchKey);
      if (previous) {
        previous.parent?.remove(previous);
        disposeSceneResources(previous);
        this.instancedBatches.delete(batchKey);
      }
      if (entities.length === 0) continue;
      const firstSpec = this.resolveVisual(entities[0]!);
      if (firstSpec.kind !== 'instanced') continue; // defensive: a resolver must be stable per batchKey
      const batch = new InstanceBatch(this.THREE, firstSpec.geometry, firstSpec.material);
      for (const entity of entities) {
        const spec = this.resolveVisual(entity);
        if (spec.kind !== 'instanced') continue;
        batch.add(entity.position, entity.rotation, entity.scale ?? 1, spec.color);
      }
      // InstanceBatch.build() only ever calls the generic Object3D `.add()` on what it's given —
      // it never needs anything Scene-specific — so a Group root works exactly as well as a real
      // THREE.Scene despite the narrower parameter type.
      const mesh = batch.build(this.root as THREE_NS.Scene, firstSpec.castShadow ?? false);
      if (mesh) this.instancedBatches.set(batchKey, mesh);
    }
  }

  /** Disposes every entity this renderer currently tracks (both individual objects and instanced
   * batches) and forgets them all — call once on full scene teardown. */
  dispose(): void {
    for (const tracked of this.tracked.values()) {
      tracked.object.parent?.remove(tracked.object);
      disposeSceneResources(tracked.object);
    }
    this.tracked.clear();
    for (const batch of this.instancedBatches.values()) {
      batch.parent?.remove(batch);
      disposeSceneResources(batch);
    }
    this.instancedBatches.clear();
  }
}
