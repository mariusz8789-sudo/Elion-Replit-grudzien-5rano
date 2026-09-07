import type * as THREE_NS from 'three';
import { createColumn, createPlatform } from './primitives';
import { InstanceBatch } from './instancing';

/**
 * GENESIS GRAPHICS RUNTIME — Building Kit
 *
 * Reusable ADDITIVE building detail — rooftop equipment (HVAC units, vents, an antenna) and a
 * hospital-specific detail set (ambulance-bay canopy + emergency signage) — plus one generic
 * decorative building generator for industrial/warehouse infill.
 *
 * This deliberately does NOT replace `epidemicCity3D.ts`'s own `createBuilding` (the real,
 * hand-tuned per-CityWorld-object renderer that already reads `building.kind`/`x`/`y`/`w`/`h` and
 * produces facade/floors/windows/entrance/roof/signage) — retrofitting an already-shipped, hand-tuned
 * 1900-line scene's core building renderer for no measured defect would be pure regression risk.
 * Instead this kit supplies ADDITIONAL detail a caller layers ON TOP of (rooftop equipment sitting
 * on an existing roof footprint) or NEXT TO (an ambulance bay beside an existing hospital building,
 * a new decorative building filling empty ground) a scene's real buildings — the same
 * "generalize a reusable piece, keep the proven hand-tuned core as-is" pattern `labKit.ts` already
 * documents for `labScene3D.ts`.
 *
 * `createIndustrialBuilding` follows the exact deterministic-variation convention already proven in
 * `epidemicCity3D.ts`'s own `createContextBuilding`: a `seed` derived from the building's own stable
 * position/size (never `Math.random()`), so two calls with the same seed always produce the same
 * building — required for any consumer that rebuilds a scene from the same World data and expects a
 * stable, non-flickering result.
 */

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RooftopEquipmentOptions {
  /** Center of the roof footprint this equipment scatters across, at the roof's top surface. */
  position: THREE_NS.Vector3Tuple;
  footprintWidth: number;
  footprintDepth: number;
  /** How many HVAC/vent units to place. Default 3. */
  unitCount?: number;
  /** Deterministic placement/size seed. Default 0. */
  seed?: number;
  material: THREE_NS.Material;
  /** Adds a thin antenna/mast at one corner. Default true. */
  antenna?: boolean;
}

/** Rooftop HVAC boxes + small cylindrical vents + an optional antenna, scattered deterministically
 * within a roof footprint — the detail that turns a bare flat roof plane into a serviced building
 * top, visible from any elevated/wide camera shot. */
export function createRooftopEquipment(THREE: typeof THREE_NS, options: RooftopEquipmentOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-rooftop-equipment';
  const [px, py, pz] = options.position;
  const unitCount = Math.max(1, Math.round(options.unitCount ?? 3));
  const rand = mulberry32((options.seed ?? 0) * 2246822519 + 7);
  const marginX = options.footprintWidth * 0.18;
  const marginZ = options.footprintDepth * 0.18;

  for (let i = 0; i < unitCount; i++) {
    const w = 0.05 + rand() * 0.03;
    const h = 0.035 + rand() * 0.025;
    const x = px + (rand() * 2 - 1) * (options.footprintWidth / 2 - marginX);
    const z = pz + (rand() * 2 - 1) * (options.footprintDepth / 2 - marginZ);
    const unit = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * (0.8 + rand() * 0.4)), options.material);
    unit.position.set(x, py + h / 2, z);
    unit.castShadow = true;
    group.add(unit);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.22, h * 0.5, 8), options.material);
    vent.position.set(x, py + h + h * 0.25, z);
    group.add(vent);
  }

  if (options.antenna ?? true) {
    group.add(createColumn(THREE, options.material, {
      position: [px + options.footprintWidth / 2 - marginX * 0.6, py, pz + options.footprintDepth / 2 - marginZ * 0.6],
      height: 0.22, radius: 0.006,
    }));
  }

  return group;
}

export interface AmbulanceBayOptions {
  /** Where the bay pad's center sits, at ground level, immediately beside a real hospital
   * building — caller supplies this from the hospital's own real position/footprint. */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  canopyMaterial: THREE_NS.Material;
  padMaterial: THREE_NS.Material;
  signMaterial?: THREE_NS.Material;
}

/** A covered ambulance bay: a ground pad + a flat canopy on four support columns + an illuminated
 * "EMERGENCY" accent sign — the single most identifying feature that reads "hospital" from a wide
 * shot, per this mission's own ask for a recognizable hospital composition. Purely additive next to
 * a scene's real hospital building; carries no WorldFrame/C3 state of its own. */
