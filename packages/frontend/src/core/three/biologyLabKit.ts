import type * as THREE_NS from 'three';
import { buildCharacter, type Character } from './characterRig';
import { createColumn, createGlassChamber, createPipe, createPlatform } from './graphics/primitives';
import { createEmissiveInstrumentMaterial, createScreenMaterial, makeReadoutSurface, surfaceNormalFactory, type GenesisMaterialPalette } from './graphics/materials';
import { createPracticalLight } from './graphics/lighting';
import type { HumanDigitalTwinManifest } from '../scientificWorlds/humanLab/types';
import type { VisualLayerInstruction } from '../scientificWorlds/humanLab/visualModes';
import { NEURO_REGIONS } from '../scientificWorlds/humanLab/neuroLab';
import { applyRimLight, isRimPatched, selectionPulse, setMaterialRimIntensity, setMaterialXray, setSurfaceMode, type TwinSurfaceMode } from './humanTwinMaterials';
import { createCutaway, measureCutawayBounds, setClippingOnObject, setSectionShellSides, type CutawayHandle, type CutawayState } from './humanTwinCutaway';
import type { LoadedHumanTwinBody, HumanTwinTier } from './humanTwinAsset';

/**
 * GENESIS GRAPHICS ENGINE — HUMAN BIOLOGY LAB KIT (architecture + the twin).
 *
 * Kit functions in the same convention as labKit/electricalKit: `(THREE,
 * options)` → an Object3D or a small handle; no scene ownership, no world
 * knowledge. This is what the V3 pack's `createGenesisBiologyLabScene()`
 * asset slots are bound to in this repository:
 *
 *   lab.architecture.floor/ceiling/glass-wall.*  → createLayeredCeiling / createGlassCurtainWall (procedural, PBR palette)
 *   human.body.high_fidelity.glb                 → createTwinProxy: the repository has NO approved human GLB
 *                                                  (assetGovernance lists mpfb-lod0.glb as UNVERIFIED), so the twin is the
 *                                                  Genesis character rig at the manifest's 1:1 height with a skin material —
 *                                                  an explicit PROXY, labelled as such in the HUD, never presented as photoreal.
 *   human.organ.*.high_fidelity.glb              → createTwinProxy organ proxies: ellipsoids at the atlas's own positions and
 *                                                  dimensions (MODEL), brain regions from NEURO_REGIONS.
 *   lab.sign.*                                   → createTextSign (canvas readout on an emissive plate)
 *
 * Colour temperatures on the pack's light nodes are honoured through
 * `kelvinToColor` (Tanner Helland's approximation of the black-body locus).
 */

export const TWIN_ASSET_TIER = 'PROXY' as const;

export function kelvinToColor(THREE: typeof THREE_NS, kelvin: number): THREE_NS.Color {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  const clamp = (v: number): number => Math.max(0, Math.min(255, v)) / 255;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  return new THREE.Color(clamp(r), clamp(g), clamp(b));
}

/** A matte, lightly-sheened epoxy floor (a biomedical facility floor, not the physics lab's worn wet concrete). */
export function createEpoxyFloor(THREE: typeof THREE_NS): THREE_NS.MeshStandardMaterial {
  const floor = new THREE.MeshPhysicalMaterial({
    color: 0x14232c,
    roughness: 0.46,
    metalness: 0.06,
    clearcoat: 0.24,
    clearcoatRoughness: 0.38,
    normalMap: surfaceNormalFactory(THREE)(10, 10),
    normalScale: new THREE.Vector2(0.026, 0.026),
    envMapIntensity: 0.52,
  });
  floor.name = 'biology-epoxy-cinematic';
  floor.userData.finish = 'MATTE_EPOXY_LOW_GLARE';
  return floor;
}

/** Lumens on the pack's nodes onto three.js point/spot intensity at this room's exposure (documented mapping, not a photometric claim). */
export function lumensToIntensity(lumens: number): number { return Math.max(1, lumens / 380); }
/** The pack's key (12 000 lm) at this exposure: 0.6 × the lumen mapping; fill/rim at 0.35 × — measured on the first renders (the floor blew out at 1.4 ×). */

export interface TextSignOptions {
  position: THREE_NS.Vector3Tuple; headingRadians?: number; width?: number; height?: number;
  text: string; subtext?: string; color?: string; frameMaterial: THREE_NS.Material;
}

/** A hanging/wall sign whose face is a live canvas: readable station names instead of blank emissive plates. */
export function createTextSign(THREE: typeof THREE_NS, opts: TextSignOptions): THREE_NS.Group {
  const g = new THREE.Group(); g.position.set(...opts.position); g.rotation.y = opts.headingRadians ?? 0; g.name = `sign:${opts.text}`;
  const w = opts.width ?? 1.4; const h = opts.height ?? 0.34;
  const { ctx, canvas, texture } = makeReadoutSurface(THREE, 512, 128);
  ctx.fillStyle = '#0a1219'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = opts.color ?? '#7dd3fc'; ctx.lineWidth = 4; ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  ctx.fillStyle = opts.color ?? '#7dd3fc'; ctx.font = 'bold 44px monospace'; ctx.textBaseline = 'middle';
  ctx.fillText(opts.text.toUpperCase(), 24, opts.subtext ? 46 : 64);
  if (opts.subtext) { ctx.fillStyle = '#9fb3c8'; ctx.font = '26px monospace'; ctx.fillText(opts.subtext, 24, 92); }
  texture.needsUpdate = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, h + 0.08, 0.05), opts.frameMaterial); g.add(plate);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), createScreenMaterial(THREE, texture, { emissiveIntensity: 0.75, tint: 0xffffff })); face.position.z = 0.03; g.add(face);
  const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.03; g.add(back);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 8), opts.frameMaterial); rod.position.y = h / 2 + 0.45; g.add(rod);
  return g;
}

