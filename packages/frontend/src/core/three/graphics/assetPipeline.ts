import type * as THREE_NS from 'three';
import { disposeSceneResources } from './lifecycle';

/**
 * GENESIS GRAPHICS RUNTIME — Asset Pipeline
 *
 * Two small, generic primitives generalizing patterns already proven (and, in one case, audited
 * and bug-fixed) in `epidemicCity3D.ts`/`highFidelitySlice3D.ts`'s own async asset loading:
 *
 *  1. `assignTextureSlot` — the correct way to overwrite a material's texture slot once a real,
 *     network-loaded texture arrives to replace a procedural fallback (or an earlier-resolution
 *     placeholder). Audit finding this generalizes: `graphics/materials.ts`'s palette categories
 *     now seed `map`/`normalMap`/`roughnessMap` with real procedural textures at construction time
 *     (previously `undefined`), so "overwrite this slot" needs to dispose the OUTGOING texture or
 *     every governed-asset load leaks one WebGL texture — a real bug this exact helper fixed in both
 *     scenes above; this is that fix, generalized so a future caller gets it for free instead of
 *     re-discovering it.
 *  2. `createAssetSlot` — a fallback-now/real-asset-later Object3D slot: starts showing a cheap
 *     procedural fallback, and `replace()` swaps in the real loaded asset (a GLTF root, typically)
 *     at the SAME transform, disposing the outgoing fallback's own geometry/materials/textures (via
 *     `lifecycle.ts`'s `disposeSceneResources` — composition, not a second disposal traversal) so no
 *     stale fallback ever lingers in memory once the real asset takes over. Deliberately has NO
 *     opinion on how the real asset is loaded (no GLTFLoader import here) — a caller passes whatever
 *     `THREE_NS.Object3D` its own loader produced, keeping this module free of a hard dependency on
 *     any one loader/addon.
 *
 * `KeyedResourceCache` is the third primitive: a generic "get or create, keyed by string, dispose
 * them all" cache — the shape every geometry/texture reuse case in this engine needs (a shared
 * canopy geometry per vegetation species, a shared texture per governed-asset path) without each
 * caller re-deriving its own `Map` + miss-then-create + bulk-dispose boilerplate.
 */

export class KeyedResourceCache<T> {
  private readonly entries = new Map<string, T>();

  /** Returns the cached value for `key`, creating and caching it via `factory()` on a miss. The
   * factory runs at most once per key, however many times `getOrCreate` is called with that key. */
  getOrCreate(key: string, factory: () => T): T {
    const existing = this.entries.get(key);
    if (existing !== undefined) return existing;
    const created = factory();
    this.entries.set(key, created);
    return created;
  }

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Disposes every cached value via `disposer` and forgets them all — call once on scene teardown. */
  dispose(disposer: (value: T) => void): void {
    for (const value of this.entries.values()) disposer(value);
    this.entries.clear();
  }
}

/**
 * Overwrites `material[slot]` with `texture`, disposing whatever texture was there before (a no-op
 * if the slot was empty). Use this instead of a bare `material[slot] = texture` assignment whenever
 * the slot might already hold a texture this material OWNS (a procedural fallback, an
 * earlier-resolution placeholder) — a bare assignment silently leaks the outgoing texture's WebGL
 * resources. Does NOT dispose a texture the material doesn't own (one shared across several
 * materials) — only call this from code that knows the outgoing texture in that slot is this
 * material's own, exactly like `materials.ts`'s own per-category conventions.
 */
export function assignTextureSlot(
  material: Record<string, unknown> & { needsUpdate?: boolean },
  slot: string,
  texture: THREE_NS.Texture,
): void {
  const previous = material[slot] as THREE_NS.Texture | undefined;
  previous?.dispose();
  material[slot] = texture;
  material.needsUpdate = true;
}

export interface AssetSlotHandle {
  /** The currently-visible object — the fallback until `replace()` is called, the real asset after. */
  readonly current: THREE_NS.Object3D;
  /** Swaps in `real` at the fallback's exact transform (position/rotation/scale) and disposes the
   * outgoing object's own geometry/materials/textures — a no-op-safe call if `replace` is somehow
   * invoked twice (the second real asset simply replaces the first, same disposal guarantee). If
   * the slot is already parented (`current.parent` is set), `real` is reparented into the same slot
   * so the caller's own scene graph doesn't need to know a swap happened. */
  replace(real: THREE_NS.Object3D): void;
  /** Disposes the current object (whichever one is active) and detaches it from its parent. */
  dispose(): void;
}

/**
 * Creates a fallback-now/real-asset-later slot. `fallback` is shown immediately (already added to
 * `current` — the caller adds `.current` to the scene once, then never needs to touch the scene
 * graph again across a `replace()` swap when the slot was already parented).
 */
export function createAssetSlot(fallback: THREE_NS.Object3D): AssetSlotHandle {
  let current = fallback;
  return {
    get current() {
      return current;
    },
    replace(real: THREE_NS.Object3D) {
      const outgoing = current;
      real.position.copy(outgoing.position);
      real.rotation.copy(outgoing.rotation);
      real.scale.copy(outgoing.scale);
      const parent = outgoing.parent;
      if (parent) {
        parent.add(real);
        parent.remove(outgoing);
      }
      disposeSceneResources(outgoing);
      current = real;
    },
    dispose() {
      current.parent?.remove(current);
      disposeSceneResources(current);
    },
  };
}
