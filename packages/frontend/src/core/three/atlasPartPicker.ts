import type * as THREE_NS from 'three';
import type { FullAtlasPartRange } from './bodyParts3dFullAtlas';

/**
 * Finds WHICH of the atlas's 2,234 structures a tap lands on, without splitting the body into 2,234
 * meshes: every system stays one merged geometry (15 draw calls), and each structure is known by its
 * index range and its bounds. A ray first meets the structures' boxes (cheap), then only those few are
 * tested triangle by triangle, nearest box first, stopping as soon as nothing nearer can exist.
 */

export interface AtlasPickSystem {
  readonly system: string;
  readonly mesh: THREE_NS.Mesh;
  readonly parts: readonly FullAtlasPartRange[];
}

export interface AtlasPartHit {
  readonly name: string;
  readonly system: string;
  /** Hit point in atlas units. */
  readonly point: THREE_NS.Vector3;
  readonly range: FullAtlasPartRange;
}

interface PartBox { box: THREE_NS.Box3; sys: AtlasPickSystem; range: FullAtlasPartRange }

export class AtlasPartPicker {
  private readonly boxes: PartBox[] = [];

  constructor(private readonly THREE: typeof THREE_NS, private readonly systems: readonly AtlasPickSystem[]) {
    for (const sys of systems) for (const range of sys.parts) {
      const [min, max] = range.bounds;
      this.boxes.push({ box: new THREE.Box3(new THREE.Vector3(min[0], min[1], min[2]), new THREE.Vector3(max[0], max[1], max[2])), sys, range });
    }
  }

  /** Nearest structure hit by a ray given in atlas units, among the systems `pickable` accepts. */
  pick(ray: THREE_NS.Ray, pickable: (sys: AtlasPickSystem) => boolean): AtlasPartHit | null {
    const THREE = this.THREE;
    const entry = new THREE.Vector3();
    const candidates: { d: number; item: PartBox }[] = [];
    const allowed = new Map<AtlasPickSystem, boolean>();
    for (const item of this.boxes) {
      let ok = allowed.get(item.sys);
      if (ok === undefined) { ok = pickable(item.sys); allowed.set(item.sys, ok); }
      if (!ok) continue;
      if (item.box.containsPoint(ray.origin)) { candidates.push({ d: 0, item }); continue; }
      if (ray.intersectBox(item.box, entry)) candidates.push({ d: entry.distanceTo(ray.origin), item });
    }
    candidates.sort((a, b) => a.d - b.d);
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const hit = new THREE.Vector3();
    let best: AtlasPartHit | null = null; let bestD = Infinity;
    for (const { d, item } of candidates) {
      if (d > bestD) break;
      const geometry = item.sys.mesh.geometry;
      const pos = geometry.getAttribute('position') as THREE_NS.BufferAttribute;
      const index = geometry.getIndex()!.array;
      const end = item.range.start + item.range.count;
      for (let i = item.range.start; i < end; i += 3) {
        a.fromBufferAttribute(pos, index[i]!); b.fromBufferAttribute(pos, index[i + 1]!); c.fromBufferAttribute(pos, index[i + 2]!);
        if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
        const dist = hit.distanceTo(ray.origin);
        if (dist < bestD) { bestD = dist; best = { name: item.range.name, system: item.sys.system, point: hit.clone(), range: item.range }; }
      }
    }
    return best;
  }

  /** A mesh drawing just one structure, sharing its system's vertices (no copy of the geometry). */
  highlightMesh(system: string, range: FullAtlasPartRange, material: THREE_NS.Material): THREE_NS.Mesh | null {
    const sys = this.systems.find((s) => s.system === system);
    if (!sys) return null;
    const source = sys.mesh.geometry;
    const g = new this.THREE.BufferGeometry();
    g.setAttribute('position', source.getAttribute('position'));
    g.setAttribute('normal', source.getAttribute('normal'));
    const index = source.getIndex()!.array as Uint32Array;
    g.setIndex(new this.THREE.BufferAttribute(index.subarray(range.start, range.start + range.count), 1));
    const mesh = new this.THREE.Mesh(g, material);
    mesh.name = `explore-highlight:${range.name}`;
    mesh.renderOrder = 2;
    return mesh;
  }

  *all(): Generator<{ system: string; range: FullAtlasPartRange }> {
    for (const sys of this.systems) for (const range of sys.parts) yield { system: sys.system, range };
  }

  find(system: string, name: string): FullAtlasPartRange | null {
    return this.systems.find((s) => s.system === system)?.parts.find((p) => p.name === name) ?? null;
  }
}