export interface LayeredCeilingOptions {
  center: THREE_NS.Vector3Tuple; width: number; depth: number; height: number;
  slabMaterial: THREE_NS.Material; beamMaterial: THREE_NS.Material; ductMaterial: THREE_NS.Material;
  /** Coffer pitch in metres (beam grid). */
  pitch?: number;
  /** Where the (few) real practical lights go — the emissive troughs in every coffer are geometry only. */
  practicalSpots: readonly [number, number][];
  practicalColor: THREE_NS.ColorRepresentation;
}

/** A three-layer ceiling: structural slab, a service layer of ducts, and a suspended coffer grid with a light trough in every coffer. */
export function createLayeredCeiling(THREE: typeof THREE_NS, scene: THREE_NS.Scene, opts: LayeredCeilingOptions): { group: THREE_NS.Group; troughs: THREE_NS.MeshStandardMaterial } {
  const g = new THREE.Group(); g.name = 'ceiling:layered';
  const [cx, , cz] = opts.center; const W = opts.width; const D = opts.depth; const H = opts.height; const pitch = opts.pitch ?? 4;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(W, D), opts.slabMaterial); slab.rotation.x = Math.PI / 2; slab.position.set(cx, H, cz); g.add(slab);
  // Service layer: two duct runs along X and one along Z, between the slab and the grid.
  for (const z of [cz - D * 0.28, cz + D * 0.3]) g.add(createPipe(THREE, opts.ductMaterial, { from: [cx - W / 2 + 0.3, H - 0.16, z], to: [cx + W / 2 - 0.3, H - 0.16, z], radius: 0.13 }));
  g.add(createPipe(THREE, opts.ductMaterial, { from: [cx - W * 0.1, H - 0.18, cz - D / 2 + 0.3], to: [cx - W * 0.1, H - 0.18, cz + D / 2 - 0.3], radius: 0.1 }));
  // Suspended coffer grid.
  const gridY = H - 0.42;
  const beamX = new THREE.BoxGeometry(W, 0.3, 0.16); const beamZ = new THREE.BoxGeometry(0.16, 0.3, D);
  for (let z = cz - D / 2; z <= cz + D / 2 + 1e-6; z += pitch) { const b = new THREE.Mesh(beamX, opts.beamMaterial); b.position.set(cx, gridY, z); g.add(b); }
  for (let x = cx - W / 2; x <= cx + W / 2 + 1e-6; x += pitch) { const b = new THREE.Mesh(beamZ, opts.beamMaterial); b.position.set(x, gridY, cz); g.add(b); }
  // A light trough in every coffer (emissive geometry; the light budget is the handful of practicals below).
  const troughs = createEmissiveInstrumentMaterial(THREE, { color: 0xe6f3ff, intensity: 1.5, baseColor: 0x2a3644 });
  const troughGeo = new THREE.BoxGeometry(pitch * 0.62, 0.05, 0.26);
  const housingGeo = new THREE.BoxGeometry(pitch * 0.66, 0.08, 0.34);
  for (let x = cx - W / 2 + pitch / 2; x < cx + W / 2; x += pitch) {
    for (let z = cz - D / 2 + pitch / 2; z < cz + D / 2; z += pitch) {
      const housing = new THREE.Mesh(housingGeo, opts.beamMaterial); housing.position.set(x, gridY - 0.02, z); g.add(housing);
      const t = new THREE.Mesh(troughGeo, troughs); t.position.set(x, gridY - 0.07, z); g.add(t);
    }
  }
  for (const [x, z] of opts.practicalSpots) createPracticalLight(THREE, scene, { position: [x, gridY - 0.3, z], color: opts.practicalColor, intensity: 4.2, distance: 9.5, decay: 1.7 });
  scene.add(g);
  return { group: g, troughs };
}

export interface GlassCurtainWallOptions {
  /** Wall centre at the floor line. */
  position: THREE_NS.Vector3Tuple; headingRadians: number; width: number; height: number;
  glass: THREE_NS.Material; mullionMaterial: THREE_NS.Material; plinthMaterial: THREE_NS.Material;
  /** Materials for the corridor seen through the glass. */
  corridorFloor: THREE_NS.Material; corridorWall: THREE_NS.Material; corridorDepth?: number;
}

