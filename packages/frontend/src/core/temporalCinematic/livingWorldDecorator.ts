import type * as THREE_NS from 'three';
import type { WorldGraph } from '../worldModel/ecs/worldGraph';
import type { HighFidelityMaterialPalette } from '../three/graphics/highFidelityMaterialRegistry';
import { createRoadMarkings, createSidewalk, createStreetBench, createStreetLight, createTrashBin } from '../three/graphics/streetKit';
import { createTreeField, type VegetationFieldHandle } from '../three/graphics/vegetation';
import { createVehicle, type VehicleHandle, type VehicleKind } from '../three/graphics/vehicleKit';

/**
 * V5.2 — LIVING WORLD DECORATOR.
 *
 * Presentation-only context derived from canonical WorldGraph geometry. It never writes entities,
 * never creates a second world-state model and never claims that a decorative car/tree/bench is a
 * scientific observation. Everything it creates is tagged `visualOnlyContext=true`.
 */

export interface LivingWorldDecoratorOptions {
  readonly year?: number;
  readonly maxStreetLights?: number;
  readonly maxVehicles?: number;
  readonly maxBenches?: number;
  readonly maxTreeFields?: number;
}

export interface LivingWorldRoadSample {
  readonly roadId: string;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
  readonly widthM: number;
  readonly headingRadians: number;
  readonly lengthM: number;
}

export interface LivingWorldPlan {
  readonly roads: readonly LivingWorldRoadSample[];
  readonly parkFields: readonly { readonly center: readonly [number, number]; readonly width: number; readonly depth: number; readonly seed: number }[];
  readonly streetLightCount: number;
  readonly vehicleCount: number;
  readonly benchCount: number;
}

export interface LivingWorldDecoratorHandle {
  readonly group: THREE_NS.Group;
  readonly plan: LivingWorldPlan;
  update(dt: number): void;
  dispose(): void;
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  const n = value === undefined ? fallback : Math.round(value);
  return Math.max(min, Math.min(max, n));
}

function vehicleEraFactor(year: number | undefined): number {
  if (year === undefined) return 1;
  if (year <= 1905) return 0;
  if (year <= 1925) return 0.12;
  if (year <= 1950) return 0.35;
  if (year <= 1980) return 0.7;
  return 1;
}

/** Pure and testable: plans decorative density only from canonical geometry and the requested year. */
export function buildLivingWorldPlan(graph: WorldGraph, options: LivingWorldDecoratorOptions = {}): LivingWorldPlan {
  const roads: LivingWorldRoadSample[] = [];
  const parkFields: Array<{ center: [number, number]; width: number; depth: number; seed: number }> = [];

  for (const entity of graph.listEntities()) {
    const g = entity.geometry;
    if (!g) continue;
    if (g.kind === 'ROAD') {
      const dx = g.end.x - g.start.x;
      const dz = g.end.z - g.start.z;
      roads.push({
        roadId: entity.id,
        start: [g.start.x, g.start.z],
        end: [g.end.x, g.end.z],
        widthM: g.widthM,
        headingRadians: Math.atan2(dx, dz),
        lengthM: Math.hypot(dx, dz),
      });
    } else if (g.kind === 'DISTRICT' && g.districtType === 'PARK') {
      parkFields.push({
        center: [(g.bounds.minX + g.bounds.maxX) / 2, (g.bounds.minZ + g.bounds.maxZ) / 2],
        width: Math.max(4, g.bounds.maxX - g.bounds.minX),
        depth: Math.max(4, g.bounds.maxZ - g.bounds.minZ),
        seed: hash32(entity.id),
      });
    }
  }

  const lightCap = clampInt(options.maxStreetLights, 48, 0, 160);
  const vehicleCap = clampInt(options.maxVehicles, 20, 0, 80);
  const benchCap = clampInt(options.maxBenches, 18, 0, 80);
  const treeFieldCap = clampInt(options.maxTreeFields, 6, 0, 24);
  const roadLength = roads.reduce((sum, r) => sum + r.lengthM, 0);
  const era = vehicleEraFactor(options.year);

  return {
    roads,
    parkFields: parkFields.slice(0, treeFieldCap),
    streetLightCount: Math.min(lightCap, Math.max(0, Math.round(roadLength / 90))),
    vehicleCount: Math.min(vehicleCap, Math.max(0, Math.round((roadLength / 160) * era))),
    benchCount: Math.min(benchCap, Math.max(0, Math.round(roadLength / 180))),
  };
}

