import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { directGenesisPromptWorld } from '../worldDirector/genesisWorldDirector';
import { buildSpacetimeCameraPath } from '../temporalCinematic/spacetimeWorldDescriptor';
import { TemporalCinematicSim3D, spacetimePresentationProfile } from '../temporalCinematic/temporalCinematicSim3D';
import { createSpacetimeWorldVisualLayer } from './spacetimeWorldVisuals';

const CASES = [
  ['Generate an Einstein-Rosen bridge and show a cinematic flythrough.', 'WORMHOLE_RINGS'],
  ['Create a cosmology world with gravity wells, dark matter and time dilation.', 'GRAVITY_WELL_GRID'],
  ['Create a quantum world explaining superposition and tunneling.', 'QUANTUM_BARRIER'],
  ['Create a time dilation laboratory.', 'RELATIVISTIC_CLOCKS'],
  ['Create 5 alternative timeline worlds.', 'TIMELINE_BRANCHES'],
  ['Create a historical Boston battle reconstruction.', 'HISTORICAL_CITY'],
  ['Create a desert alien planet with ruins and two suns.', 'ALIEN_DESERT'],
  ['Create a Mars research world.', 'MARS_STATION'],
  ['Create an underwater research city.', 'UNDERWATER_CITY'],
] as const;

beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

