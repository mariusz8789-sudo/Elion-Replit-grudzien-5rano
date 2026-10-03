import type * as THREE_NS from 'three';
import { FULL_ATLAS_HIDDEN_BY_DEFAULT, FULL_ATLAS_SYSTEM_COLOR, type FullAtlasOrganMesh, type FullAtlasPartRange, type FullAtlasSystemMesh } from './bodyParts3dFullAtlas';
import { AtlasPartPicker, type AtlasPickSystem } from './atlasPartPicker';
import { brainRegionOf } from './brainParts';
import { anatomySideOf } from './anatomyNamesPl';
import { organName, structureText, tx } from './explorerText';
import { getLocale } from '../i18n';
import { EXPLORE_ORGANS, organsInRegion, regionOfAtlasPoint, REGION_LABEL, structureLabel, type BodyRegionId, type ExploreHitData, type ExploreState } from './anatomyExplore';

/**
 * The explored organs drawn IN the body: each organ's atlas structures sit in the twin's own atlas
 * group (same transform as the body), hidden until their region is in focus. Materials are shared per
 * organ (brain: per region) and swapped, never mutated per mesh, so hundreds of parts cost a handful of
 * materials. Picking only ever tests the set that belongs to the current level.
 */

export type ExploreHit = ExploreHitData;

export interface ExploreLabel {
  readonly key: string;
  readonly text: string;
  readonly hit: ExploreHit;
  readonly world: THREE_NS.Vector3;
}

/** Region bands in atlas units (fractions of the body height), the camera's framing boxes. */
const REGION_BOX: Readonly<Record<BodyRegionId, { y: [number, number]; x: number }>> = {
  head: { y: [0.855, 1.0], x: 0.07 },
  chest: { y: [0.7, 0.855], x: 0.11 },
  abdomen: { y: [0.57, 0.7], x: 0.1 },
  pelvis: { y: [0.47, 0.57], x: 0.1 },
  arms: { y: [0.44, 0.83], x: 0.2 },
  legs: { y: [0.0, 0.47], x: 0.09 },
};

const ORGAN_COLOR: Readonly<Record<string, number>> = {
  eyes: FULL_ATLAS_SYSTEM_COLOR.sensory ?? 0xb0c8ce, heart: 0xc0564e, airways: 0xd9a3aa, aorta: FULL_ATLAS_SYSTEM_COLOR.arterial ?? 0xc05245,
  stomach: 0xc99a70, liver: 0x8f4a3c, pancreas: 0xd8b07a, intestine: 0xc8957a, spleen: 0x8a4a5a, kidneys: 0xa0584c, bladder: 0xc9a07f, rectum: 0xb8806a,
};

/**
 * The brain's outer shell (the lobes' cortex and the white matter under it). With the brain in focus it
 * turns to faint glass, so the deep structures (hippocampus, amygdala, thalamus...) show and take the tap.
 */
const BRAIN_OUTER: ReadonlySet<string> = new Set(['frontal', 'parietal', 'temporal', 'occipital', 'white', 'other']);
/** Deep landmarks named on the brain once it is in focus; the first atlas part matching each key is labelled. */
const BRAIN_LANDMARKS: readonly ((name: string) => boolean)[] = [
  (n) => n.includes('hippocampus') && !n.includes('parahippocampal'),
  (n) => n.includes('amygdala'),
  (n) => n.includes('thalamus') && !/hypothalamus|stria|sub/.test(n),
  (n) => n.includes('cerebell'),
  (n) => n.includes('pons'),
];

/** The atlas system each explored organ belongs to, so peeling a layer also peels its organs. */
const ORGAN_SYSTEM: Readonly<Record<string, string>> = { brain: 'nervous', eyes: 'sensory', heart: 'cardiac', airways: 'respiratory', aorta: 'arterial', spleen: 'lymphatic', kidneys: 'urinary', bladder: 'urinary' };