function disposeDecoratorObject(root: THREE_NS.Object3D, sharedMaterials: ReadonlySet<THREE_NS.Material>): void {
  root.traverse((node) => {
    const mesh = node as THREE_NS.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (!material) return;
    const materials = Array.isArray(material) ? material : [material];
    for (const m of materials) if (!sharedMaterials.has(m)) m.dispose();
  });
}

interface MovingVehicle {
  readonly handle: VehicleHandle;
  readonly road: LivingWorldRoadSample;
  readonly phase: number;
  readonly speedMps: number;
}

function pointAlongRoad(road: LivingWorldRoadSample, u: number, lateral: number): readonly [number, number, number] {
  const x = road.start[0] + (road.end[0] - road.start[0]) * u;
  const z = road.start[1] + (road.end[1] - road.start[1]) * u;
  const dx = road.end[0] - road.start[0];
  const dz = road.end[1] - road.start[1];
  const len = Math.max(1e-6, Math.hypot(dx, dz));
  const nx = -dz / len;
  const nz = dx / len;
  return [x + nx * lateral, 0.08, z + nz * lateral];
}

function kindFor(seed: number): VehicleKind {
  const n = seed % 10;
  if (n === 0) return 'bus';
  if (n === 1) return 'van';
  if (n === 2) return 'truck';
  return 'car';
}

/**
 * Builds a deterministic decorative layer from the graph. Moving vehicles are presentation-only;
 * they do not imply a traffic solver and are explicitly tagged as such.
 */