/** A floor-to-ceiling glass wall with mullions and a plinth, and a lit corridor behind it so the glass has depth to show. */
export function createGlassCurtainWall(THREE: typeof THREE_NS, opts: GlassCurtainWallOptions): THREE_NS.Group {
  const g = new THREE.Group(); g.position.set(...opts.position); g.rotation.y = opts.headingRadians; g.name = 'wall:glass';
  const W = opts.width; const H = opts.height; const bay = 2.5; const plinthH = 0.45;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(W, H - plinthH), opts.glass); pane.position.y = plinthH + (H - plinthH) / 2; g.add(pane);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W, plinthH, 0.16), opts.plinthMaterial); plinth.position.y = plinthH / 2; g.add(plinth);
  const mullionGeo = new THREE.BoxGeometry(0.08, H, 0.12);
  for (let x = -W / 2; x <= W / 2 + 1e-6; x += bay) { const m = new THREE.Mesh(mullionGeo, opts.mullionMaterial); m.position.set(x, H / 2, 0); g.add(m); }
  for (const y of [1.25, 2.9, H - 0.05]) { const t = new THREE.Mesh(new THREE.BoxGeometry(W, 0.07, 0.12), opts.mullionMaterial); t.position.y = y; g.add(t); }
  // Corridor behind (local -Z): floor, far wall, columns, a strip of ceiling light.
  const depth = opts.corridorDepth ?? 3.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), opts.corridorFloor); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.005, -depth / 2); g.add(floor);
  const far = new THREE.Mesh(new THREE.PlaneGeometry(W, H), opts.corridorWall); far.position.set(0, H / 2, -depth); g.add(far);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, depth), opts.corridorWall); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, H - 0.02, -depth / 2); g.add(ceiling);
  for (let x = -W / 2 + bay; x < W / 2; x += bay * 2) g.add(createColumn(THREE, opts.mullionMaterial, { position: [x, 0, -depth + 0.4], height: H, radius: 0.14 }));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 0.04, 0.2), createEmissiveInstrumentMaterial(THREE, { color: 0xcfe6ff, intensity: 1.2, baseColor: 0x223040 })); strip.position.set(0, H - 0.1, -depth / 2); g.add(strip);
  return g;
}

export interface ManipulatorHandle { readonly group: THREE_NS.Group; update(t: number): void; setActive(active: boolean): void; }

export interface ManipulatorOptions {
  position: THREE_NS.Vector3Tuple; headingRadians?: number; scale?: number; phase?: number;
  linkMaterial: THREE_NS.Material; jointMaterial: THREE_NS.Material; baseMaterial: THREE_NS.Material;
}

/** A six-axis-looking robotic manipulator (base, shoulder, upper arm, elbow, forearm, wrist, two-finger gripper) with a slow idle sweep. */
export function createManipulatorArm(THREE: typeof THREE_NS, opts: ManipulatorOptions): ManipulatorHandle {
  const s = opts.scale ?? 1; const phase = opts.phase ?? 0;
  const g = new THREE.Group(); g.position.set(...opts.position); g.rotation.y = opts.headingRadians ?? 0; g.scale.setScalar(s); g.name = 'manipulator';
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.12, 24), opts.baseMaterial); base.position.y = 0.06; g.add(base);
  const turret = new THREE.Group(); turret.position.y = 0.12; g.add(turret);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.34, 20), opts.linkMaterial); column.position.y = 0.17; turret.add(column);
  const shoulder = new THREE.Group(); shoulder.position.y = 0.36; turret.add(shoulder);
  shoulder.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 14), opts.jointMaterial));
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.52, 0.09), opts.linkMaterial); upper.position.y = 0.26; shoulder.add(upper);
  const elbow = new THREE.Group(); elbow.position.y = 0.52; shoulder.add(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), opts.jointMaterial));
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.46, 0.07), opts.linkMaterial); fore.position.y = 0.23; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = 0.46; elbow.add(wrist);
  wrist.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), opts.jointMaterial));
  const status = createEmissiveInstrumentMaterial(THREE, { color: 0x62f0a3, intensity: 0.9, baseColor: 0x0b1a14 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.012, 8, 20), status); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; wrist.add(ring);
  const fingerGeo = new THREE.BoxGeometry(0.02, 0.12, 0.03);
  const f1 = new THREE.Mesh(fingerGeo, opts.jointMaterial); f1.position.set(-0.035, 0.1, 0); wrist.add(f1);
  const f2 = new THREE.Mesh(fingerGeo, opts.jointMaterial); f2.position.set(0.035, 0.1, 0); wrist.add(f2);
  let active = false;
  return {
    group: g,
    setActive(a) { active = a; },
    update(t) {
      const speed = active ? 1.6 : 0.5;
      turret.rotation.y = 0.35 * Math.sin(t * 0.3 * speed + phase);
      shoulder.rotation.z = -0.55 + 0.22 * Math.sin(t * 0.55 * speed + phase);
      elbow.rotation.z = 1.05 + 0.3 * Math.sin(t * 0.8 * speed + phase * 1.3);
      wrist.rotation.z = -0.45 + 0.25 * Math.sin(t * 1.1 * speed + phase);
      const open = 0.03 + 0.02 * (0.5 + 0.5 * Math.sin(t * 1.7 * speed + phase));
      f1.position.x = -open; f2.position.x = open;
      status.emissiveIntensity = active ? 1.6 + 0.6 * Math.sin(t * 5) : 0.8;
    },
  };
}

