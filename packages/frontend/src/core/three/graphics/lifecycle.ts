import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Resource Lifecycle
 *
 * Resource-lifecycle audit finding: `WebGLRenderer.dispose()` (called by `useThreeLoop.ts` on
 * unmount) does NOT free geometries, materials or textures — three.js deliberately treats those as
 * owned by scene code, not the renderer, since they may be shared across scenes/renderers. Nothing
 * frees them by itself: a `THREE.BufferGeometry`'s GPU buffers and a `THREE.Texture`'s uploaded
 * pixels live for as long as the renderer's internal WeakMap-keyed properties reference them, and
 * JS garbage collection of the *scene graph* (meshes/materials going unreachable) does not
 * guarantee prompt collection of the *WebGL context* that actually owns the GPU-side memory —
 * relying on it risks the well-known "too many active WebGL contexts" failure mode on repeated
 * scene mount/unmount (route navigation, hot reload, experiment switching), not just a slow leak.
 *
 * `epidemicCity3D.ts` and `highFidelitySlice3D.ts` each independently hand-rolled a traverse-and-
 * dispose helper for exactly this reason. This module generalizes that into one engine-owned,
 * tested utility — every current and future `Sim3D` scene gets full geometry/material/texture
 * disposal on teardown by storing its `scene` reference from `init()` and calling
 * `disposeSceneResources(this.scene)` from `dispose()`, instead of re-deriving the same traversal
 * per scene (or, as `labScene3D.ts` did before this fix, skipping it entirely on the mistaken
 * assumption that GC alone is sufficient).
 *
 * Deliberately excluded from this traversal: `scene.background`/`scene.environment` (the IBL/HDRI
 * environment map and studio background) — those are owned and disposed by
 * `graphics/lighting.ts`/`graphics/postProcessing.ts`'s own pipeline lifecycle, not per-mesh scene
 * traversal, so double-managing them here would only risk disposing a texture the pipeline is still
 * using mid-teardown.
 */

/** Duck-typed instead of `instanceof THREE.Texture` — this module takes no runtime dependency on
 * `three` (see materials.ts's own "THREE injected, not imported" convention); every three.js
 * `Texture` subclass sets `isTexture = true`, so this is exactly as precise as `instanceof` would
 * be, without the import. */
function isDisposableTexture(value: unknown): value is THREE_NS.Texture {
  return typeof value === 'object' && value !== null && (value as { isTexture?: boolean }).isTexture === true;
}

function isDisposableMaterial(value: unknown): value is THREE_NS.Material {
  return typeof value === 'object' && value !== null && (value as { isMaterial?: boolean }).isMaterial === true;
}

/**
 * Disposes every texture referenced by a material's own properties (`map`, `normalMap`,
 * `envMap`, ...). Doesn't hardcode the property-name list — three.js materials expose a couple
 * dozen possible texture slots depending on type (`MeshStandardMaterial` vs `MeshPhysicalMaterial`
 * vs `MeshBasicMaterial`, ...) and hardcoding invites silently missing a newly-used one; scanning
 * own-enumerable values for anything texture-shaped is exhaustive by construction instead.
 */
function disposeMaterialTextures(material: THREE_NS.Material, excluded: ReadonlySet<THREE_NS.Texture> | undefined): void {
  for (const value of Object.values(material as unknown as Record<string, unknown>)) {
    if (isDisposableTexture(value) && !excluded?.has(value)) value.dispose();
  }
}

export interface DisposeSceneOptions {
  /** Materials to skip disposing even if encountered during traversal — for a material this scene
   * doesn't own (shared from a registry disposed separately, e.g. `highFidelitySlice3D.ts`'s
   * `this.materials`), disposing it here would pull it out from under whoever still owns it. */
  excludeMaterials?: ReadonlyArray<THREE_NS.Material>;
  /** Textures to skip disposing even if encountered on a disposed material — same reasoning as
   * `excludeMaterials`, for a texture shared independently of its material (e.g. a texture atlas
   * reused across several distinct materials, only some of which this call should tear down). */
  excludeTextures?: ReadonlyArray<THREE_NS.Texture>;
}

/**
 * Traverses `root` and disposes every descendant's geometry, material(s), and each material's own
 * textures — the full GPU-resource footprint of a scene subtree, in one call. Safe to call on an
 * entire `THREE.Scene` at teardown, or on a smaller subtree (a single loaded asset, a removed
 * group) before it's discarded. Disposal is idempotent (three.js's own `.dispose()` methods are
 * safe to call more than once), so a geometry/material/texture reachable from two different
 * traversed nodes is not a bug.
 */
/**
 * Disposes a bag of materials (and each one's own textures) that isn't reached by any scene-graph
 * traversal — a shared material registry a scene keeps on the side (e.g.
 * `highFidelitySlice3D.ts`'s `MaterialBundle`) rather than one built ad hoc per mesh. Found via
 * audit: that file's own hand-rolled disposal only ever called `.dispose()` on 4 of its 7 registry
 * materials, explicitly SKIPPED all 4's own loaded textures (`map`/`normalMap`/`roughnessMap`/
 * `aoMap`, real loaded image textures, not cheap procedural ones), and — because its per-mesh
 * disposal loop excludes anything in the registry, to avoid double-disposing a shared material —
 * left the other 3 (`glass`/`metal`/`markings`) never disposed at all. Use this for that whole
 * registry instead of disposing entries one at a time.
 */
export function disposeMaterials(materials: Iterable<THREE_NS.Material>, excludeTextures?: ReadonlyArray<THREE_NS.Texture>): void {
  const excluded = excludeTextures ? new Set(excludeTextures) : undefined;
  for (const material of materials) {
    disposeMaterialTextures(material, excluded);
    material.dispose();
  }
}

export function disposeSceneResources(root: THREE_NS.Object3D, options: DisposeSceneOptions = {}): void {
  const excludedMaterials = options.excludeMaterials ? new Set(options.excludeMaterials) : undefined;
  const excludedTextures = options.excludeTextures ? new Set(options.excludeTextures) : undefined;

  root.traverse((node) => {
    const geometry = (node as { geometry?: THREE_NS.BufferGeometry }).geometry;
    geometry?.dispose();

    const material = (node as { material?: THREE_NS.Material | THREE_NS.Material[] }).material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) {
      if (!isDisposableMaterial(m) || excludedMaterials?.has(m)) continue;
      disposeMaterialTextures(m, excludedTextures);
      m.dispose();
    }
  });
}