export function createAmbulanceBay(THREE: typeof THREE_NS, options: AmbulanceBayOptions): THREE_NS.Group {
  const group = new THREE.Group();
  group.name = 'genesis-ambulance-bay';
  const [px, py, pz] = options.position;
  const canopyHeight = 0.32;

  const pad = createPlatform(THREE, options.padMaterial, {
    position: [px, py + 0.006, pz], thickness: 0.012, shape: 'box', width: options.width, depth: options.depth,
  });
  group.add(pad);

  const postInsetX = options.width / 2 - 0.02;
  const postInsetZ = options.depth / 2 - 0.02;
  for (const dx of [-postInsetX, postInsetX]) {
    for (const dz of [-postInsetZ, postInsetZ]) {
      group.add(createColumn(THREE, options.canopyMaterial, { position: [px + dx, py, pz + dz], height: canopyHeight, radius: 0.014 }));
    }
  }
  const canopy = createPlatform(THREE, options.canopyMaterial, {
    position: [px, py + canopyHeight, pz], thickness: 0.02, shape: 'box', width: options.width * 1.06, depth: options.depth * 1.06,
  });
  group.add(canopy);

  const signMaterial = options.signMaterial ?? new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff3b3b, emissiveIntensity: 0.55, roughness: 0.4 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(options.width * 0.55, 0.05, 0.02), signMaterial);
  sign.position.set(px, py + canopyHeight - 0.03, pz + options.depth / 2 + 0.01);
  group.add(sign);

  group.userData.visualOnlyContext = true;
  return group;
}

export type IndustrialBuildingKind = 'industrial' | 'warehouse';

export interface IndustrialBuildingOptions {
  /** Center of the building footprint, at ground level (same convention as
   * `epidemicCity3D.ts`'s own `createContextBuilding`). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  kind?: IndustrialBuildingKind;
  /** Deterministic seed — derive from the building's own stable world position, never `Math.random()`. */
  seed: number;
  wallMaterial: THREE_NS.Material;
  roofMaterial: THREE_NS.Material;
  doorMaterial?: THREE_NS.Material;
}

/** A generic decorative industrial/warehouse building: a low wide box with a loading-bay door,
 * roof-mounted pipes/vents, and deterministic height/proportion variation — for filling city infill
 * zones with a DIFFERENT building character than the residential/civic stock `createBuilding`
 * already produces, without touching that proven renderer. Purely decorative background massing —
 * never presented as a CityWorld location (no `label`, no `worldSelection`, matching
 * `createContextBuilding`'s own documented status). */
export function createIndustrialBuilding(THREE: typeof THREE_NS, options: IndustrialBuildingOptions): THREE_NS.Group {
  const rand = mulberry32(options.seed);
  const group = new THREE.Group();
  group.name = `genesis-${options.kind ?? 'industrial'}-building`;
  const [px, , pz] = options.position;
  const height = (options.kind === 'warehouse' ? 0.38 : 0.5) + rand() * 0.12;

  const body = new THREE.Mesh(new THREE.BoxGeometry(options.width, height, options.depth), options.wallMaterial);
  body.position.set(px, height / 2, pz);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const roof = createPlatform(THREE, options.roofMaterial, {
    position: [px, height + 0.008, pz], thickness: 0.016, shape: 'box', width: options.width * 1.02, depth: options.depth * 1.02,
  });
  group.add(roof);

  const doorMaterial = options.doorMaterial ?? new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.7, metalness: 0.2 });
  const doorWidth = Math.min(options.width * 0.35, 0.3);
  const doorHeight = height * 0.62;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.02), doorMaterial);
  door.position.set(px + (rand() - 0.5) * options.width * 0.3, doorHeight / 2, pz + options.depth / 2 + 0.011);
  group.add(door);

  const roofEquipment = createRooftopEquipment(THREE, {
    position: [px, height, pz],
    footprintWidth: options.width,
    footprintDepth: options.depth,
    unitCount: 2 + Math.round(rand() * 2),
    seed: options.seed,
    material: options.roofMaterial,
    antenna: false,
  });
  group.add(roofEquipment);

  group.userData.visualOnlyContext = true;
  return group;
}

export interface FacadeBuildingOptions {
  /** Footprint center at GROUND level. Pass `[0, 0, 0]` when building for a `WorldFrameRenderer`
   * adapter, whose `applyTransform` overwrites `.position` absolutely every sync (see
   * `ADAPTER_CONTRACT.md` rule 4). */
  position: THREE_NS.Vector3Tuple;
  width: number;
  depth: number;
  height: number;
  /** Deterministic seed — derive from the entity's own stable id/position, never `Math.random()`. */
  seed: number;
  wallMaterial: THREE_NS.Material;
  /** Instanced across every window on all four facades. `InstanceBatch` sets `vertexColors = true`
   * on it (per-window lit/unlit tinting), so pass a material dedicated to this use. */
  windowMaterial: THREE_NS.Material;
  roofMaterial?: THREE_NS.Material;
  /** Approximate storey height in world units — window rows are derived from it. Default 1.2. */
  floorHeight?: number;
  /** Fraction of windows tinted `litColor` rather than `unlitColor`. Default 0.45. */
  litFraction?: number;
  litColor?: THREE_NS.ColorRepresentation;
  unlitColor?: THREE_NS.ColorRepresentation;
  /** Adds `createRooftopEquipment` on the roof. Default true. */
  rooftopEquipment?: boolean;
}