/** Colours per organ system, for the proxies (a legend, not tissue rendering). */
/** Selection silhouette: a cool white fresnel rim that reads against every organ colour and the dark lab. */
const SELECTION_RIM_INTENSITY = 1.35;
const SYSTEM_COLOR: Readonly<Record<string, number>> = { NERVOUS: 0xeab96b, CARDIOVASCULAR: 0xd24a4a, RESPIRATORY: 0xe7a099, DIGESTIVE: 0xc98c5a, URINARY: 0xb07a6a, ENDOCRINE: 0xd9b8e8 };

export interface TwinHandle {
  readonly group: THREE_NS.Group;
  readonly body: Character;
  readonly organs: ReadonlyMap<string, THREE_NS.Mesh>;
  /** What the body is made of: a licensed CC0 asset, or the procedural proxy. Anatomy stays MODEL either way. */
  readonly tier: HumanTwinTier;
  /** Runtime geometry level. The low level reuses the existing procedural body; anatomy proxies are shared. */
  setLod(level: HumanTwinLodLevel): void;
  getLodState(): HumanTwinLodState;
  /** Apply a V3 visual-layer instruction (mode → visible asset slots, translucency, tint) and the selected node. */
  setView(instruction: VisualLayerInstruction, selectedNodeId: string | null): void;
  /** D-131: isolate the listed anatomy nodes (empty = show everything the current mode allows). */
  setIsolated(nodeIds: readonly string[]): void;
  /** D-131: real section plane through the twin (schematic — clipping reveals model proxies, not tissue). */
  setCutaway(state: CutawayState): void;
  /** D-131: the surface presentation of the BODY shell (x-ray is a stylised view of a model, never a radiograph). */
  setSurface(mode: TwinSurfaceMode): void;
  update(t: number): void;
  dispose(): void;
}

export type HumanTwinLodLevel = 'FULL_ASSET' | 'PROXY_LOW';
export interface HumanTwinLodMetrics { readonly triangleCount: number; readonly textureCount: number }
export interface HumanTwinLodState {
  readonly level: HumanTwinLodLevel;
  readonly available: readonly HumanTwinLodLevel[];
  readonly metrics: HumanTwinLodMetrics;
}

function measureLod(root: THREE_NS.Object3D): HumanTwinLodMetrics {
  let triangleCount = 0;
  const textures = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    triangleCount += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        const texture = value as THREE_NS.Texture;
        if (texture?.isTexture) textures.add(texture.uuid);
      }
    }
  });
  return { triangleCount: Math.round(triangleCount), textureCount: textures.size };
}

export interface TwinProxyOptions {
  skinHex: string;
  /** Reference look: the twin as a luminous holographic body (emissive shell + a point cloud sampled from the rig's own vertices). Default false = skin proxy. */
  hologram?: boolean;
  hologramHex?: number;
  /**
   * D-131: the APPROVED, licence-verified human GLB. When present it replaces the procedural rig as the
   * body — the twin looks like a person instead of a glowing mannequin. Its ANATOMY is unchanged: the
   * organ proxies below are still atlas ellipsoids (MODEL), and the asset carries no medical anatomy.
   */
  bodyAsset?: LoadedHumanTwinBody | null;
}

/**
 * The Human Digital Twin as a PROXY: the character rig at the manifest's 1:1 height with a skin material, and one ellipsoid
 * per ORGAN node at the atlas's position/dimensions (plus the NEURO_REGIONS inside the brain). The mesh is a stand-in; the
 * geometry it stands at (heights, organ positions, sizes) is the pack's own data, which is what the visual modes reveal.
 */
