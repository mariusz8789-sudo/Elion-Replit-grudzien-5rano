import type * as THREE_NS from 'three';
import { boundsDepth, boundsWidth } from '../worldModel/ecs/geometry';
import { entityId, type WorldModelEntity } from '../worldModel/ecs/types';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import { createFacadeBuilding } from '../three/graphics/buildingKit';
import { disposeMaterials, disposeSceneResources } from '../three/graphics/lifecycle';
import { createPBRMaterial } from '../three/graphics/materials';
import {
  allHighFidelityMaterials,
  createHighFidelityMaterialPalette,
  type HighFidelityMaterialPalette,
} from '../three/graphics/highFidelityMaterialRegistry';
import { createScientificAssetSlotVisual, createScientificRoomShell } from './scientificInteriorVisuals';
import type { WorldFrame, WorldFrameEntity } from '../three/graphics/worldFrame';
import type { EntityVisualSpec } from '../three/graphics/worldFrameRenderer';
import { buildCharacter, paletteFromSeed } from '../three/characterRig';
import { loadHumanTwinBody, type LoadedHumanTwinBody } from '../three/humanTwinAsset';

const FLOOR_HEIGHT_M = 3.5;
const FACADE_TINTS = [0xb66a52, 0x8f745f, 0xa78d74, 0x7e6960, 0x9c8468, 0x6d7a72] as const;

export interface TemporalCinematicVisualResolverOptions {
  weather?: string;
  /** Number of nearby/person-like entities that keep the articulated procedural rig before the low-detail fallback. */
  detailedHumanCount?: number;
  /** Opt-in governed LOD0 upgrade for exactly one hero human. Defaults true. */
  governedHeroHuman?: boolean;
  /** V6: when set, render exactly this canonical ROOM and its ASSET_SLOT children as an interior. */
  interiorTargetRoomId?: string | null;
}


export interface TemporalCinematicVisualResolverHandle {
  resolveVisual(entity: WorldFrameEntity): EntityVisualSpec;
  updateVisual(entity: WorldFrameEntity, object: THREE_NS.Object3D): void;
  readonly palette: HighFidelityMaterialPalette;
  sharedMaterials: readonly THREE_NS.Material[];
  dispose(): void;
}

function seedFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function personLike(entity: WorldModelEntity): boolean {
  return /(^|[-_:])(human|person|agent|population)([-_:]|$)/i.test(entity.ref.kind)
    || /\b(human|person|scientist|researcher|worker|patient|population)\b/i.test(entity.label);
}