export class AnatomyFocusLayer {
  private hiddenSystems: ReadonlySet<string> = new Set();
  private readonly groups = new Map<string, THREE_NS.Group>();
  private readonly mats: THREE_NS.MeshStandardMaterial[] = [];
  private readonly dim: THREE_NS.MeshStandardMaterial;
  private readonly picked: THREE_NS.MeshStandardMaterial;
  private readonly ghost: THREE_NS.MeshBasicMaterial;
  private readonly ray: THREE_NS.Raycaster;
  private state: ExploreState | null = null;
  /** The body's outline in atlas units (feet at y = 0), measured once from the systems' own bounds. */
  private readonly bodyBox: THREE_NS.Box3;

  /** Every other structure of the body (muscles, bones, vessels, nerves...), found without splitting the body. */
  private readonly picker: AtlasPartPicker;
  private highlight: THREE_NS.Mesh | null = null;

  constructor(private readonly THREE: typeof THREE_NS, private readonly atlasGroup: THREE_NS.Group, organs: ReadonlyMap<string, FullAtlasOrganMesh>, private readonly heightMeters: number, systems: readonly FullAtlasSystemMesh[] = []) {
    this.ray = new THREE.Raycaster();
    this.bodyBox = new THREE.Box3();
    for (const child of atlasGroup.children) {
      const geometry = (child as THREE_NS.Mesh).geometry;
      if (!(child as THREE_NS.Mesh).isMesh || !geometry || !child.name.startsWith('atlas:')) continue;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      this.bodyBox.union(geometry.boundingBox!);
    }
    const mat = (color: number, extra: Partial<THREE_NS.MeshStandardMaterialParameters> = {}): THREE_NS.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, emissive: color, emissiveIntensity: 0.08, ...extra });
      this.mats.push(m); return m;
    };
    this.dim = mat(0x9fb4c0, { transparent: true, opacity: 0.14, depthWrite: false });
    this.picked = mat(0x7fe3ff, { emissive: 0x2fc7ff, emissiveIntensity: 0.75 });
    // Unlit and very faint: lit (rim-lit) gyri, dozens deep, would otherwise add up to a white blob.
    this.ghost = new THREE.MeshBasicMaterial({ color: 0x5f7d92, transparent: true, opacity: 0.05, depthWrite: false });
    const pickSystems: AtlasPickSystem[] = [];
    for (const sys of systems) {
      const mesh = atlasGroup.children.find((c) => c.name === `atlas:${sys.system}`) as THREE_NS.Mesh | undefined;
      if (mesh && sys.parts) pickSystems.push({ system: sys.system, mesh, parts: sys.parts });
    }
    this.picker = new AtlasPartPicker(THREE, pickSystems);
    const brainMats = new Map<string, THREE_NS.MeshStandardMaterial>();
    for (const organ of EXPLORE_ORGANS) {
      const data = organs.get(organ.id);
      if (!data) continue;
      const group = new THREE.Group(); group.name = `explore:${organ.id}`; group.visible = false;
      const base = organ.id === 'brain' ? null : mat(ORGAN_COLOR[organ.id] ?? 0xc79a8a);
      for (const part of data.parts) {
        let m = base;
        if (!m) {
          const region = brainRegionOf(part.name);
          m = brainMats.get(region.id) ?? mat(region.color);
          brainMats.set(region.id, m);
        }
        const mesh = new THREE.Mesh(part.geometry, m);
        mesh.name = `explore-part:${part.name}`;
        mesh.userData = { partName: part.name, organId: organ.id, baseMaterial: m };
        group.add(mesh);
      }
      this.groups.set(organ.id, group);
      atlasGroup.add(group);
    }
  }

  /** Peel layers: these atlas systems (and their organs) are taken off the body; the rest stays. */
  setHiddenSystems(systems: readonly string[], forceShow: readonly string[] = []): void {
    this.hiddenSystems = new Set(systems);
    for (const child of this.atlasGroup.children) {
      if (!child.name.startsWith('atlas:')) continue;
      const system = child.name.slice(6);
      child.visible = !this.hiddenSystems.has(system) && (forceShow.includes(system) || !FULL_ATLAS_HIDDEN_BY_DEFAULT.includes(system));
    }
    if (this.state) this.apply(this.state);
  }

  /** The open section cuts the explored organs too (their own materials are not the atlas's). */
  setClipping(plane: THREE_NS.Plane | null): void {
    for (const m of [...this.mats, this.ghost]) { m.clippingPlanes = plane ? [plane] : null; m.side = plane ? this.THREE.DoubleSide : this.THREE.FrontSide; m.needsUpdate = true; }
  }

  /** Organs the atlas actually provides (a region with none still focuses, it just offers no organ). */
  hasOrgan(id: string): boolean { return this.groups.has(id); }

  apply(state: ExploreState): void {
    this.state = state;
    // Never dispose: the highlight shares its system's vertex buffers, and disposing would free them.
    this.highlight?.removeFromParent(); this.highlight = null;
    const range = this.partRange(state);
    if (range && state.system && !this.hiddenSystems.has(state.system)) {
      this.highlight = this.picker.highlightMesh(state.system, range, this.picked);
      if (this.highlight) this.atlasGroup.add(this.highlight);
    }
    const region = new Set(organsInRegion(state.regionId).map((o) => o.id));
    for (const [id, group] of this.groups) {
      // The chosen organ stays in view when its system is filtered out: its vessels or nerves are shown around it.
      group.visible = state.level !== 'BODY' && region.has(id) && (state.organId === id || !this.hiddenSystems.has(ORGAN_SYSTEM[id] ?? 'digestive'));
      if (!group.visible) continue;
      const selected = state.organId === id;
      const others = state.organId !== null && !selected;
      for (const child of group.children) {
        const mesh = child as THREE_NS.Mesh;
        const base = mesh.userData.baseMaterial as THREE_NS.Material;
        if (others) { mesh.material = this.dim; continue; }
        if (!selected) { mesh.material = base; continue; }
        // The tapped structure glows; the rest of its organ keeps its colours (a hundred dimmed layers would add up to white).
        const outer = id === 'brain' && BRAIN_OUTER.has(brainRegionOf(mesh.userData.partName as string).id);
        if (state.level === 'STRUCTURE' && mesh.userData.partName === state.structure) mesh.material = this.picked;
        else mesh.material = outer ? this.ghost : base;
        // The selected organ glows a little so the eye lands on it; the others keep their own colour.
        (base as THREE_NS.MeshStandardMaterial).emissiveIntensity = selected ? 0.3 : 0.08;
      }
    }
  }

  /**
   * What a tap at this ray means at the current level; null when it lands on nothing that level offers.
   * Organ parts are ray-tested (only the active region's handful); the body itself never is: a tap is
   * placed on the body's frontal plane and read as a region, so 2.2 M atlas triangles are never walked.
   */
  pick(ray: THREE_NS.Ray): ExploreHit | null {
    const state = this.state; if (!state) return null;
    this.ray.ray.copy(ray);
    const partsOf = (ids: readonly string[]): THREE_NS.Object3D[] => ids.flatMap((id) => this.groups.get(id)?.children ?? []);
    let best: { hit: ExploreHit; d: number } | null = null;
    const consider = (hit: ExploreHit, d: number): void => { if (!best || d < best.d) best = { hit, d }; };
    if (state.level === 'ORGAN' || (state.level === 'STRUCTURE' && state.organId)) {
      // Glass (the brain's ghosted shell) lets the tap through to what lies inside it.
      const own = this.ray.intersectObjects(partsOf([state.organId!]), false).find((h) => (h.object as THREE_NS.Mesh).material !== this.ghost);
      if (own) consider({ kind: 'structure', name: own.object.userData.partName as string }, own.distance);
    }
    if (state.level !== 'BODY') {
      const ids = organsInRegion(state.regionId).map((o) => o.id).filter((id) => id !== state.organId);
      const other = this.ray.intersectObjects(partsOf(ids), false)[0];
      if (other) consider({ kind: 'organ', id: other.object.userData.organId as string }, other.distance);
      // Any structure of the solid (not see-through) layers: a muscle of the calf, the bone under it...
      this.atlasGroup.updateWorldMatrix(true, false);
      const inv = new this.THREE.Matrix4().copy(this.atlasGroup.matrixWorld).invert();
      const part = this.picker.pick(ray.clone().applyMatrix4(inv), (sys) => sys.mesh.visible && !((sys.mesh.material as THREE_NS.Material).opacity < 0.5));
      if (part) {
        const d = part.point.clone().applyMatrix4(this.atlasGroup.matrixWorld).distanceTo(ray.origin);
        // An organ's own structure is the same surface as its atlas part: on a tie the organ wins.
        consider({ kind: 'part', name: part.name, system: part.system }, d + 1e-4);
      }
    }
    if (best) return (best as { hit: ExploreHit }).hit;
    const local = this.bodyPlanePoint(ray);
    if (!local) return null;
    const id = regionOfAtlasPoint(local.x - this.bodyBox.getCenter(new this.THREE.Vector3()).x, local.y, this.heightMeters);
    return id !== state.regionId ? { kind: 'region', id } : null;
  }

  /** Search every structure by its Polish or atlas name; each result carries the body region it sits in. */
  search(query: string, limit = 8): { name: string; label: string; system: string; regionId: BodyRegionId }[] {
    const norm = (t: string): string => t.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');
    const q = norm(query.trim());
    if (q.length < 2) return [];
    const cx = this.bodyBox.getCenter(new this.THREE.Vector3()).x;
    const out: { name: string; label: string; system: string; regionId: BodyRegionId; score: number }[] = [];
    const seen = new Set<string>();
    for (const { system, range } of this.picker.all()) {
      const base = structureText(null, range.name, system).label;
      const side = anatomySideOf(range.name);
      // Polish names drop the side; the English atlas name already carries it.
      const label = side && getLocale() === 'pl' ? `${base} (${side} ${tx('side')})` : base;
      const hay = norm(`${label} ${structureLabel(null, range.name, system).label} ${range.name}`);
      const at = hay.indexOf(q);
      if (at < 0 || seen.has(range.name)) continue;
      seen.add(range.name);
      const [min, max] = range.bounds;
      const regionId = regionOfAtlasPoint((min[0]! + max[0]!) / 2 - cx, (min[1]! + max[1]!) / 2, this.heightMeters);
      out.push({ name: range.name, label, system, regionId, score: (norm(label).startsWith(q) ? 0 : 1) + at / 100 });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, limit).map(({ score: _s, ...r }) => r);
  }

  /** Find a structure by its atlas name (search), in any system. */
  findPart(name: string): { name: string; system: string } | null {
    for (const system of ['muscular', 'skeletal', 'arterial', 'venous', 'nervous', 'sensory', 'connective', 'cardiac', 'digestive', 'respiratory', 'urinary', 'endocrine', 'lymphatic', 'reproductive', 'integumentary']) {
      if (this.picker.find(system, name)) return { name, system };
    }
    return null;
  }

  private partRange(state: ExploreState): FullAtlasPartRange | null {
    return state.level === 'STRUCTURE' && !state.organId && state.system && state.structure ? this.picker.find(state.system, state.structure) : null;
  }

  private rangeBox(range: FullAtlasPartRange, out: THREE_NS.Box3): THREE_NS.Box3 {
    const [min, max] = range.bounds;
    out.min.set(min[0]!, min[1]!, min[2]!); out.max.set(max[0]!, max[1]!, max[2]!);
    return out;
  }

  /** Where the ray crosses the body's frontal plane, in atlas units; null off the body's outline box. */
  private bodyPlanePoint(ray: THREE_NS.Ray): THREE_NS.Vector3 | null {
    const THREE = this.THREE;
    this.atlasGroup.updateWorldMatrix(true, false);
    const inv = new THREE.Matrix4().copy(this.atlasGroup.matrixWorld).invert();
    const local = ray.clone().applyMatrix4(inv);
    const hit = local.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.bodyBox.getCenter(new THREE.Vector3()).z), new THREE.Vector3());
    if (!hit) return null;
    const b = this.bodyBox;
    return hit.x >= b.min.x && hit.x <= b.max.x && hit.y >= b.min.y && hit.y <= b.max.y ? hit : null;
  }

  /** The world box the camera frames for the current focus. */
  focusBox(state: ExploreState, out: THREE_NS.Box3): THREE_NS.Box3 | null {
    const organGroup = state.organId ? this.groups.get(state.organId) : undefined;
    if (organGroup && (state.level === 'ORGAN' || state.level === 'STRUCTURE')) {
      organGroup.updateWorldMatrix(true, true);
      return out.setFromObject(organGroup);
    }
    const range = this.partRange(state);
    if (range) { this.atlasGroup.updateWorldMatrix(true, false); return this.rangeBox(range, out).applyMatrix4(this.atlasGroup.matrixWorld); }
    if (!state.regionId) return null;
    const band = REGION_BOX[state.regionId]; const h = this.heightMeters;
    const c = this.bodyBox.getCenter(new this.THREE.Vector3());
    out.min.set(c.x - band.x * h, band.y[0] * h, c.z - 0.12); out.max.set(c.x + band.x * h, band.y[1] * h, c.z + 0.12);
    this.atlasGroup.updateWorldMatrix(true, false);
    return out.applyMatrix4(this.atlasGroup.matrixWorld);
  }

  /** Names next to the anatomy: the region's organs, or the tapped structure. At most six on screen. */
  labels(state: ExploreState): ExploreLabel[] {
    this.atlasGroup.updateWorldMatrix(true, false);
    const at = (o: THREE_NS.Object3D): THREE_NS.Vector3 => this.localCentre(o).clone().applyMatrix4(this.atlasGroup.matrixWorld);
    if (state.level === 'REGION' || state.level === 'ORGAN') {
      // The organ in focus keeps its neighbours' names beside it: a tap on one moves to that organ.
      const organs: ExploreLabel[] = organsInRegion(state.regionId).filter((o) => this.groups.has(o.id)).slice(0, 6)
        .map((o) => ({ key: o.id, text: organName(o.id), hit: { kind: 'organ', id: o.id } as const, world: at(this.groups.get(o.id)!) }));
      if (state.level !== 'ORGAN' || state.organId !== 'brain') return organs;
      const parts = this.groups.get('brain')?.children ?? [];
      const deep = BRAIN_LANDMARKS.flatMap((test) => {
        const mesh = parts.find((c) => test(String(c.userData.partName).toLowerCase()));
        if (!mesh) return [];
        const name = mesh.userData.partName as string;
        return [{ key: `brain-${name}`, text: structureText('brain', name).label, hit: { kind: 'structure', name } as const, world: at(mesh) }];
      });
      return [...organs.filter((o) => o.key !== 'brain'), ...deep];
    }
    const range = this.partRange(state);
    if (range && state.structure) {
      if (this.hiddenSystems.has(state.system!)) return [];
      const c = this.rangeBox(range, new this.THREE.Box3()).getCenter(new this.THREE.Vector3()).applyMatrix4(this.atlasGroup.matrixWorld);
      return [{ key: state.structure, text: structureText(null, state.structure, state.system).label, hit: { kind: 'part', name: state.structure, system: state.system! }, world: c }];
    }
    if (state.level === 'STRUCTURE' && state.structure) {
      const mesh = this.groups.get(state.organId!)?.children.find((c) => c.userData.partName === state.structure);
      return mesh ? [{ key: state.structure, text: structureText(state.organId, state.structure).label, hit: { kind: 'structure', name: state.structure }, world: at(mesh) }] : [];
    }
    return [];
  }

  /** Centre of an organ or a part in atlas units, measured once (the geometry never moves inside the atlas). */
  private readonly centres = new Map<THREE_NS.Object3D, THREE_NS.Vector3>();
  private localCentre(o: THREE_NS.Object3D): THREE_NS.Vector3 {
    let c = this.centres.get(o);
    if (!c) {
      const box = new this.THREE.Box3();
      o.traverse((node) => { const g = (node as THREE_NS.Mesh).geometry; if (!g) return; if (!g.boundingBox) g.computeBoundingBox(); box.union(g.boundingBox!); });
      c = box.getCenter(new this.THREE.Vector3());
      this.centres.set(o, c);
    }
    return c;
  }

  regionLabel(id: BodyRegionId): string { return REGION_LABEL[id]; }

  dispose(): void {
    // Never dispose: the highlight shares its system's vertex buffers, and disposing would free them.
    this.highlight?.removeFromParent(); this.highlight = null;
    for (const g of this.groups.values()) g.removeFromParent();
    this.groups.clear();
    for (const m of this.mats) m.dispose();
    this.ghost.dispose();
  }
}