export function createTwinProxy(THREE: typeof THREE_NS, manifest: HumanDigitalTwinManifest, opts: TwinProxyOptions): TwinHandle {
  const g = new THREE.Group(); g.name = 'twin:proxy';
  const body = buildCharacter(THREE, { height: manifest.parameters.heightMeters });
  const asset = opts.bodyAsset ?? null;
  const tier: HumanTwinTier = asset ? asset.tier : 'PROXY';
  const holo = opts.hologram === true && !asset; const holoColor = opts.hologramHex ?? 0x9fe9ff;
  const skin = holo
    ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(holoColor), emissive: new THREE.Color(holoColor), emissiveIntensity: 0.38, roughness: 0.32, metalness: 0, transparent: true, opacity: 0.34, depthWrite: false, clearcoat: 0.18, clearcoatRoughness: 0.3 })
    : new THREE.MeshPhysicalMaterial({ color: new THREE.Color(opts.skinHex), roughness: 0.42, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.5, transparent: true, opacity: 1, depthWrite: true });
  // D-131: with an approved licensed asset the GLB IS the body; the procedural rig stays built (the
  // Character handle is part of the contract) but is hidden, so no second body is ever on screen.
  const shellMaterials: THREE_NS.Material[] = [];
  // The procedural body is the real low-LOD representation even when the licensed body is present.
  // It receives the same surface controls and stays hidden until selected; no geometry is generated on a switch.
  body.root.traverse((o) => { const m = o as THREE_NS.Mesh; if (m.isMesh) { m.material = skin; m.castShadow = !holo; } });
  shellMaterials.push(skin);
  if (!isRimPatched(skin)) applyRimLight(THREE, skin, { color: new THREE.Color(opts.hologramHex ?? 0x7dd3fc), power: 3.0, intensity: holo ? 0.1 : 0.22 });
  if (asset) {
    body.root.visible = false;
    g.add(asset.root);
    const rim = new THREE.Color(opts.hologramHex ?? 0x7dd3fc);
    for (const mesh of asset.meshes) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m || shellMaterials.includes(m)) continue;
        shellMaterials.push(m);
        // The asset's own PBR material is kept; only a fresnel rim is injected on top of it.
        if (!isRimPatched(m)) applyRimLight(THREE, m, { color: rim, power: 3.0, intensity: 0.28 });
      }
    }
  }
  if (body.helmet) body.helmet.visible = false;
  g.add(body.root);
  // The point-mesh look of the reference: one point per rig vertex, in the rig's own bind pose (a presentation layer over the same proxy).
  let cloud: THREE_NS.Points | null = null; let cloudMat: THREE_NS.PointsMaterial | null = null;
  if (holo) {
    body.root.updateMatrixWorld(true);
    const pts: number[] = []; const v = new THREE.Vector3();
    body.root.traverse((o) => { const m = o as THREE_NS.Mesh; if (!m.isMesh || !m.visible) return; const pos = m.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i += 2) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); pts.push(v.x, v.y, v.z); } });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    cloudMat = new THREE.PointsMaterial({ color: holoColor, size: 0.009, transparent: true, opacity: 0.68, depthWrite: false, sizeAttenuation: true });
    cloud = new THREE.Points(geo, cloudMat); cloud.name = 'twin:points'; g.add(cloud);
  }
  const organs = new Map<string, THREE_NS.Mesh>();
  const sphere = new THREE.SphereGeometry(1, 22, 16);
  const organMats: THREE_NS.MeshStandardMaterial[] = [];
  const selectionRim = new THREE.Color(0xd8f6ff);
  for (const n of manifest.nodes) {
    if (n.kind !== 'ORGAN') continue;
    const color = SYSTEM_COLOR[n.system ?? ''] ?? 0xc7a08a;
    // Opaque by default: a fully shown organ must write depth, or overlapping organs sort by object centre
    // and pop through each other. Only a dimmed (isolation context) organ goes transparent — see applyOrgans.
    const mat = new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: 0.14, roughness: 0.52, clearcoat: 0.2, clearcoatRoughness: 0.48 });
    // A dormant fresnel rim: the selection highlight is a bright silhouette, not just a brighter fill.
    applyRimLight(THREE, mat, { color: selectionRim, power: 2.2, intensity: 0 });
    organMats.push(mat);
    const m = new THREE.Mesh(sphere, mat); m.name = `organ:${n.id}`;
    m.position.set(n.positionMeters.x, n.positionMeters.y, n.positionMeters.z);
    m.scale.set(n.dimensionsMeters.x / 2, n.dimensionsMeters.y / 2, n.dimensionsMeters.z / 2);
    m.userData = { nodeId: n.id, assetSlot: n.assetSlot, system: n.system ?? '' };
    m.visible = n.visibleByDefault;
    g.add(m); organs.set(n.id, m);
  }
  // Brain regions (NEURO_REGIONS) inside the brain organ, at the pack's positions relative to the brain centre, sized by volume.
  const brain = manifest.nodes.find((n) => n.id === 'brain');
  const regions = new THREE.Group(); regions.name = 'brain:regions';
  const regionMat = new THREE.MeshStandardMaterial({ color: 0xd9a3a8, emissive: 0x8c4a52, emissiveIntensity: 0.3, roughness: 0.6 });
  if (brain) {
    regions.position.set(brain.positionMeters.x, brain.positionMeters.y, brain.positionMeters.z);
    for (const r of NEURO_REGIONS) {
      const radius = Math.cbrt((r.volumeMl * 1e-6 * 3) / (4 * Math.PI));
      const m = new THREE.Mesh(sphere, regionMat); m.scale.setScalar(radius); m.position.set(r.positionMeters.x, r.positionMeters.y, r.positionMeters.z); m.name = `region:${r.id}`; regions.add(m);
    }
  }
  regions.visible = false; g.add(regions);
  let selected: THREE_NS.Mesh | null = null;
  const tint = new THREE.Color();
  // D-131 state that survives between setView calls: isolation, the section plane and the surface mode.
  let isolated: readonly string[] = [];
  let lastInstr: VisualLayerInstruction | null = null;
  let lastSelected: string | null = null;
  let surface: TwinSurfaceMode = 'NORMAL';
  const cutaway: CutawayHandle = createCutaway(THREE, opts.hologramHex ?? 0x7dd3fc);
  g.add(cutaway.indicator);
  let cutawayOn = false;
  let lodLevel: HumanTwinLodLevel = asset ? 'FULL_ASSET' : 'PROXY_LOW';
  const lodMetrics: Readonly<Record<HumanTwinLodLevel, HumanTwinLodMetrics>> = {
    FULL_ASSET: asset ? measureLod(asset.root) : measureLod(body.root),
    PROXY_LOW: measureLod(body.root),
  };
  const applyLod = (): void => {
    const full = lodLevel === 'FULL_ASSET' && Boolean(asset);
    body.root.visible = !full;
    if (asset) asset.root.visible = full;
  };
  const blink = asset?.morphs.get('eyeBlinkLeft') ?? null;
  const blinkR = asset?.morphs.get('eyeBlinkRight') ?? null;

  /** Visibility of one organ under the current mode AND the isolation set (isolation narrows, never widens). */
  const organVisible = (id: string, slot: string, instr: VisualLayerInstruction | null): boolean => {
    const byMode = instr ? instr.visibleAssetSlots.includes(slot) : false;
    if (!isolated.length) return byMode;
    return isolated.includes(id);
  };
  const bodySlot = manifest.nodes.find((n) => n.id === 'body')?.assetSlot ?? '';
  const applyOrgans = (): void => {
    const focus = lastSelected !== null && organs.has(lastSelected) && !isolated.length;
    for (const [id, m] of organs) {
      const slot = String(m.userData.assetSlot);
      m.visible = organVisible(id, slot, lastInstr);
      const mat = m.material as THREE_NS.MeshPhysicalMaterial;
      // Isolation dims whatever is still shown but is not the isolated node, so context stays readable;
      // the brain opens up while its regions are displayed inside it.
      const dimmed = isolated.length > 0 && !isolated.includes(id);
      const opacity = dimmed ? 0.12 : id === 'brain' && regions.visible ? 0.35 : 1;
      const transparent = opacity < 1;
      if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
      mat.opacity = opacity; mat.depthWrite = !transparent;
      // With a selection, the rest steps back a little so the eye lands on the selected organ.
      mat.emissiveIntensity = lastSelected === id ? 0.9 : focus ? 0.1 : 0.22;
      setMaterialRimIntensity(mat, lastSelected === id ? SELECTION_RIM_INTENSITY : 0);
    }
    // The body shell steps back when a node is isolated, AND whenever the current display mode does not
    // include the body at all (brain, vascular, nervous, organ, tissue and cell views): a faint reference
    // silhouette keeps the organs' scale without hiding them behind skin.
    const bodyShown = lastInstr ? lastInstr.visibleAssetSlots.includes(bodySlot) : true;
    const shellMode: TwinSurfaceMode = isolated.length || !bodyShown ? 'GHOST' : surface;
    for (const m of shellMaterials) {
      if (holo && m === skin) {
        // The hologram proxy keeps its own translucency budget; NORMAL must not turn it into a solid cyan body.
        skin.transparent = true; skin.depthWrite = false;
        skin.opacity = shellMode === 'GHOST' ? 0.06 : shellMode === 'TRANSLUCENT' ? 0.2 : 0.42;
        setMaterialXray(skin, shellMode === 'XRAY' ? 1 : 0);
        skin.needsUpdate = true;
      } else setSurfaceMode(m, shellMode);
    }
    if (cloudMat) cloudMat.opacity = isolated.length || !bodyShown ? 0.1 : cloudMat.opacity;
  };

  return {
    group: g, body, organs, tier,
    setLod(level) { lodLevel = level === 'FULL_ASSET' && !asset ? 'PROXY_LOW' : level; applyLod(); },
    getLodState() {
      return {
        level: lodLevel,
        available: asset ? ['FULL_ASSET', 'PROXY_LOW'] : ['PROXY_LOW'],
        metrics: lodMetrics[lodLevel],
      };
    },
    setIsolated(nodeIds) { isolated = [...nodeIds]; applyOrgans(); },
    setSurface(mode) { surface = mode; applyOrgans(); },
    setCutaway(state) {
      cutawayOn = state.enabled;
      const visibleBody = lodLevel === 'FULL_ASSET' && asset ? asset.root : body.root;
      const bounds = measureCutawayBounds(THREE, visibleBody);
      cutaway.apply(state, bounds);
      // The plane is attached to the body shell AND the organ proxies, so a cut opens the whole twin.
      setClippingOnObject(body.root, state.enabled ? cutaway.plane : null);
      if (asset) setClippingOnObject(asset.root, state.enabled ? cutaway.plane : null);
      for (const [, m] of organs) {
        const mat = m.material as THREE_NS.MeshStandardMaterial;
        mat.clippingPlanes = state.enabled ? [cutaway.plane] : null;
        mat.needsUpdate = true;
      }
      // An open cut shows the shell wall instead of a hole; closed, every material is single-sided again.
      setSectionShellSides(THREE, [...shellMaterials, ...organMats], state.enabled);
    },
    setView(instr, selectedNodeId) {
      const bodyVisible = instr.visibleAssetSlots.includes(bodySlot);
      // Shell opacity is resolved in applyOrgans (surface mode + a GHOST silhouette when the body slot is absent).
      if (cloudMat) cloudMat.opacity = bodyVisible ? (instr.translucent ? 0.35 : 0.85) : 0.12;
      tint.set(instr.tint); skin.emissive.copy(tint).multiplyScalar(instr.translucent ? 0.35 : 0.0);
      regions.visible = instr.mode === 'BRAIN' || instr.mode === 'NERVOUS';
      selected = selectedNodeId ? organs.get(selectedNodeId) ?? null : null;
      lastInstr = instr; lastSelected = selectedNodeId;
      // X-ray IS the translucent modes' surface: one fresnel shell, labelled as a stylised model view.
      surface = instr.mode === 'XRAY' ? 'XRAY' : instr.translucent ? 'TRANSLUCENT' : 'NORMAL';
      applyOrgans();
    },
    update(t) {
      if (!holo && !asset) body.update('idle', t, 0);
      if (cloudMat) cloudMat.opacity = Math.max(0.1, cloudMat.opacity) * (0.92 + 0.08 * Math.sin(t * 2.2));
      if (selected) {
        const pulse = selectionPulse(t);
        (selected.material as THREE_NS.MeshStandardMaterial).emissiveIntensity = 0.55 + 0.45 * pulse;
        setMaterialRimIntensity(selected.material as THREE_NS.Material, SELECTION_RIM_INTENSITY * (0.7 + 0.3 * pulse));
      }
      // D-131: the asset's own ARKit blendshapes give the twin a blink — presentation only, deterministic
      // in scene time, never part of a session, an experiment input or an evidence record.
      if (blink || blinkR) {
        const cycle = t % 5.2;
        const amount = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) : 0;
        for (const target of [blink, blinkR]) {
          if (!target) continue;
          const influences = target.mesh.morphTargetInfluences;
          if (influences) influences[target.index] = amount;
        }
      }
      if (cutawayOn) cutaway.indicator.material.opacity = 0.05 + 0.03 * selectionPulse(t * 0.4);
    },
    dispose() {
      body.dispose(); skin.dispose(); sphere.dispose(); regionMat.dispose();
      for (const m of organMats) m.dispose();
      cloud?.geometry.dispose(); cloudMat?.dispose(); cutaway.dispose();
    },
  };
}

