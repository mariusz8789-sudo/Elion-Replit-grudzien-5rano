import type * as THREE_NS from 'three';
import type { WorldFrame, WorldFrameEntity, WorldFrameEntityId } from './worldFrame';
import { disposeSceneResources } from './lifecycle';
import { InstanceBatch, setInstanceColor, setInstanceTransform } from './instancing';
import { findTaggedAncestor } from './picking';

/** `userData` key this renderer tags every 'object'-kind entity's `Object3D` with, and every
 * instanced batch's `InstancedMesh` with (a batch key, not an entity id — see
 * `WORLD_FRAME_BATCH_KEY`) — the mechanism `resolveEntityId` and `graphics/interaction.ts`'s
 * `InteractionController` use to map a raw raycast hit back to a WorldFrame entity id, without the
 * renderer needing to know anything about clicking/hovering/selection itself. */
const WORLD_FRAME_ENTITY_ID = 'worldFrameEntityId';
const WORLD_FRAME_BATCH_KEY = 'worldFrameBatchKey';

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
 *    via `instancing.ts`'s `InstanceBatch`. When a batch's MEMBERSHIP is unchanged from the
 *    previous sync (same set of entity ids, same order, same geometry/material identity), this
 *    renderer reuses the existing `InstancedMesh` and retunes every instance's transform/color in
 *    place via `setInstanceTransform`/`setInstanceColor` (`instancing.ts`'s partial-buffer-upload
 *    primitives) — the steady-state case for any population that stays the same size frame to
 *    frame (an already-spawned crowd, a fixed sensor grid) never re-allocates a GPU buffer just to
 *    move. Only a STRUCTURAL change (population count/order/geometry/material) triggers a full
 *    rebuild (the old batch disposed, a fresh one built) — correct and simple, same as before, now
 *    reserved for when it's actually needed instead of running on every single `sync()`.
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

/** One reconciled instanced batch's identity — everything needed to decide, on the NEXT sync,
 * whether its membership is unchanged (retune in place) or structurally different (rebuild). */
interface TrackedInstancedBatch {
  mesh: THREE_NS.InstancedMesh;
  geometry: THREE_NS.BufferGeometry;
  material: THREE_NS.Material;
  /** Entity ids, in the exact order they were baked into instance indices — index `i`'s entity is
   * `order[i]`. Both the SET and the ORDER must match next sync for the incremental path to apply,
   * since an instance index has no identity of its own beyond "whatever is at this position now." */
  order: WorldFrameEntityId[];
}

/**
 * Reconciles a sequence of `WorldFrame`s into a THREE scene. One instance per world/scene — call
 * `sync(frame)` whenever a new frame is available (typically once per `Sim3D.syncScene`), and
 * `dispose()` on scene teardown to free every entity this renderer ever created.
 */
export class WorldFrameRenderer {
  private readonly tracked = new Map<WorldFrameEntityId, TrackedObjectEntity>();
  private readonly instancedBatches = new Map<string, TrackedInstancedBatch>();
  private readonly colorScratch: THREE_NS.Color;

  constructor(
    private readonly THREE: typeof THREE_NS,
    private readonly root: THREE_NS.Object3D,
    private readonly options: WorldFrameRendererOptions = {},
  ) {
    this.colorScratch = new THREE.Color();
  }

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
        object.userData[WORLD_FRAME_ENTITY_ID] = entity.id;
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
      spec.object.userData[WORLD_FRAME_ENTITY_ID] = entity.id;
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

    this.reconcileInstancedBatches(instancedGroups);

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

