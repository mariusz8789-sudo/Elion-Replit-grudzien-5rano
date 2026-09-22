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
    const firstRing = handle.root.children.find((child) => child.userData.sourcePrimitiveId);
    expect(firstRing).toBeDefined();
    const before = firstRing!.rotation.z;
    handle.update(2.5);
    expect(firstRing!.rotation.z).not.toBe(before);
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
});