export interface TwinChamberOptions {
  position: THREE_NS.Vector3Tuple; radius: number; height: number;
  glass: THREE_NS.Material; palette: GenesisMaterialPalette;
  /** Where the concentric overhead light rings hang from (the room's ceiling). */
  ceilingHeight?: number;
}

/** The central sealed twin chamber: disc plinth, glass cylinder, capped crown with a ring of light, and a base ring. Returns the anchor the twin stands on. */
/**
 * The chamber returns its enclosure as well (D-131): the glass shell plus the twelve ribs that stand
 * between a close camera and the body. The twin camera opens that vitrine while it is framing the twin —
 * from close range the glass's specular highlight and the ribs cut straight across the figure the shot
 * exists to show. Hiding the case around a model changes nothing about the model.
 */
export function createTwinChamber(THREE: typeof THREE_NS, opts: TwinChamberOptions): { group: THREE_NS.Group; anchor: THREE_NS.Group; ring: THREE_NS.MeshStandardMaterial; glass: THREE_NS.Object3D } {
  const g = new THREE.Group(); g.position.set(...opts.position); g.name = 'twin:chamber';
  g.add(createPlatform(THREE, opts.palette.TECH_COMPOSITE, { position: [0, 0.07, 0], thickness: 0.14, shape: 'disc', radius: opts.radius + 0.25, radialSegments: 64 }));
  g.add(createPlatform(THREE, opts.palette.TECH_COMPOSITE, { position: [0, 0.17, 0], thickness: 0.06, shape: 'disc', radius: opts.radius + 0.05, radialSegments: 48 }));
  // Everything the twin camera opens: the glass shell and the ribs that stand in front of the body.
  const enclosure = new THREE.Group(); enclosure.name = 'twin:chamber-enclosure'; g.add(enclosure);
  enclosure.add(createGlassChamber(THREE, opts.glass, { position: [0, 0.2, 0], height: opts.height, radiusBottom: opts.radius, radiusTop: opts.radius, openEnded: false, radialSegments: 48 }));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(opts.radius + 0.2, opts.radius + 0.1, 0.18, 48), opts.palette.BRUSHED_METAL); crown.position.y = opts.height + 0.29; g.add(crown);
  const ring = createEmissiveInstrumentMaterial(THREE, { color: 0x8fd3ff, intensity: 1.4, baseColor: 0x123047 });
  const top = new THREE.Mesh(new THREE.TorusGeometry(opts.radius + 0.02, 0.03, 10, 64), ring); top.rotation.x = Math.PI / 2; top.position.y = opts.height + 0.19; g.add(top);
  const bottom = new THREE.Mesh(new THREE.TorusGeometry(opts.radius + 0.08, 0.03, 10, 64), ring); bottom.rotation.x = Math.PI / 2; bottom.position.y = 0.21; g.add(bottom);
  // Reference look: vertical ribs around the glass, four pilasters, a segmented LED ring in the base, an emitter inside, concentric light rings overhead.
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const rib = new THREE.Mesh(new THREE.BoxGeometry(0.035, opts.height, 0.05), opts.palette.POLISHED_METAL); rib.position.set(Math.cos(a) * (opts.radius + 0.01), opts.height / 2 + 0.2, Math.sin(a) * (opts.radius + 0.01)); rib.rotation.y = -a; enclosure.add(rib); }
  // The four pilasters belong to the vitrine too: from the twin camera's distance they cut straight
  // across the figure's arms, so they open with the glass and the ribs.
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; enclosure.add(createColumn(THREE, opts.palette.PAINTED_METAL, { position: [Math.cos(a) * (opts.radius + 0.18), 0.14, Math.sin(a) * (opts.radius + 0.18)], height: opts.height + 0.1, radius: 0.045 })); }
  const ledGeo = new THREE.BoxGeometry(0.06, 0.05, 0.02);
  for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const led = new THREE.Mesh(ledGeo, ring); led.position.set(Math.cos(a) * (opts.radius + 0.22), 0.1, Math.sin(a) * (opts.radius + 0.22)); led.rotation.y = -a; g.add(led); }
  const emitter = createPracticalLight(THREE, g as unknown as THREE_NS.Scene, { position: [0, opts.height * 0.62, 0], color: 0x9fe9ff, intensity: 5, distance: 4.5, decay: 2 });
  emitter.name = 'twin:emitter';
  const ringsY = opts.ceilingHeight ?? opts.height + 1.0;
  for (const [r, w] of [[opts.radius + 0.6, 0.05], [opts.radius + 1.1, 0.04], [opts.radius + 1.6, 0.03]] as const) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 72), ring); t.rotation.x = Math.PI / 2; t.position.y = ringsY - 0.5 - (r - opts.radius) * 0.18; g.add(t); }
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(opts.radius + 0.55, opts.radius + 0.62, 72), ring); floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = 0.004; g.add(floorRing);
  const orientationRing = new THREE.Mesh(new THREE.RingGeometry(opts.radius + 0.31, opts.radius + 0.325, 96), new THREE.MeshStandardMaterial({ color: 0x294a5a, emissive: 0x143746, emissiveIntensity: 0.3, roughness: 0.45 }));
  orientationRing.name = 'twin:chamber-orientation-ring'; orientationRing.rotation.x = -Math.PI / 2; orientationRing.position.y = 0.008; g.add(orientationRing);
  const anchor = new THREE.Group(); anchor.position.y = 0.2; g.add(anchor);
  return { group: g, anchor, ring, glass: enclosure };
}

