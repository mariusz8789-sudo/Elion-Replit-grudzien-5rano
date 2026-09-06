import type * as THREE_NS from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../worldFrameRenderer';
import type { WorldFrame } from '../worldFrame';
import { createGenesisMaterialPalette, createEmissiveInstrumentMaterial } from '../materials';
import { applyEnvironmentPreset, type EnvironmentHandle } from '../environment';
import { createWaterSurface, type WaterSurfaceHandle } from '../water';
import { createTreeField, createGroundClutter, type VegetationFieldHandle } from '../vegetation';
import { InteractionController } from '../interaction';
import { createSunLight } from '../lighting';

/**
 * GENESIS GRAPHICS RUNTIME — Integration Example: full environment composition
 * ==============================================================================
 *
 * THIS FILE IS A REFERENCE PATTERN, NOT A REAL WORLD — same status as `worldFrameExample.ts` and
 * `heroApparatusExample.ts`: not imported by any route, not registered as a `Sim3D`. Where
 * `worldFrameExample.ts` proves the WorldFrame -> Scene pathway itself, this file proves the
 * SURROUNDING environment subsystems (environment/water/vegetation/interaction) compose with it and
 * with each other, end to end, with real THREE objects — the "single coherent engine, not a
 * collection of isolated effects" requirement this Graphics Engine 1.0 pass exists to satisfy.
 *
 * Composes, in one small outdoor scene: `environment.ts`'s outdoor preset (sky + fog + sun state)
 * feeding a real `createSunLight` (so the sun direction/color this module COMPUTES is the sun
 * light this module PLACES — no duplicated lighting decision), `water.ts`'s animated surface,
 * `vegetation.ts`'s tree field + ground clutter, and `interaction.ts`'s `InteractionController`
 * wired to the SAME `WorldFrameRenderer` instance driving one generic "sensor" entity — clicking it
 * resolves back to its WorldFrame entity id via `resolveEntityId`, proving the interaction layer
 * reaches all the way from a raw pointer event to a world entity, not just to a raw mesh.
 */

export interface ExampleEnvironmentHandles {
  renderer: WorldFrameRenderer;
  environment: EnvironmentHandle;
  water: WaterSurfaceHandle;
  trees: VegetationFieldHandle;
  groundClutter: VegetationFieldHandle;
  interaction: InteractionController;
  buildFrameAt(time: number): WorldFrame;
  /** Advances everything with a per-frame delta: water ripple scroll. Vegetation/environment are
   * static once built (no per-frame cost) — only water genuinely animates. */
  update(dt: number): void;
  dispose(): void;
}

const SENSOR_POSITION: THREE_NS.Vector3Tuple = [0, 0.6, 0];

export function buildExampleEnvironmentWorld(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.Camera): ExampleEnvironmentHandles {
  const environment = applyEnvironmentPreset(THREE, scene, { mode: 'OUTDOOR', hourOfDay: 9 });
  const sunState = environment.sunState!; // OUTDOOR mode always returns a real SunState
  createSunLight(THREE, scene, {
    position: [sunState.direction[0] * 40, sunState.direction[1] * 40, sunState.direction[2] * 40],
    color: sunState.color,
    intensity: sunState.intensity,
  });

  const materials = createGenesisMaterialPalette(THREE);
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x3d6b3f, roughness: 0.92 });

  const water = createWaterSurface(THREE, { width: 6, depth: 6, color: 0x24606c });
  water.mesh.position.set(7, 0, 0);
  scene.add(water.mesh);

  const trees = createTreeField(THREE, {
    count: 24, width: 14, depth: 14, center: [-8, -8],
    trunkMaterial: materials.PAINTED_METAL, canopyMaterial,
  });
  scene.add(trees.group);

  const groundClutter = createGroundClutter(THREE, {
    count: 18, width: 14, depth: 14, center: [-8, -8], material: materials.CONCRETE,
  });
  scene.add(groundClutter.group);

  // One real WorldFrame entity ("sensor") — enough to prove the interaction layer reaches all the
  // way to a world entity id, without re-deriving worldFrameExample.ts's own richer population demo.
  const sensorMaterial = createEmissiveInstrumentMaterial(THREE, { color: 0x4dd2ff, intensity: 0.85 });
  const resolveVisual = (): EntityVisualSpec => ({
    kind: 'object',
    object: new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), sensorMaterial),
  });
  const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual });

  function buildFrameAt(time: number): WorldFrame {
    return { time, entities: [{ id: 'sensor', position: SENSOR_POSITION }] };
  }

  const interaction = new InteractionController(THREE, {
    camera,
    resolver: renderer,
    getTargets: () => [scene],
  });

  return {
    renderer,
    environment,
    water,
    trees,
    groundClutter,
    interaction,
    buildFrameAt,
    update(dt: number) {
      water.update(dt);
    },
    dispose() {
      environment.dispose();
      scene.remove(water.mesh);
      water.dispose();
      scene.remove(trees.group);
      trees.dispose();
      scene.remove(groundClutter.group);
      groundClutter.dispose();
      renderer.dispose();
    },
  };
}