function safeScale(entity: WorldFrameEntity): number {
  const scale = entity.scale ?? 1;
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function markShadows(root: THREE_NS.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
}

function structuralNoop(THREE: typeof THREE_NS, label: string): EntityVisualSpec {
  const group = new THREE.Group();
  group.name = `genesis-structural-${label.toLowerCase()}`;
  group.userData.structuralOnly = true;
  return { kind: 'object', object: group };
}

function createBuildingVisual(
  THREE: typeof THREE_NS,
  model: WorldModelEntity,
  frame: WorldFrameEntity,
  palette: HighFidelityMaterialPalette,
): EntityVisualSpec {
  if (model.geometry?.kind !== 'BUILDING') return structuralNoop(THREE, 'building-missing-geometry');
  const geometry = model.geometry;
  const transformScale = safeScale(frame);
  const width = Math.max(0.01, boundsWidth(geometry.bounds) / transformScale);
  const depth = Math.max(0.01, boundsDepth(geometry.bounds) / transformScale);
  const heightMeters = Math.max(FLOOR_HEIGHT_M, geometry.floorCount * FLOOR_HEIGHT_M);
  const height = Math.max(0.01, heightMeters / transformScale);
  const seed = seedFromId(frame.id);
  const tint = FACADE_TINTS[seed % FACADE_TINTS.length]!;
  const wall = createPBRMaterial(THREE, 'BUILDING_FACADE', { color: tint }) as THREE_NS.MeshStandardMaterial;
  // BUILDING_FACADE's map/normalMap are baked at a fixed pixel size and, like every THREE.BoxGeometry
  // face, default to a single 0..1 UV tile regardless of the box's actual world-unit size — so at
  // real city scale (buildings up to ~30m wide) the same texture stretches roughly 10-30x too large,
  // reading as a soft directional smear across the whole facade (confirmed by direct frame inspection:
  // present at every camera position/weather, absent on human-scale geometry, gone once tiled here).
  // `wall` is a FRESH material per building (not one of `sharedMaterials`), so retuning its own repeat
  // to this building's real width/height affects only this building, matching the density convention
  // BRICK/CONCRETE/ASPHALT/GROUND already use for their own worn-surface textures elsewhere in this file.
  // MUST use the pre-normalization real-world bounds here, not the local `width`/`height` above — those
  // are already divided by `transformScale` (often >>1, since the container object applies that scale
  // back afterward), so they stay near 1 regardless of the building's true size and would round to a
  // no-op repeat(1,1) every time.
  const facadeTileM = 9;
  const realWidthM = boundsWidth(geometry.bounds);
  const realHeightM = heightMeters;
  const facadeRepeatU = Math.max(1, Math.round(realWidthM / facadeTileM));
  const facadeRepeatV = Math.max(1, Math.round(realHeightM / facadeTileM));
  wall.map?.repeat.set(facadeRepeatU, facadeRepeatV);
  wall.normalMap?.repeat.set(facadeRepeatU, facadeRepeatV);
  wall.emissiveMap?.repeat.set(facadeRepeatU, facadeRepeatV);
  const roof = geometry.buildingType === 'INDUSTRIAL' || geometry.buildingType === 'WATER_RESEARCH_FACILITY'
    ? palette.stainless
    : palette.brick;

  const root = new THREE.Group();
  root.name = `genesis-world-building-${geometry.buildingType.toLowerCase()}`;
  const building = createFacadeBuilding(THREE, {
    position: [0, 0, 0],
    width,
    depth,
    height,
    floorHeight: FLOOR_HEIGHT_M / transformScale,
    seed,
    wallMaterial: wall,
    windowMaterial: palette.glass,
    roofMaterial: roof,
    rooftopEquipment: true,
    litFraction: geometry.buildingType === 'HOSPITAL' || geometry.buildingType.includes('LAB') ? 0.62 : 0.42,
  });
  // renderReadiness places the entity root at the building's vertical centre. createFacadeBuilding
  // uses a ground-level origin, so shift the generated building down by half its NORMALIZED height.
  building.position.y = -height / 2;
  building.userData.visualOnlyContext = false;
  root.add(building);

  if (geometry.buildingType === 'HOSPITAL') {
    const h = new THREE.Mesh(new THREE.BoxGeometry(width * 0.35, height * 0.045, 0.02), palette.redGlow);
    const v = new THREE.Mesh(new THREE.BoxGeometry(width * 0.045, height * 0.24, 0.02), palette.redGlow);
    h.position.set(0, height * 0.16, depth / 2 + 0.012);
    v.position.copy(h.position);
    root.add(h, v);
  }
  if (geometry.buildingType === 'LABORATORY' || geometry.buildingType === 'BIOLOGY_LAB' || geometry.buildingType === 'CHEMISTRY_LAB' || geometry.buildingType === 'RESEARCH_CAMPUS') {
    const accent = new THREE.Mesh(new THREE.BoxGeometry(width * 0.55, 0.025, 0.02), palette.blueGlow);
    accent.position.set(0, height * 0.2, depth / 2 + 0.013);
    root.add(accent);
  }

  markShadows(root);
  return { kind: 'object', object: root };
}

function createRoadVisual(
  THREE: typeof THREE_NS,
  model: WorldModelEntity,
  palette: HighFidelityMaterialPalette,
  wet: boolean,
): EntityVisualSpec {
  if (model.geometry?.kind !== 'ROAD') return structuralNoop(THREE, 'road-missing-geometry');
  const g = model.geometry;
  const dx = g.end.x - g.start.x;
  const dz = g.end.z - g.start.z;
  const length = Math.max(0.01, Math.hypot(dx, dz));
  const roadGeometry = new THREE.BoxGeometry(length, 0.12, Math.max(0.5, g.widthM));
  // Same class of fix as createBuildingVisual's facade repeat, applied differently: BoxGeometry's
  // default UVs are a fixed 0..1 tile per face regardless of `length`, but palette.asphalt is a
  // genuinely SHARED material (in sharedMaterials, excluded from per-entity disposal), so its own
  // texture.repeat must never be mutated per road segment. Scaling THIS geometry's own UV attribute
  // instead is per-mesh and safe — it multiplies with the material's fixed repeat(5,5), keeping
  // texel density roughly constant instead of stretching one fixed tile across the whole road length.
  const roadTileM = 8;
  const roadUv = roadGeometry.attributes.uv;
  if (roadUv) {
    const uScale = Math.max(1, length / roadTileM);
    for (let i = 0; i < roadUv.count; i += 1) roadUv.setX(i, roadUv.getX(i) * uScale);
    roadUv.needsUpdate = true;
  }
  const mesh = new THREE.Mesh(roadGeometry, wet ? palette.wetAsphalt : palette.asphalt);
  mesh.name = `genesis-road-${g.roadClass.toLowerCase()}`;
  mesh.position.y = 0.04;
  mesh.rotation.y = -Math.atan2(dz, dx);
  mesh.receiveShadow = true;
  return { kind: 'object', object: mesh };
}

function createIntersectionVisual(
  THREE: typeof THREE_NS,
  palette: HighFidelityMaterialPalette,
  wet: boolean,
): EntityVisualSpec {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 0.11, 24), wet ? palette.wetAsphalt : palette.asphalt);
  mesh.name = 'genesis-road-intersection';
  mesh.position.y = 0.035;
  mesh.receiveShadow = true;
  return { kind: 'object', object: mesh };
}