export interface MezzanineOptions {
  /** Centre of the walkway at floor level; the walkway runs along local X, railing on local +Z (the room side). */
  position: THREE_NS.Vector3Tuple; headingRadians?: number; length: number; depth?: number; height?: number;
  slabMaterial: THREE_NS.Material; railMaterial: THREE_NS.Material; glass: THREE_NS.Material;
}

/** An upper observation gallery (reference: the command hub and twin-lab mezzanines): slab, glass balustrade, posts, a handrail, a light strip under the edge. */
export function createMezzanine(THREE: typeof THREE_NS, opts: MezzanineOptions): THREE_NS.Group {
  const g = new THREE.Group(); g.position.set(...opts.position); g.rotation.y = opts.headingRadians ?? 0; g.name = 'mezzanine';
  const L = opts.length; const D = opts.depth ?? 1.8; const H = opts.height ?? 2.75;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(L, 0.22, D), opts.slabMaterial); slab.position.set(0, H, -D / 2); g.add(slab);
  const balustrade = new THREE.Mesh(new THREE.PlaneGeometry(L, 1.0), opts.glass); balustrade.position.set(0, H + 0.62, 0.02); g.add(balustrade);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.06), opts.railMaterial); rail.position.set(0, H + 1.12, 0.03); g.add(rail);
  const postGeo = new THREE.BoxGeometry(0.05, 1.05, 0.05);
  for (let x = -L / 2; x <= L / 2 + 1e-6; x += 2) { const p = new THREE.Mesh(postGeo, opts.railMaterial); p.position.set(x, H + 0.6, 0.03); g.add(p); }
  const strip = new THREE.Mesh(new THREE.BoxGeometry(L - 0.4, 0.03, 0.06), createEmissiveInstrumentMaterial(THREE, { color: 0x9fe9ff, intensity: 1.1, baseColor: 0x1d2b3a })); strip.position.set(0, H - 0.13, 0.02); g.add(strip);
  for (let x = -L / 2 + 1.5; x < L / 2; x += 4) g.add(createColumn(THREE, opts.railMaterial, { position: [x, 0, -D + 0.25], height: H, radius: 0.09 }));
  return g;
}

