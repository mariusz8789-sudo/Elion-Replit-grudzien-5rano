import type * as THREE_NS from 'three';

/**
 * GENESIS GRAPHICS RUNTIME — Shadow Policy
 *
 * CIENIE: włączane raz, po zbudowaniu całej sceny, wg trzech reguł — nie
 * "wszystko rzuca cień" (setki śrub/diod/gałek to czysty koszt shadow-mapy
 * bez żadnego widocznego cienia):
 *  1. Przezroczyste (szkło reaktora, hologram, przegrody, szyby szaf) tylko
 *     ODBIERAJĄ cień — szkło rzucające czarną plamę zamiast refleksu
 *     wyglądałoby gorzej niż brak cienia.
 *  2. Drobnica poniżej progu (śruby, diody, gałki, listwy) nie rzuca — jej
 *     cień i tak zginąłby w rozdzielczości mapy.
 *  3. Cień ODBIERAJĄ tylko powierzchnie, na których faktycznie coś widać:
 *     podłoga, podesty, blaty, ściany — nie każdy drobiazg.
 *
 * A single global pass over the finished scene, applied ONCE after every
 * builder has run — component builders (facilityKit/apparatus) never set
 * `castShadow`/`receiveShadow` themselves, since any per-object guess would
 * just be overwritten here anyway. One policy, one place to tune it.
 */
export function applyShadowPolicy(THREE: typeof THREE_NS, scene: THREE_NS.Scene, minCastExtent = 0.18, minReceiveExtent = 0.3): void {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  scene.traverse((object) => {
    const mesh = object as THREE_NS.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const material = mesh.material as THREE_NS.Material | THREE_NS.Material[];
    const transparent = Array.isArray(material) ? material.some((m) => m.transparent) : material.transparent;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.copy(mesh.geometry.boundingBox!);
    box.getSize(size);
    const scale = mesh.getWorldScale(new THREE.Vector3());
    const largestExtent = Math.max(size.x * scale.x, size.y * scale.y, size.z * scale.z);
    mesh.castShadow = !transparent && largestExtent > minCastExtent;
    mesh.receiveShadow = largestExtent > minReceiveExtent;
  });
}