function createLowDetailHuman(
  THREE: typeof THREE_NS,
  frame: WorldFrameEntity,
  palette: HighFidelityMaterialPalette,
): EntityVisualSpec {
  const scale = safeScale(frame);
  const h = 1.72 / scale;
  const root = new THREE.Group();
  root.name = 'genesis-human-lod2';
  root.userData.humanLod = 'LOD2_PROXY';
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(h * 0.11, h * 0.38, 4, 8), palette.fabric);
  torso.position.y = h * 0.58;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 10, 8), palette.skin);
  head.position.y = h * 0.90;
  const legGeo = new THREE.CapsuleGeometry(h * 0.035, h * 0.30, 3, 6);
  const left = new THREE.Mesh(legGeo, palette.fabric);
  const right = new THREE.Mesh(legGeo.clone(), palette.fabric);
  left.position.set(-h * 0.055, h * 0.23, 0);
  right.position.set(h * 0.055, h * 0.23, 0);
  root.add(torso, head, left, right);
  markShadows(root);
  return { kind: 'object', object: root };
}

function createDetailedHuman(
  THREE: typeof THREE_NS,
  frame: WorldFrameEntity,
): { spec: Extract<EntityVisualSpec, { kind: 'object' }>; disposeProxy: () => void } {
  const scale = safeScale(frame);
  const seed = seedFromId(frame.id);
  const character = buildCharacter(THREE, { height: 1.72 / scale, ...paletteFromSeed(seed) });
  character.root.name = 'genesis-human-lod1';
  character.root.userData.humanLod = 'LOD1_PROCEDURAL';
  character.update('idle', 0, 0);
  markShadows(character.root);
  return { spec: { kind: 'object', object: character.root }, disposeProxy: () => character.dispose() };
}