export interface HoloPanelOptions {
  position: THREE_NS.Vector3Tuple; headingRadians?: number; width?: number; height?: number; tilt?: number;
  title: string; lines: readonly string[]; color?: string;
}

/** A floating translucent display (reference: the holographic dashboards): a canvas readout on a see-through emissive plane with a frame line. Content is static labelling only — never a fake measurement. */
export function createHoloPanel(THREE: typeof THREE_NS, opts: HoloPanelOptions): THREE_NS.Group {
  const g = new THREE.Group(); g.position.set(...opts.position); g.rotation.y = opts.headingRadians ?? 0; g.rotation.x = opts.tilt ?? -0.12; g.name = `holo:${opts.title}`;
  const w = opts.width ?? 1.2; const h = opts.height ?? 0.7;
  const { ctx, canvas, texture } = makeReadoutSurface(THREE, 512, 300);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8,20,32,0.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = opts.color ?? '#7dd3fc'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
  ctx.fillStyle = opts.color ?? '#7dd3fc'; ctx.font = 'bold 34px monospace'; ctx.fillText(opts.title.toUpperCase(), 20, 48);
  ctx.fillStyle = '#d8e8f5'; ctx.font = '24px monospace';
  opts.lines.slice(0, 7).forEach((l, i) => ctx.fillText(l, 20, 92 + i * 30));
  texture.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.9, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); g.add(face);
  return g;
}