export function createLivingWorldDecorator(
  THREE: typeof THREE_NS,
  scene: THREE_NS.Scene,
  graph: WorldGraph,
  palette: HighFidelityMaterialPalette,
  options: LivingWorldDecoratorOptions = {},
): LivingWorldDecoratorHandle {
  const plan = buildLivingWorldPlan(graph, options);
  const group = new THREE.Group();
  group.name = 'genesis-living-world-decorator';
  group.userData.visualOnlyContext = true;
  group.userData.notScientificState = true;
  scene.add(group);

  const ownedRoots: THREE_NS.Object3D[] = [];
  const vegetation: VegetationFieldHandle[] = [];
  const vehicles: VehicleHandle[] = [];
  const moving: MovingVehicle[] = [];
  const sharedMaterials = new Set<THREE_NS.Material>(Object.values(palette));

  // Tree fields only where the canonical geometry explicitly says PARK.
  for (const field of plan.parkFields) {
    const count = Math.max(6, Math.min(90, Math.round((field.width * field.depth) / 420)));
    const trees = createTreeField(THREE, {
      count,
      width: field.width * 0.82,
      depth: field.depth * 0.82,
      center: [field.center[0], field.center[1]],
      seed: field.seed,
      scaleRange: [1.1, 2.2],
      trunkMaterial: palette.brick,
      canopyMaterial: palette.foliage,
      castShadow: count <= 18,
    });
    trees.group.userData.visualOnlyContext = true;
    group.add(trees.group);
    vegetation.push(trees);
  }

  if (plan.roads.length > 0) {
    // Roads stay canonical entities. Sidewalks and markings are derived presentation detail laid
    // directly along their real start/end coordinates — no fake street graph.
    for (const road of plan.roads.slice(0, 24)) {
      const dx = road.end[0] - road.start[0];
      const dz = road.end[1] - road.start[1];
      const len = Math.max(1e-6, Math.hypot(dx, dz));
      const nx = -dz / len;
      const nz = dx / len;
      const sideOffset = road.widthM / 2 + 1.4;
      for (const side of [-1, 1] as const) {
        const ox = nx * sideOffset * side;
        const oz = nz * sideOffset * side;
        const sidewalk = createSidewalk(THREE, {
          from: [road.start[0] + ox, 0.06, road.start[1] + oz],
          to: [road.end[0] + ox, 0.06, road.end[1] + oz],
          width: 2.4,
          kerbHeight: 0.12,
          surfaceMaterial: palette.concrete,
          kerbMaterial: palette.medical,
        });
        sidewalk.userData.visualOnlyContext = true;
        group.add(sidewalk); ownedRoots.push(sidewalk);
      }
      const markings = createRoadMarkings(THREE, {
        from: [road.start[0], 0.14, road.start[1]],
        to: [road.end[0], 0.14, road.end[1]],
        dashLength: 3.0, gapLength: 4.0, width: 0.14, material: palette.white, height: 0.14,
      });
      markings.userData.visualOnlyContext = true;
      group.add(markings); ownedRoots.push(markings);
    }

    // Street lights: evenly spread across deterministic road selection.
    for (let i = 0; i < plan.streetLightCount; i += 1) {
      const road = plan.roads[i % plan.roads.length]!;
      const seed = hash32(`${road.roadId}:light:${i}`);
      const u = ((seed % 900) + 50) / 1000;
      const side = seed % 2 === 0 ? 1 : -1;
      const p = pointAlongRoad(road, u, side * (road.widthM / 2 + 2.2));
      const light = createStreetLight(THREE, {
        position: p as THREE_NS.Vector3Tuple,
        height: 5.8,
        headingRadians: road.headingRadians + (side > 0 ? Math.PI : 0),
        poleMaterial: palette.stainless,
        lampMaterial: options.year !== undefined && options.year < 1930 ? palette.redGlow : palette.blueGlow,
      });
      light.userData.visualOnlyContext = true;
      group.add(light); ownedRoots.push(light);
    }

    // Benches and bins: no fake footfall/population state, only static visual context.
    for (let i = 0; i < plan.benchCount; i += 1) {
      const road = plan.roads[(i * 3) % plan.roads.length]!;
      const seed = hash32(`${road.roadId}:bench:${i}`);
      const u = ((seed % 800) + 100) / 1000;
      const side = seed % 2 === 0 ? 1 : -1;
      const p = pointAlongRoad(road, u, side * (road.widthM / 2 + 3.0));
      const bench = createStreetBench(THREE, {
        position: p as THREE_NS.Vector3Tuple,
        headingRadians: road.headingRadians,
        seatMaterial: palette.brick,
        legMaterial: palette.stainless,
      });
      bench.scale.setScalar(4.0); // streetKit is shared with a smaller-scale city scene; normalize to metre-scale here.
      bench.userData.visualOnlyContext = true;
      group.add(bench); ownedRoots.push(bench);
      if (i % 3 === 0) {
        const bin = createTrashBin(THREE, { position: [p[0] + 0.8, p[1], p[2] + 0.4], material: palette.dark });
        bin.scale.setScalar(4.0);
        bin.userData.visualOnlyContext = true;
        group.add(bin); ownedRoots.push(bin);
      }
    }

    // Vehicles are intentionally absent from very early eras. When present, their motion is only
    // visual ambience and is explicitly not fed back into WorldGraph.
    for (let i = 0; i < plan.vehicleCount; i += 1) {
      const road = plan.roads[(i * 5) % plan.roads.length]!;
      const seed = hash32(`${road.roadId}:vehicle:${i}`);
      const side = seed % 2 === 0 ? 1 : -1;
      const bodyMaterial = [palette.medical, palette.dark, palette.brick, palette.stainless][seed % 4]!;
      const handle = createVehicle(THREE, {
        kind: kindFor(seed),
        position: [0, 0, 0],
        headingRadians: road.headingRadians,
        state: i < Math.ceil(plan.vehicleCount * 0.35) ? 'MOVING' : 'PARKED',
        bodyMaterial,
        glassMaterial: palette.glass,
        wheelMaterial: palette.dark,
        seed,
      });
      handle.group.scale.setScalar(9.5); // vehicleKit's shared kit uses a compact visual-world scale.
      handle.group.userData.visualOnlyContext = true;
      handle.group.userData.notScientificState = true;
      group.add(handle.group);
      vehicles.push(handle);
      const phase = ((seed >>> 8) % 1000) / 1000;
      const speedMps = 4 + ((seed >>> 20) % 7);
      if (handle.state === 'MOVING') moving.push({ handle, road, phase, speedMps });
      else {
        const p = pointAlongRoad(road, phase, side * Math.max(1.8, road.widthM * 0.22));
        handle.group.position.set(...p);
      }
    }
  }

  let elapsed = 0;
  return {
    group,
    plan,
    update(dt: number) {
      elapsed += Math.max(0, Math.min(0.1, dt));
      for (const mv of moving) {
        const u = (mv.phase + (elapsed * mv.speedMps) / Math.max(20, mv.road.lengthM)) % 1;
        const p = pointAlongRoad(mv.road, u, mv.road.widthM * 0.22);
        mv.handle.group.position.set(...p);
      }
    },
    dispose() {
      scene.remove(group);
      for (const v of vegetation) v.dispose();
      for (const vehicle of vehicles) vehicle.dispose();
      // Kits borrow the shared palette; dispose geometry and only materials that the decorator itself
      // created (vehicle lights/crosses/default internals), never the resolver's shared palette.
      for (const root of ownedRoots) disposeDecoratorObject(root, sharedMaterials);
      disposeDecoratorObject(group, sharedMaterials);
    },
  };
}