  private reconcileInstancedBatches(groups: Map<string, WorldFrameEntity[]>): void {
    // Every batch key from a PREVIOUS sync that no longer has any entities this sync is torn down
    // entirely (its population dropped to zero) — unrelated to the incremental-vs-rebuild decision
    // below, which only applies to keys still present in `groups`.
    for (const [batchKey, tracked] of [...this.instancedBatches]) {
      if (!groups.has(batchKey)) {
        tracked.mesh.parent?.remove(tracked.mesh);
        disposeSceneResources(tracked.mesh);
        this.instancedBatches.delete(batchKey);
      }
    }

    for (const [batchKey, entities] of groups) {
      if (entities.length === 0) continue;
      const firstSpec = this.resolveVisual(entities[0]!);
      if (firstSpec.kind !== 'instanced') continue; // defensive: a resolver must be stable per batchKey

      const existing = this.instancedBatches.get(batchKey);
      const sameMembership = existing !== undefined
        && existing.geometry === firstSpec.geometry
        && existing.material === firstSpec.material
        && existing.order.length === entities.length
        && existing.order.every((id, i) => id === entities[i]!.id);

      if (sameMembership) {
        // INCREMENTAL PATH: identical population/order/geometry/material as last sync — retune
        // every instance's transform (always) and color (only if this batch was originally built
        // with per-instance color support) in place, with zero new GPU allocation.
        const mesh = existing.mesh;
        const hasColors = mesh.instanceColor !== null;
        for (let i = 0; i < entities.length; i++) {
          const entity = entities[i]!;
          setInstanceTransform(this.THREE, mesh, i, entity.position, entity.rotation ?? [0, 0, 0], entity.scale ?? 1);
          if (!hasColors) continue;
          const spec = this.resolveVisual(entity);
          if (spec.kind === 'instanced' && spec.color !== undefined) {
            setInstanceColor(mesh, i, this.colorScratch.set(spec.color));
          }
        }
        continue;
      }

      // STRUCTURAL CHANGE (or first appearance of this batch key) — full rebuild.
      if (existing) {
        existing.mesh.parent?.remove(existing.mesh);
        disposeSceneResources(existing.mesh);
        this.instancedBatches.delete(batchKey);
      }
      const batch = new InstanceBatch(this.THREE, firstSpec.geometry, firstSpec.material);
      const order: WorldFrameEntityId[] = [];
      for (const entity of entities) {
        const spec = this.resolveVisual(entity);
        if (spec.kind !== 'instanced') continue;
        batch.add(entity.position, entity.rotation, entity.scale ?? 1, spec.color);
        order.push(entity.id);
      }
      // InstanceBatch.build() only ever calls the generic Object3D `.add()` on what it's given —
      // it never needs anything Scene-specific — so a Group root works exactly as well as a real
      // THREE.Scene despite the narrower parameter type.
      const mesh = batch.build(this.root as THREE_NS.Scene, firstSpec.castShadow ?? false);
      if (mesh) {
        mesh.userData[WORLD_FRAME_BATCH_KEY] = batchKey;
        this.instancedBatches.set(batchKey, { mesh, geometry: firstSpec.geometry, material: firstSpec.material, order });
      }
    }
  }

  /**
   * Looks up the individual `Object3D` currently tracked for an OBJECT-kind entity id — the
   * inverse of `resolveEntityId`, for a caller (typically an interaction layer applying a hover/
   * select highlight) that has an id and needs the object, not a raycast hit to resolve one from.
   * Returns `null` for an unknown id, a currently-invisible entity, OR an `'instanced'`-kind entity
   * — the latter has no individual `Object3D` to hand back at all (its visual is one shared instance
   * slot inside a batched `InstancedMesh`); a caller needing to highlight an instanced entity must
   * use `instancing.ts`'s `setInstanceColor` against that batch directly instead.
   */
  getObjectForEntity(id: WorldFrameEntityId): THREE_NS.Object3D | null {
    return this.tracked.get(id)?.object ?? null;
  }

  /**
   * Maps a raw `THREE.Raycaster` hit back to the WorldFrame entity id it belongs to — the one piece
   * of bookkeeping `graphics/interaction.ts`'s `InteractionController` (or any caller doing its own
   * picking) needs to turn "the user clicked here" into "the user clicked entity X," without this
   * renderer knowing anything about clicking/hovering/selection itself.
   *
   * Handles both entity lifecycles: an INSTANCED hit resolves via `intersection.instanceId` against
   * the batch's recorded entity order (see `TrackedInstancedBatch.order`); an OBJECT/placeholder hit
   * walks up the intersected mesh's ancestor chain (a hit is always the leaf mesh, which may sit a
   * few levels below the tagged root `resolveVisual` returned) via `picking.ts`'s
   * `findTaggedAncestor`. Returns `null` when the intersection belongs to neither (e.g. it hit
   * scenery this renderer didn't create).
   */
  resolveEntityId(intersection: THREE_NS.Intersection): WorldFrameEntityId | null {
    const batchKey = (intersection.object.userData as Record<string, unknown>)[WORLD_FRAME_BATCH_KEY];
    if (typeof batchKey === 'string' && intersection.instanceId !== undefined) {
      const tracked = this.instancedBatches.get(batchKey);
      return tracked?.order[intersection.instanceId] ?? null;
    }
    const tagged = findTaggedAncestor(intersection.object, (userData) => typeof userData[WORLD_FRAME_ENTITY_ID] === 'string');
    return tagged ? (tagged.userData[WORLD_FRAME_ENTITY_ID] as WorldFrameEntityId) : null;
  }

  /** Disposes every entity this renderer currently tracks (both individual objects and instanced
   * batches) and forgets them all — call once on full scene teardown. */
  dispose(): void {
    for (const tracked of this.tracked.values()) {
      tracked.object.parent?.remove(tracked.object);
      disposeSceneResources(tracked.object);
    }
    this.tracked.clear();
    for (const tracked of this.instancedBatches.values()) {
      tracked.mesh.parent?.remove(tracked.mesh);
      disposeSceneResources(tracked.mesh);
    }
    this.instancedBatches.clear();
  }
}