/**
 * A generic multi-storey building with a real windowed facade — the piece this kit was missing, and
 * the reason `genesisScientificCitySim.ts` had to render its buildings as bare `BoxGeometry`.
 *
 * WHY THIS EXISTS RATHER THAN REUSING `epidemicCity3D.ts`'s own `createBuilding`: that one is a real,
 * hand-tuned renderer bound to its scene's `CityWorld` object shape (`building.kind`/`x`/`y`/`w`/`h`)
 * and is not exported or reusable; this module's own doc already records why it is left alone.
 * `createFacadeBuilding` is the generic, scene-agnostic equivalent any scene can call.
 *
 * PERFORMANCE, DELIBERATELY DIFFERENT FROM THAT PRECEDENT: `epidemicCity3D.ts`'s hand-rolled version
 * emits one `Mesh` per window, which this engine's own density audit measured as the single largest
 * draw-call cost in the city scene (see `PERFORMANCE.md`'s "Visual World Build 1.0-3.0 density
 * audit"). This function instead batches every window of a building into ONE `InstancedMesh` via
 * `instancing.ts` — so a 60-window building costs 2 draw calls (body + windows), not 61. That was
 * the whole point of building it here rather than copying the older approach.
 *
 * Purely decorative massing unless a caller says otherwise: tagged `userData.visualOnlyContext`, the
 * same status `createIndustrialBuilding`/`createContextBuilding` carry. A caller rendering a REAL
 * world entity (a C3 building) clears that flag itself.
 */
export function createFacadeBuilding(THREE: typeof THREE_NS, options: FacadeBuildingOptions): THREE_NS.Group {
  const rand = mulberry32(options.seed);
  const group = new THREE.Group();
  group.name = 'genesis-facade-building';
  const [px, py, pz] = options.position;
  const { width, depth, height } = options;

  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), options.wallMaterial);
  body.position.set(px, py + height / 2, pz);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // --- Windows: one instanced batch for the whole building -------------------------------------
  const floorHeight = options.floorHeight ?? 1.2;
  const rows = Math.max(1, Math.floor(height / floorHeight));
  const litFraction = options.litFraction ?? 0.45;
  const litColor = new THREE.Color(options.litColor ?? 0xffd9a0);
  const unlitColor = new THREE.Color(options.unlitColor ?? 0x16202c);

  const windowHeight = Math.min(floorHeight * 0.45, height / rows * 0.5);
  const windowWidth = windowHeight * 0.8;
  const batch = new InstanceBatch(THREE, new THREE.PlaneGeometry(windowWidth, windowHeight), options.windowMaterial);

  // Each facade: its outward normal's axis, its half-extent along that axis, and the span the window
  // grid is laid out across. Windows sit a hair proud of the wall so they never z-fight it.
  const facades: { rotationY: number; spanAxis: 'x' | 'z'; span: number; offset: number }[] = [
    { rotationY: 0, spanAxis: 'x', span: width, offset: depth / 2 },
    { rotationY: Math.PI, spanAxis: 'x', span: width, offset: -depth / 2 },
    { rotationY: Math.PI / 2, spanAxis: 'z', span: depth, offset: width / 2 },
    { rotationY: -Math.PI / 2, spanAxis: 'z', span: depth, offset: -width / 2 },
  ];

  for (const facade of facades) {
    const columns = Math.max(1, Math.floor(facade.span / (windowWidth * 2.1)));
    const columnStep = facade.span / (columns + 1);
    for (let row = 0; row < rows; row++) {
      const y = py + (row + 0.62) * (height / rows);
      if (y + windowHeight / 2 > py + height) continue;
      for (let column = 1; column <= columns; column++) {
        const along = -facade.span / 2 + column * columnStep;
        const position: THREE_NS.Vector3Tuple = facade.spanAxis === 'x'
          ? [px + along, y, pz + facade.offset * 1.002]
          : [px + facade.offset * 1.002, y, pz + along];
        batch.add(position, [0, facade.rotationY, 0], 1, rand() < litFraction ? litColor : unlitColor);
      }
    }
  }
  // InstanceBatch.build() only calls the generic Object3D `.add()` on what it is given, so a Group
  // works exactly as well as a Scene despite the narrower parameter type (same cast the
  // WorldFrameRenderer already makes for the same reason).
  batch.build(group as unknown as THREE_NS.Scene, false);

  if (options.roofMaterial) {
    const roof = createPlatform(THREE, options.roofMaterial, {
      position: [px, py + height + 0.02, pz], thickness: 0.05, shape: 'box', width: width * 1.03, depth: depth * 1.03,
    });
    group.add(roof);
  }

  if (options.rooftopEquipment ?? true) {
    group.add(createRooftopEquipment(THREE, {
      position: [px, py + height, pz],
      footprintWidth: width,
      footprintDepth: depth,
      unitCount: 1 + Math.round(rand() * 2),
      seed: options.seed,
      material: options.roofMaterial ?? options.wallMaterial,
      antenna: rand() > 0.6,
    }));
  }

  group.userData.visualOnlyContext = true;
  return group;
}
