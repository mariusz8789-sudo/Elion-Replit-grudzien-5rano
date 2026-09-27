import type * as THREE_NS from 'three';
import type { HistoricalWorldState, HistoricalEntity } from './contracts';
import type { PostProcessingModules } from '../../three/types';

/**
 * TEMPORAL CINEMATIC SCENE MOUNT — the real, on-demand THREE.js scene the
 * capture bridge renders. NOT a second renderer: it is built from the SAME
 * `three` package and the SAME reusable graphics-kit primitives every other
 * Genesis `Sim3D` scene composes (`core/three/graphics/sceneEnvironment.ts`,
 * `buildingKit.ts`, `vehicleKit.ts`, `lifecycle.ts`, and now
 * `highFidelityMaterialRegistry.ts`/`highFidelityFactories.ts`/
 * `highFidelityWeather.ts` — the SAME real PBR palette, facade-texture
 * category and weather rig every other high-fidelity scene in this kit can
 * use, ported in from an audited external implementation package rather than
 * reinvented) — no new geometry system, no new lighting model, no new
 * disposal convention, and real post-processing (bloom/AO/tone-mapping) via
 * the SAME `postProcessing.ts::setupGraphicsPipeline` every other exterior
 * Genesis scene uses, forced to its documented `'cinematic'` quality tier —
 * exactly the "screenshot/video capture pathway" that option exists for.
 *
 * WHY A NEW, DECOUPLED MOUNT RATHER THAN EXTENDING `agentLabScene3D.ts`:
 * that class is a single 1000+ line `Sim3D` implementation deeply coupled to
 * its OWN specific worlds (twin chamber, biology stations, molecule scenes,
 * city) via a continuous `useThreeLoop.ts` rAF loop. This mount has a
 * different, incompatible rendering discipline on purpose — render EXACTLY
 * ONE frame per capture request, on demand, never a continuous loop — because
 * frame capture must be deterministic and reproducible per call, not a
 * moving target sampled mid-animation. Bolting an on-demand, discrete-frame
 * capture path onto `agentLabScene3D.ts`'s continuous loop would have been
 * the real "second renderer" risk; reusing its own composed primitives
 * directly, the same way it does, is not.
 */

export interface TemporalCinematicSceneMount {
  applyState(state: HistoricalWorldState, weather?: string): void;
  applyCamera(position: readonly [number, number, number], target: readonly [number, number, number], fov: number): void;
  renderOneFrame(): void;
  dispose(): void;
}

function seedFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Deterministic per-kind massing so different archetypes read differently from a wide shot, without inventing a bespoke model per label. */
function dimensionsFor(entity: HistoricalEntity): { width: number; depth: number; height: number } {
  if (entity.kind === 'BUILDING') {
    if (entity.label.includes('tower')) return { width: 9, depth: 9, height: 26 };
    if (entity.label.includes('tenement')) return { width: 7, depth: 7, height: 9 };
    if (entity.label.includes('concrete')) return { width: 10, depth: 8, height: 16 };
    return { width: 8, depth: 8, height: 12 };
  }
  return { width: 1, depth: 2, height: 1.5 };
}

/** A handful of period-plausible facade tints — real per-building variation instead of one flat color, the same technique `highFidelityFactories.ts::createHistoricalStreet` uses. */
const FACADE_TINTS: readonly number[] = [0xb66a52, 0x8f745f, 0xa78d74, 0x7e6960, 0x9c8468, 0x6d7a72];

