import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Shadow Policy
 *
 * CIENIE: włączane raz, po zbudowaniu całej sceny, wg reguł — nie "wszystko
 * rzuca cień" (setki śrub/diod/gałek to czysty koszt shadow-mapy bez
 * żadnego widocznego cienia):
 *
 *  1. STRUCTURAL / MACHINERY (duże elementy konstrukcyjne, korpusy aparatury)
 *     → rzucają cień: przekraczają `minCastExtent` na heurystyce rozmiaru.
 *  2. IMPORTANT MACHINERY poniżej progu rozmiaru (mały, ale znaczący element —
 *     głowica sondy, koło zaworu) → rzuca cień mimo to, przez jawny `forceCast`.
 *  3. DETAIL (śruby, diody, gałki, listwy) → generalnie NIE rzuca cienia —
 *     jego cień i tak zginąłby w rozdzielczości mapy.
 *  4. Przezroczyste (szkło reaktora, hologram, przegrody, szyby szaf) TYLKO
 *     odbierają cień — szkło rzucające czarną plamę wyglądałoby gorzej niż
 *     brak cienia.
 *  5. Cień ODBIERAJĄ tylko powierzchnie, na których faktycznie coś widać:
 *     podłoga, podesty, blaty, ściany — nie każdy drobiazg.
 *
 * A single global pass over the finished scene, applied ONCE after every
 * builder has run — component builders (facilityKit/apparatus) never set
 * `castShadow`/`receiveShadow` themselves, since any per-object guess would
 * just be overwritten here anyway. One policy, one place to tune it.
 */

/** Named size thresholds — see the policy summary above. Exported so a caller can reference them
 * (e.g. "is this object above MACHINERY size") without re-deriving the numbers. */
export const SHADOW_SIZE_TIERS = {
  /** Meshes with every axis extent at or below this never cast a shadow (unless `forceCast`) —
   * the shadow would be lost in typical shadow-map resolution anyway. */
  DETAIL_MAX_EXTENT: 0.18,
  /** Meshes with every axis extent at or below this don't receive a shadow either — nothing large
   * enough falls on them for it to read. Above this (benches, floors, walls, machinery bodies,
   * structural members), they do. */
  RECEIVE_MIN_EXTENT: 0.3,
} as const;

type ObjectMatcher = readonly THREE_NS.Object3D[] | ((mesh: THREE_NS.Mesh) => boolean);

function toPredicate(matcher: ObjectMatcher | undefined): (mesh: THREE_NS.Mesh) => boolean {
  if (!matcher) return () => false;
  if (typeof matcher === 'function') return matcher;
  const set = new Set<THREE_NS.Object3D>(matcher);
  return (mesh) => set.has(mesh);
}

export interface ShadowPolicyOptions {
  /** Below this size, a mesh doesn't cast a shadow unless `forceCast` says otherwise. Default
   * `SHADOW_SIZE_TIERS.DETAIL_MAX_EXTENT`. */
  minCastExtent?: number;
  /** Below this size, a mesh doesn't receive a shadow. Default `SHADOW_SIZE_TIERS.RECEIVE_MIN_EXTENT`. */
  minReceiveExtent?: number;
  /**
   * "Important machinery" override: marks specific meshes as shadow casters regardless of the
   * size heuristic — a small but significant part (a sensor head, a valve wheel, a status light
   * housing) that would otherwise fall under `minCastExtent`. Accepts an explicit object list or
   * a predicate for larger/dynamic sets. Never forces a *transparent* material to cast, though —
   * glass casting a black shadow blob still looks worse than no shadow (see rule 4 above).
   */
  forceCast?: ObjectMatcher;
  /** Objects this policy should skip entirely, leaving their `castShadow`/`receiveShadow` exactly
   * as the caller already set them — an escape hatch for a mesh needing bespoke shadow behavior
   * this heuristic can't express (e.g. a mesh that must never receive a shadow for a visual reason
   * unrelated to size). */
  exclude?: ObjectMatcher;
}

/**
 * Applies the shadow policy to every mesh in `scene`. Call once, after every facility/apparatus
 * builder has finished adding to `scene` — running it earlier would miss meshes added afterward.
 */
export function applyShadowPolicy(THREE: typeof THREE_NS, scene: THREE_NS.Scene, options: ShadowPolicyOptions = {}): void {
  const minCastExtent = options.minCastExtent ?? SHADOW_SIZE_TIERS.DETAIL_MAX_EXTENT;
  const minReceiveExtent = options.minReceiveExtent ?? SHADOW_SIZE_TIERS.RECEIVE_MIN_EXTENT;
  const isForcedCast = toPredicate(options.forceCast);
  const isExcluded = toPredicate(options.exclude);

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  scene.traverse((object) => {
    const mesh = object as THREE_NS.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (isExcluded(mesh)) return;

    const material = mesh.material as THREE_NS.Material | THREE_NS.Material[];
    const transparent = Array.isArray(material) ? material.some((m) => m.transparent) : material.transparent;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
    box.getSize(size);
    const scale = mesh.getWorldScale(new THREE.Vector3());
    const largestExtent = Math.max(size.x * scale.x, size.y * scale.y, size.z * scale.z);

    const forced = isForcedCast(mesh);
    mesh.castShadow = !transparent && (largestExtent > minCastExtent || forced);
    mesh.receiveShadow = largestExtent > minReceiveExtent;
  });
}
