import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFacadeBuilding } from '../core/three/graphics/buildingKit';
import { weatherProfile } from '../core/three/graphics/highFidelityWeather';
import { createTemporalCinematicVisualResolver } from '../core/temporalCinematic/temporalCinematicVisualResolver';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import type { WorldModelEntity } from '../core/worldModel/ecs/types';

beforeAll(() => {
  const gradient = { addColorStop: () => {} } as unknown as CanvasGradient;
  const context: Partial<CanvasRenderingContext2D> = {
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })) as CanvasRenderingContext2D['createImageData'],
    getImageData: ((_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h })) as CanvasRenderingContext2D['getImageData'],
    putImageData: () => {},
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
});

function material(): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial(); }

function canonicalWideBuilding(): WorldModelEntity {
  return {
    id: 'building:wide-city-block',
    ref: { kind: 'building', id: 'wide-city-block' },
    label: 'Wide city block',
    scale: { level: 'BUILDING' },
    spatial: { position: { x: 0, y: 14, z: 0 }, scale: { x: 28, y: 28, z: 28 } },
    geometry: {
      kind: 'BUILDING',
      bounds: { minX: -42, maxX: 42, minZ: -12, maxZ: 12 },
      buildingType: 'COMMERCIAL',
      floorCount: 8,
      parcelRef: { kind: 'parcel', id: 'p' },
      districtRef: { kind: 'district', id: 'd' },
    },
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
}

describe('final Temporal Cinematic city visual quality', () => {
  it('segments a wide generated footprint into deterministic facade bays with a plinth and entrance', () => {
    const options = {
      position: [0, 0, 0] as THREE.Vector3Tuple,
      width: 12, depth: 5, height: 8, floorHeight: 1,
      seed: 17, wallMaterial: material(), windowMaterial: material(), trimMaterial: material(), entranceMaterial: material(),
    };
    const a = createFacadeBuilding(THREE, options);
    const b = createFacadeBuilding(THREE, options);
    const reliefA = a.getObjectByName('genesis-facade-architectural-relief') as THREE.Group;
    const reliefB = b.getObjectByName('genesis-facade-architectural-relief') as THREE.Group;
    expect(reliefA).toBeDefined();
    expect(reliefA.children.map((child) => child.name || child.type)).toEqual(reliefB.children.map((child) => child.name || child.type));
    expect(reliefA.children.filter((child) => (child as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(2);
    expect(reliefA.children.filter((child) => (child as THREE.Mesh).isMesh && !(child as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(2);
  });

  it('offsets facade windows far enough to avoid captured-frame z-fighting streaks', () => {
    const building = createFacadeBuilding(THREE, {
      position: [0, 0, 0], width: 8, depth: 4, height: 7, floorHeight: 1,
      seed: 4, wallMaterial: material(), windowMaterial: material(),
    });
    const windows = building.children.find((child) => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    let closestFrontOffset = Number.POSITIVE_INFINITY;
    for (let i = 0; i < windows.count; i++) {
      windows.getMatrixAt(i, matrix);
      position.setFromMatrixPosition(matrix);
      // Side-facade instances share the same batch and may have positive z; only the
      // front facade is outside the canonical half-depth (z > 2 for this fixture).
      if (position.z > 2) closestFrontOffset = Math.min(closestFrontOffset, position.z - 2);
    }
    expect(closestFrontOffset).toBeGreaterThanOrEqual(0.004);
  });

  it('uses a single geometric window vocabulary instead of emissive texture plus glass overlays', () => {
    const graph = new WorldGraph();
    const model = canonicalWideBuilding();
    graph.addEntity(model);
    const resolver = createTemporalCinematicVisualResolver(THREE, graph, { weather: 'CLEAR', governedHeroHuman: false });
    try {
      const visual = resolver.resolveVisual({
        id: model.id, position: [0, 14, 0], scale: 28, visualHint: 'building', grounding: 'DERIVED',
      });
      expect(visual.kind).toBe('object');
      if (visual.kind !== 'object') return;
      let body: THREE.Mesh | undefined;
      let windows: THREE.InstancedMesh | undefined;
      visual.object.traverse((object) => {
        if ((object as THREE.InstancedMesh).isInstancedMesh && !windows) windows = object as THREE.InstancedMesh;
        if ((object as THREE.Mesh).isMesh && !(object as THREE.InstancedMesh).isInstancedMesh && !body) body = object as THREE.Mesh;
      });
      const bodyMaterial = body?.material as THREE.MeshStandardMaterial;
      expect(bodyMaterial.emissiveMap).toBeNull();
      expect(windows?.material).not.toBe(resolver.palette.glass);
      expect((windows?.material as THREE.MeshStandardMaterial).transparent).toBe(false);
    } finally {
      resolver.dispose();
    }
  });

  it('keeps CLEAR aerial perspective below the washout threshold while preserving stronger weather fog', () => {
    expect(weatherProfile('CLEAR').fogDensity).toBe(0.0035);
    expect(weatherProfile('CLOUDY').fogDensity).toBeGreaterThan(weatherProfile('CLEAR').fogDensity);
    expect(weatherProfile('FOG').fogDensity).toBeGreaterThan(weatherProfile('CLOUDY').fogDensity);
  });
});