export async function mountTemporalCinematicScene(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Promise<TemporalCinematicSceneMount> {
  const [
    THREE,
    { createSceneEnvironment },
    { createFacadeBuilding },
    { createVehicle },
    { disposeSceneResources, disposeMaterials },
    { createPBRMaterial },
    { createHighFidelityMaterialPalette, allHighFidelityMaterials },
    { createHighFidelityWeatherRig },
    { HumanoidAgentVisual },
    { setupGraphicsPipeline, configureDOF },
    EffectComposerMod,
    RenderPassMod,
    ShaderPassMod,
    UnrealBloomPassMod,
    OutputPassMod,
    GTAOPassMod,
    BokehPassMod,
    SSRPassMod,
    SMAAPassMod,
  ] = await Promise.all([
    import('three'),
    import('../../three/graphics/sceneEnvironment'),
    import('../../three/graphics/buildingKit'),
    import('../../three/graphics/vehicleKit'),
    import('../../three/graphics/lifecycle'),
    import('../../three/graphics/materials'),
    import('../../three/graphics/highFidelityMaterialRegistry'),
    import('../../three/graphics/highFidelityWeather'),
    import('../../three/humanoidAgentVisual'),
    import('../../three/graphics/postProcessing'),
    import('three/examples/jsm/postprocessing/EffectComposer.js'),
    import('three/examples/jsm/postprocessing/RenderPass.js'),
    import('three/examples/jsm/postprocessing/ShaderPass.js'),
    import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
    import('three/examples/jsm/postprocessing/OutputPass.js'),
    import('three/examples/jsm/postprocessing/GTAOPass.js'),
    import('three/examples/jsm/postprocessing/BokehPass.js'),
    import('three/examples/jsm/postprocessing/SSRPass.js'),
    import('three/examples/jsm/postprocessing/SMAAPass.js'),
  ]);
  const postProcessingModules: PostProcessingModules = {
    EffectComposer: EffectComposerMod.EffectComposer,
    RenderPass: RenderPassMod.RenderPass,
    ShaderPass: ShaderPassMod.ShaderPass,
    UnrealBloomPass: UnrealBloomPassMod.UnrealBloomPass,
    OutputPass: OutputPassMod.OutputPass,
    GTAOPass: GTAOPassMod.GTAOPass,
    BokehPass: BokehPassMod.BokehPass,
    SSRPass: SSRPassMod.SSRPass,
    SMAAPass: SMAAPassMod.SMAAPass,
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 800);

  // Real PBR palette (chrome/glass/brick/asphalt/concrete/ground/...), the same shared-material
  // vocabulary highFidelityFactories.ts's own scenes use — replaces the previous flat, single-tone
  // MeshStandardMaterial-per-role set.
  const palette = createHighFidelityMaterialPalette(THREE);
  const ownedMaterials: THREE_NS.Material[] = [...allHighFidelityMaterials(palette)];

  const environment = createSceneEnvironment(THREE, scene, {
    mode: 'OUTDOOR', groundSize: 220, hourOfDay: 12, groundMaterial: palette.ground,
  });

  let entityGroup = new THREE.Group();
  entityGroup.name = 'genesis-temporal-cinematic-entities';
  scene.add(entityGroup);

  let weatherRig: ReturnType<typeof createHighFidelityWeatherRig> | null = null;
  let puddles: THREE_NS.Object3D | null = null;
  const puddleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x17202d, roughness: 0.08, metalness: 0.0, transmission: 0.05, transparent: true, opacity: 0.76 });
  ownedMaterials.push(puddleMaterial);

  function applyWeather(weather?: string): void {
    weatherRig?.dispose();
    weatherRig = createHighFidelityWeatherRig(THREE, scene, weather);
    if (puddles) { scene.remove(puddles); disposeSceneResources(puddles, { excludeMaterials: [puddleMaterial] }); puddles = null; }
    const isWet = weather?.toUpperCase() === 'RAIN' || weather?.toUpperCase() === 'STORM';
    if (isWet) {
      const group = new THREE.Group(); group.name = 'genesis-temporal-cinematic-puddles';
      for (let i = 0; i < 16; i += 1) {
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.2 + (i % 4) * 0.6, 32), puddleMaterial);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(((i * 13) % 60) - 30, 0.015, ((i * 7) % 50) - 25);
        group.add(puddle);
      }
      scene.add(group);
      puddles = group;
    }
  }
  applyWeather(undefined);

  function clearEntities(): void {
    scene.remove(entityGroup);
    disposeSceneResources(entityGroup, { excludeMaterials: ownedMaterials });
    entityGroup = new THREE.Group();
    entityGroup.name = 'genesis-temporal-cinematic-entities';
    scene.add(entityGroup);
  }

  function applyState(state: HistoricalWorldState, weather?: string): void {
    clearEntities();
    applyWeather(weather);
    for (const entity of state.entities) {
      const seed = seedFromId(entity.id);
      const dims = dimensionsFor(entity);
      const position: [number, number, number] = [entity.position[0], entity.position[1], entity.position[2]];
      if (entity.kind === 'BUILDING') {
        // Real procedural facade texture (normal map + baked window emissive) per building, tinted
        // per-instance — createPBRMaterial('BUILDING_FACADE', ...) rather than one flat color shared
        // by every building on the street.
        const facadeMaterial = createPBRMaterial(THREE, 'BUILDING_FACADE', { color: FACADE_TINTS[seed % FACADE_TINTS.length] });
        ownedMaterials.push(facadeMaterial);
        const roofMaterial = state.year >= 1935 ? palette.stainless : palette.brick;
        const building = createFacadeBuilding(THREE, {
          position, width: dims.width, depth: dims.depth, height: dims.height,
          seed, wallMaterial: facadeMaterial, windowMaterial: palette.glass, roofMaterial,
        });
        entityGroup.add(building);
      } else if (entity.kind === 'VEHICLE') {
        const kind = entity.label.includes('tram') ? 'bus' : entity.label.includes('cart') ? 'van' : 'car';
        const bodyMaterial = entity.label.includes('cart') ? palette.brick : state.year >= 1946 ? palette.chrome : palette.dark;
        const vehicle = createVehicle(THREE, { kind, position, seed, bodyMaterial });
        entityGroup.add(vehicle.group);
      } else if (entity.kind === 'POPULATION') {
        // A real rigged humanoid figure (HumanoidAgentVisual — constructed here, not via
        // highFidelityFactories.ts, since that module lives in core/three/graphics/ and must never
        // import sideways into HumanoidAgentVisual's own simulation-adjacent dependencies; this mount
        // is outside that boundary) at the entity's real position, rather than a flat box standing in
        // for "people present" — the same visual every other Genesis world already draws its
        // population with.
        const visual = new HumanoidAgentVisual(THREE, seed);
        visual.sync({ id: seed, age: undefined, role: undefined, worldX: 0, worldZ: 0, facing: 0, speed: 0, gait: 0, pose: 'idle', health: 'unknown', behavior: 'idle', stateSince: 0, isolated: false, hospitalized: false }, 0, false);
        visual.root.traverse((node) => {
          const mesh = node as THREE_NS.Mesh;
          if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
        });
        visual.root.position.set(entity.position[0], entity.position[1], entity.position[2]);
        entityGroup.add(visual.root);
      } else {
        // CLOTHING / INFRASTRUCTURE / ENVIRONMENT: this pipeline's real contract is spatially-
        // anchored, temporally-consistent PRESENCE at the right position for the right year range —
        // not a bespoke model per archetype. A deterministic marker keeps that presence visible (and
        // genuinely different frame-to-frame as entities enter/leave validity) without inventing
        // per-kind geometry this pass, drawn from the same real PBR palette as everything else
        // instead of one flat marker gray.
        const markerMaterial = entity.kind === 'ENVIRONMENT' ? palette.foliage : entity.kind === 'INFRASTRUCTURE' ? palette.stainless : palette.fabric;
        const marker = new THREE.Mesh(new THREE.BoxGeometry(dims.width, dims.height, dims.depth), markerMaterial);
        marker.position.set(entity.position[0], entity.position[1] + dims.height / 2, entity.position[2]);
        marker.castShadow = true;
        entityGroup.add(marker);
      }
    }
  }

  function applyCamera(position: readonly [number, number, number], target: readonly [number, number, number], fov: number): void {
    camera.position.set(position[0], position[1], position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(target[0], target[1], target[2]);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  // Real post-processing (ACES tone mapping, bloom, ambient occlusion) via the SAME
  // setupGraphicsPipeline every other exterior Genesis scene uses. `qualityTier: 'cinematic'` is
  // this module's own documented hook for "a screenshot/video capture pathway... regardless of
  // what the interactive device signals suggest" — exactly this use case.
  const pipeline = setupGraphicsPipeline(THREE, postProcessingModules, renderer, {
    scene, camera, width, height,
    qualityTier: 'cinematic',
    bloom: { strength: 0.22, radius: 0.5, threshold: 0.9 },
    ambientOcclusion: { enabled: true, minTier: 'high' },
    depthOfField: configureDOF({ focusDistance: 24, enabled: false }),
    antiAliasing: { enabled: true, minTier: 'medium' },
  });

  function renderOneFrame(): void {
    environment.update(0);
    weatherRig?.update(1 / 24, camera);
    pipeline.render();
  }

  function dispose(): void {
    clearEntities();
    weatherRig?.dispose();
    if (puddles) { scene.remove(puddles); disposeSceneResources(puddles, { excludeMaterials: [puddleMaterial] }); }
    environment.dispose();
    disposeMaterials(ownedMaterials);
    pipeline.dispose?.();
    renderer.dispose();
  }

  return { applyState, applyCamera, renderOneFrame, dispose };
}