describe('canonical spacetime Three.js visual layer', () => {
  it.each(CASES)('renders canonical generated world: %s', (prompt, expectedKind) => {
    const directed = directGenesisPromptWorld(prompt);
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);

    expect(handle.summary.kind).toBe(expectedKind);
    expect(handle.summary.sourceEntityIds).toEqual(directed.descriptor.sourceEntityIds);
    expect(handle.summary.sourceEntityIds.length).toBeGreaterThan(0);
    expect(handle.summary.objectCount).toBeGreaterThan(0);
    expect(handle.root.name).toBe(`genesis-spacetime-${expectedKind.toLowerCase()}`);
    expect(handle.root.userData.illustrativeVisualization).toBe(true);
    expect(handle.root.userData.epistemic).toBe(directed.descriptor.epistemic);
    expect(handle.root.userData.limitations).toEqual(directed.descriptor.limitations);

    let visibleGeometry = 0;
    handle.root.traverse((object) => {
      const renderable = object as THREE.Mesh | THREE.Line | THREE.Points;
      if (renderable.geometry) visibleGeometry += 1;
      expect(object.userData.epistemic).toBeTruthy();
      expect(object.userData.sourceEntityIds).toEqual(directed.descriptor.sourceEntityIds);
    });
    expect(visibleGeometry).toBeGreaterThan(0);
    handle.dispose();
    expect(handle.root.parent).toBeNull();
  });

  it('animates presentation objects without mutating the canonical descriptor', () => {
    const directed = directGenesisPromptWorld('Generate an Einstein-Rosen bridge.');
    const descriptorSnapshot = JSON.stringify(directed.descriptor);
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const firstRing = handle.root.getObjectByName('wormhole-instanced-embedding-rings');
    expect(firstRing).toBeDefined();
    const before = firstRing!.scale.x;
    handle.update(2.5);
    expect(firstRing!.scale.x).not.toBe(before);
    expect(JSON.stringify(directed.descriptor)).toBe(descriptorSnapshot);
    handle.dispose();
  });

  it('disposes owned geometry and materials exactly through its lifecycle handle', () => {
    const directed = directGenesisPromptWorld('Create a quantum world explaining tunneling.');
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const mesh = handle.root.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    expect(mesh).toBeDefined();
    const geometryDispose = vi.spyOn(mesh!.geometry, 'dispose');
    const material = Array.isArray(mesh!.material) ? mesh!.material[0]! : mesh!.material;
    const materialDispose = vi.spyOn(material, 'dispose');

    handle.dispose();
    handle.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });

  it('mounts the layer in the existing canonical TemporalCinematicSim3D scene', () => {
    const directed = directGenesisPromptWorld('Create a cosmology world with gravity wells and dark matter.');
    const sim = new TemporalCinematicSim3D(
      directed.runtime.engine,
      buildSpacetimeCameraPath(directed.descriptor),
      { spacetimeDescriptor: directed.descriptor, navigationMode: 'CINEMATIC' },
    );
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 2000);

    sim.init(THREE, scene, camera, 1280, 720);

    expect(scene.getObjectByName('genesis-spacetime-gravity_well_grid')).toBeTruthy();
    expect((scene.background as THREE.Color).getHexString()).toBe('020611');
    expect(scene.fog).toBeNull();
    expect(sim.getPresentationSummary().spacetimeVisual).toMatchObject({
      kind: 'GRAVITY_WELL_GRID',
      epistemic: 'MODEL',
    });
    sim.update(1 / 60, {});
    sim.dispose();
    expect(scene.getObjectByName('genesis-spacetime-gravity_well_grid')).toBeUndefined();
  });

  it('keeps deep-space worlds dark while preserving exterior context for historical and planetary worlds', () => {
    expect(spacetimePresentationProfile('WORMHOLE_RINGS')).toMatchObject({ environmentMode: 'INDOOR', exposure: 0.72, livingWorld: false });
    expect(spacetimePresentationProfile('GRAVITY_WELL_GRID')).toMatchObject({ environmentMode: 'INDOOR', fogDensity: 0 });
    expect(spacetimePresentationProfile('HISTORICAL_CITY')).toMatchObject({ environmentMode: 'OUTDOOR', livingWorld: true });
    expect(spacetimePresentationProfile('ALIEN_DESERT')).toMatchObject({ environmentMode: 'OUTDOOR', livingWorld: false });
  });

  it('builds a dense but honestly labelled historical reconstruction context', () => {
    const directed = directGenesisPromptWorld('Create a historical Boston battle reconstruction.');
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const townhouses = handle.root.getObjectByName('reconstruction-instanced-townhouses') as THREE.InstancedMesh;
    const roofs = handle.root.getObjectByName('reconstruction-instanced-roofs') as THREE.InstancedMesh;
    const figures = handle.root.getObjectByName('reconstruction-instanced-crowd-bodies') as THREE.InstancedMesh;
    const pavers = handle.root.getObjectByName('reconstruction-instanced-street-pavers') as THREE.InstancedMesh;
    const smoke = handle.root.getObjectByName('reconstruction-atmospheric-smoke') as THREE.Points;
    expect(townhouses.count).toBeGreaterThanOrEqual(12);
    expect(roofs.count).toBe(townhouses.count);
    expect(figures.count).toBe(34);
    expect(pavers.count).toBeGreaterThan(20);
    expect(smoke.geometry.attributes.position?.count).toBe(350);
    expect([townhouses, roofs, figures, pavers, smoke].every((object) => object.userData.epistemic === 'RECONSTRUCTION')).toBe(true);
    expect([townhouses, roofs, figures, pavers, smoke].every((object) => object.userData.visualOnlyContext === true)).toBe(true);
    handle.dispose();
  });

  it('renders the alien world with two suns, graph-counted detailed ruins, dust and atmosphere', () => {
    const directed = directGenesisPromptWorld('Create a desert alien planet with ruins and two suns.');
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const ruinCount = directed.runtime.engine.graph.getEntity('ruins:alien-desert-complex').domainState?.structureCount;
    const ruins = handle.root.children.filter((object) => object.name.startsWith('alien-ruin-complex-'));
    expect(ruins).toHaveLength(Number(ruinCount));
    expect(handle.root.getObjectByName('alien-primary-sun')).toBeTruthy();
    expect(handle.root.getObjectByName('alien-secondary-sun')).toBeTruthy();
    expect(handle.root.getObjectByName('alien-desert-atmospheric-dust')).toBeTruthy();
    expect(handle.root.getObjectByName('alien-desert-atmosphere')).toBeTruthy();
    expect((handle.root.getObjectByName('alien-desert-instanced-boulders') as THREE.InstancedMesh).count).toBe(24);
    expect(ruins.every((object) => object.userData.fictionInspired === true && object.userData.visualOnlyContext === true)).toBe(true);
    handle.dispose();
  });

  it('renders a connected Mars research outpost with communications and field equipment', () => {
    const directed = directGenesisPromptWorld('Create a Mars research world.');
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const moduleCount = directed.runtime.engine.graph.getEntity('building:mars-research-station').domainState?.habitatModules;
    expect((handle.root.getObjectByName('mars-instanced-habitat-modules') as THREE.InstancedMesh).count).toBe(Number(moduleCount));
    expect((handle.root.getObjectByName('mars-instanced-pressurized-connectors') as THREE.InstancedMesh).count).toBe(Number(moduleCount) - 1);
    expect(handle.root.getObjectByName('mars-communications-dish')).toBeTruthy();
    expect(handle.root.getObjectByName('mars-field-rover')).toBeTruthy();
    expect((handle.root.getObjectByName('mars-instanced-solar-arrays') as THREE.InstancedMesh).count).toBe(2);
    expect(handle.root.getObjectByName('mars-regolith-dust')).toBeTruthy();
    expect((handle.root.getObjectByName('mars-instanced-regolith-rocks') as THREE.InstancedMesh).count).toBe(30);
    handle.dispose();
  });

  it('renders an underwater city with graph-counted domes, pressure tunnels, instruments and layered water context', () => {
    const directed = directGenesisPromptWorld('Create an underwater research city.');
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const moduleCount = directed.runtime.engine.graph.getEntity('building:underwater-research-habitat').domainState?.habitatModules;
    const sensorCount = directed.runtime.engine.graph.getEntity('instrument:underwater-observatory').domainState?.sensorNodes;
    expect((handle.root.getObjectByName('underwater-instanced-habitat-domes') as THREE.InstancedMesh).count).toBe(Number(moduleCount));
    expect((handle.root.getObjectByName('underwater-instanced-pressure-tunnels') as THREE.InstancedMesh).count).toBe(Number(moduleCount));
    expect((handle.root.getObjectByName('underwater-instanced-observation-array') as THREE.InstancedMesh).count).toBe(Number(sensorCount));
    expect((handle.root.getObjectByName('underwater-instanced-fauna-silhouettes') as THREE.InstancedMesh).count).toBe(120);
    expect((handle.root.getObjectByName('underwater-marine-snow') as THREE.Points).geometry.attributes.position?.count).toBe(2200);
    expect((handle.root.getObjectByName('underwater-bubble-columns') as THREE.Points).geometry.attributes.position?.count).toBe(520);
    expect(handle.root.getObjectByName('underwater-layered-seabed')).toBeTruthy();
    expect(handle.root.getObjectByName('underwater-volume-atmosphere')).toBeTruthy();
    expect(handle.root.userData.epistemic).toBe('SIMULATION');
    handle.dispose();
  });

  it('keeps wormhole and cosmology presentation dense while bounding draw-call-producing objects', () => {
    const wormhole = directGenesisPromptWorld('Generate an Einstein-Rosen bridge.');
    const wormholeVisual = createSpacetimeWorldVisualLayer(THREE, wormhole.descriptor, wormhole.runtime.engine.graph);
    expect((wormholeVisual.root.getObjectByName('wormhole-instanced-embedding-rings') as THREE.InstancedMesh).count).toBe(wormhole.descriptor.primitives.length);
    expect(wormholeVisual.root.getObjectByName('wormhole-deep-starfield')).toBeTruthy();
    expect(wormholeVisual.root.getObjectByName('wormhole-accretion-style-presentation')?.userData.visualAnalogy).toContain('NOT_GENERAL_RELATIVITY_OUTPUT');
    expect(wormholeVisual.root.children.length).toBeLessThanOrEqual(8);
    wormholeVisual.dispose();

    const cosmology = directGenesisPromptWorld('Create a cosmology world with gravity wells and dark matter.');
    const cosmologyVisual = createSpacetimeWorldVisualLayer(THREE, cosmology.descriptor, cosmology.runtime.engine.graph);
    expect(cosmologyVisual.root.getObjectByName('cosmology-model-curvature-grid')).toBeInstanceOf(THREE.LineSegments);
    expect(cosmologyVisual.root.getObjectByName('cosmology-deep-starfield')).toBeTruthy();
    expect(cosmologyVisual.root.getObjectByName('cosmology-accretion-style-particles')?.userData.visualAnalogy).toContain('NOT_SOLVER_OUTPUT');
    expect(cosmologyVisual.root.getObjectByName('cosmology-inferred-dark-matter-halo')?.userData.epistemic).toBe('MODEL_INFERRED_DISTRIBUTION');
    expect(cosmologyVisual.root.children.length).toBeLessThanOrEqual(8);
    cosmologyVisual.dispose();
  });
});