/** Conservative world-plane size for ground/fog/haze. Uses only canonical geometry already in WorldGraph. */
export function estimateTemporalWorldGroundSize(graph: WorldGraph): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const include = (x: number, z: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  };
  for (const entity of graph.listEntities()) {
    const g = entity.geometry;
    if (!g) continue;
    switch (g.kind) {
      case 'DISTRICT': case 'PARCEL': case 'BUILDING': case 'FLOOR': case 'ROOM': case 'NAV_ZONE':
        include(g.bounds.minX, g.bounds.minZ); include(g.bounds.maxX, g.bounds.maxZ); break;
      case 'ROAD':
        include(g.start.x, g.start.z); include(g.end.x, g.end.z); break;
      case 'INTERSECTION': case 'DOOR': case 'STAIR': case 'ELEVATOR': case 'ASSET_SLOT': case 'NAV_NODE': case 'SPAWN_POINT': case 'APPROACH_POINT': case 'INTERACTION_POINT':
        include(g.position.x, g.position.z); break;
      case 'NAV_EDGE':
        break;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return 200;
  return Math.max(200, Math.max(maxX - minX, maxZ - minZ) * 1.18);
}

/**
 * World Generation geometry stores city coordinates as absolute values, while WorldFrameRenderer
 * interprets `parentId` transforms as parent-relative. Generated BUILDING entities are nested under
 * PARCEL/DISTRICT entities for semantic containment, so forwarding those parent ids unchanged would
 * add the parent's absolute position a second time. Flatten ONLY geometry-backed render entities
 * at the graphics boundary; the canonical WorldGraph hierarchy remains untouched and queryable.
 */
export function normalizeTemporalCinematicFrameHierarchy(frame: WorldFrame, graph: WorldGraph): WorldFrame {
  let changed = false;
  const entities = frame.entities.map((entity) => {
    if (!entity.parentId || !graph.tryGetEntity(entity.id)?.geometry) return entity;
    changed = true;
    return { ...entity, parentId: null };
  });
  return changed ? { ...frame, entities } : frame;
}

/**
 * Canonical visual convergence for Temporal Cinematic. Domain knowledge lives HERE, outside the
 * generic WorldFrameRenderer, and is resolved from the SAME WorldGraph that produced the frame.
 * No second world state, renderer, scene mount or historical entity ontology is introduced.
 */
export function createTemporalCinematicVisualResolver(
  THREE: typeof THREE_NS,
  graph: WorldGraph,
  options: TemporalCinematicVisualResolverOptions = {},
): TemporalCinematicVisualResolverHandle {
  const palette = createHighFidelityMaterialPalette(THREE);
  if (options.interiorTargetRoomId) {
    // Indoor epoxy is satin; the shared LAB_FLOOR preset is also used by wet exterior demos.
    const floor = palette.floor as THREE_NS.MeshStandardMaterial;
    floor.roughness = 0.72; floor.metalness = 0.03; floor.envMapIntensity = 0.3;
    floor.normalScale.set(0.025, 0.025);
  }
  const sharedMaterials = allHighFidelityMaterials(palette);
  const wet = /^(RAIN|STORM)$/i.test(options.weather ?? '');
  const personIds = graph.listEntities().filter(personLike).map((e) => e.id).sort();
  const heroId = options.governedHeroHuman === false ? null : personIds[0] ?? null;
  const detailedCount = Math.max(0, options.detailedHumanCount ?? 24);
  const detailedIds = new Set(personIds.slice(0, detailedCount));
  const proxyDisposers = new WeakMap<THREE_NS.Object3D, () => void>();
  let disposed = false;
  let heroBody: LoadedHumanTwinBody | null = null;
  let heroTransferred = false;

  if (heroId) {
    void loadHumanTwinBody(THREE, 1.72).then((loaded) => {
      if (!loaded) return;
      if (disposed) {
        disposeSceneResources(loaded.root);
        return;
      }
      heroBody = loaded;
    });
  }

  const resolveVisual = (frame: WorldFrameEntity): EntityVisualSpec => {
    const model = graph.tryGetEntity(frame.id);
    if (!model) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), palette.stainless);
      mesh.name = 'genesis-unknown-world-entity';
      return { kind: 'object', object: mesh };
    }

    if (personLike(model)) {
      if (detailedIds.has(model.id)) {
        const detailed = createDetailedHuman(THREE, frame);
        proxyDisposers.set(detailed.spec.object, detailed.disposeProxy);
        if (model.id === heroId) detailed.spec.object.userData.governedHeroCandidate = true;
        return detailed.spec;
      }
      return createLowDetailHuman(THREE, frame, palette);
    }

    const g = model.geometry;
    if (!g) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), palette.stainless);
      mesh.name = `genesis-${model.ref.kind}-entity`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return { kind: 'object', object: mesh };
    }

    const interiorTargetRoomId = options.interiorTargetRoomId ?? null;
    if (interiorTargetRoomId) {
      if (g.kind === 'ROOM') {
        return model.id === interiorTargetRoomId
          ? { kind: 'object', object: createScientificRoomShell(THREE, model, palette) }
          : structuralNoop(THREE, 'ROOM');
      }
      if (g.kind === 'ASSET_SLOT') {
        return entityId(g.roomRef) === interiorTargetRoomId
          ? { kind: 'object', object: createScientificAssetSlotVisual(THREE, model, palette) }
          : structuralNoop(THREE, 'ASSET_SLOT');
      }
      // Interior presentation intentionally hides the city shell/roads and unrelated generated
      // structure, but the canonical WorldGraph remains fully intact behind this visual filter.
      return structuralNoop(THREE, g.kind);
    }

    switch (g.kind) {
      case 'BUILDING': return createBuildingVisual(THREE, model, frame, palette);
      case 'ROAD': return createRoadVisual(THREE, model, palette, wet);
      case 'INTERSECTION': return createIntersectionVisual(THREE, palette, wet);
      case 'FLOOR': case 'ROOM':
      case 'DISTRICT': case 'PARCEL': case 'NAV_ZONE': case 'NAV_EDGE':
      case 'DOOR': case 'STAIR': case 'ELEVATOR': case 'ASSET_SLOT': case 'NAV_NODE':
      case 'SPAWN_POINT': case 'APPROACH_POINT': case 'INTERACTION_POINT':
        return structuralNoop(THREE, g.kind);
    }
  };

  const updateVisual = (frame: WorldFrameEntity, object: THREE_NS.Object3D): void => {
    if (frame.id !== heroId || heroTransferred || !heroBody || !object.userData.governedHeroCandidate) return;
    const disposeProxy = proxyDisposers.get(object);
    disposeProxy?.();
    proxyDisposers.delete(object);
    while (object.children.length > 0) object.remove(object.children[0]!);
    const targetScale = 1 / safeScale(frame);
    heroBody.root.scale.multiplyScalar(targetScale);
    heroBody.root.name = 'genesis-human-lod0-governed';
    object.add(heroBody.root);
    object.userData.humanLod = heroBody.tier;
    heroTransferred = true;
    heroBody = null;
  };

  return {
    resolveVisual,
    updateVisual,
    palette,
    sharedMaterials,
    dispose() {
      disposed = true;
      if (heroBody) {
        disposeSceneResources(heroBody.root);
        heroBody = null;
      }
      disposeMaterials(sharedMaterials);
    },
  };
}
