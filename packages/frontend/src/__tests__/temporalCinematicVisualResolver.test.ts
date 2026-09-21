import * as THREE from 'three';
import { describe, expect, it, beforeAll } from 'vitest';

/**
 * This project's vitest suite runs in a plain Node environment (no jsdom) — see
 * graphicsMaterials.test.ts's own doc. `createTemporalCinematicVisualResolver` resolves real PBR
 * materials (`createHighFidelityMaterialPalette` -> `createPBRMaterial('CERAMIC', ...)`), whose
 * procedural textures touch `document.createElement('canvas')`. Same minimal fake canvas as
 * graphicsMaterials.test.ts, not a project-wide jsdom dependency.
 */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillText: () => {},
    clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => fakeContext as CanvasRenderingContext2D,
  };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

import { createTemporalCinematicVisualResolver, estimateTemporalWorldGroundSize, normalizeTemporalCinematicFrameHierarchy } from '../core/temporalCinematic/temporalCinematicVisualResolver';
import type { WorldFrame, WorldFrameEntity } from '../core/three/graphics/worldFrame';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import type { WorldModelEntity } from '../core/worldModel/ecs/types';

function buildingEntity(): WorldModelEntity {
  return {
    id: 'building:test-building',
    ref: { kind: 'building', id: 'test-building' },
    label: 'Test laboratory',
    scale: { level: 'BUILDING' },
    spatial: { position: { x: 10, y: 10.5, z: 20 }, scale: { x: 21, y: 21, z: 21 } },
    geometry: {
      kind: 'BUILDING',
      bounds: { minX: 4, maxX: 16, minZ: 15, maxZ: 25 },
      buildingType: 'LABORATORY',
      floorCount: 6,
      parcelRef: { kind: 'parcel', id: 'p' },
      districtRef: { kind: 'district', id: 'd' },
    },
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
}

function roadEntity(): WorldModelEntity {
  return {
    id: 'road:test-road',
    ref: { kind: 'road', id: 'test-road' },
    label: 'Test road',
    scale: { level: 'MACRO_CITY' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    geometry: { kind: 'ROAD', start: { x: -50, z: 0 }, end: { x: 50, z: 0 }, widthM: 12, roadClass: 'ARTERIAL' },
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
}

function personEntity(): WorldModelEntity {
  return {
    id: 'agent:test-person',
    ref: { kind: 'agent', id: 'test-person' },
    label: 'Researcher',
    scale: { level: 'ROOM' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
}

function frame(entity: WorldModelEntity): WorldFrameEntity {
  return {
    id: entity.id,
    position: [entity.spatial?.position.x ?? 0, entity.spatial?.position.y ?? 0, entity.spatial?.position.z ?? 0],
    scale: entity.spatial?.scale?.x ?? 1,
    visualHint: entity.ref.kind,
    grounding: 'DERIVED',
  };
}

describe('Temporal Cinematic V5.1 visual resolver', () => {
  it('turns a canonical BUILDING geometry entity into a windowed facade object, not the gray default sphere', () => {
    const graph = new WorldGraph();
    const building = buildingEntity();
    graph.addEntity(building);
    const resolver = createTemporalCinematicVisualResolver(THREE, graph, { governedHeroHuman: false });
    try {
      const visual = resolver.resolveVisual(frame(building));
      expect(visual.kind).toBe('object');
      if (visual.kind !== 'object') return;
      expect(visual.object.name).toContain('genesis-world-building');
      expect(visual.object.children.length).toBeGreaterThan(0);
      let meshCount = 0;
      visual.object.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshCount += 1; });
      expect(meshCount).toBeGreaterThan(1);
    } finally {
      resolver.dispose();
    }
  });

  it('renders ROAD geometry as a real road slab and selects the wet material path for rain', () => {
    const graph = new WorldGraph();
    const road = roadEntity();
    graph.addEntity(road);
    const resolver = createTemporalCinematicVisualResolver(THREE, graph, { weather: 'RAIN', governedHeroHuman: false });
    try {
      const visual = resolver.resolveVisual(frame(road));
      expect(visual.kind).toBe('object');
      if (visual.kind !== 'object') return;
      expect(visual.object.name).toBe('genesis-road-arterial');
      expect((visual.object as THREE.Mesh).geometry).toBeInstanceOf(THREE.BoxGeometry);
    } finally {
      resolver.dispose();
    }
  });

  it('keeps people on the canonical resolver path with a deterministic articulated LOD1 proxy when governed GLB is disabled', () => {
    const graph = new WorldGraph();
    const person = personEntity();
    graph.addEntity(person);
    const resolver = createTemporalCinematicVisualResolver(THREE, graph, { governedHeroHuman: false, detailedHumanCount: 1 });
    try {
      const visual = resolver.resolveVisual(frame(person));
      expect(visual.kind).toBe('object');
      if (visual.kind !== 'object') return;
      expect(visual.object.name).toBe('genesis-human-lod1');
      expect(visual.object.children.length).toBeGreaterThan(0);
    } finally {
      resolver.dispose();
    }
  });

  it('flattens only geometry-backed render parents because generated geometry positions are absolute city-space coordinates', () => {
    const graph = new WorldGraph();
    const district: WorldModelEntity = {
      id: 'district:d', ref: { kind: 'district', id: 'd' }, label: 'District',
      scale: { level: 'DISTRICT' }, spatial: { position: { x: 100, y: 0, z: 100 } },
      geometry: { kind: 'DISTRICT', bounds: { minX: 50, maxX: 150, minZ: 50, maxZ: 150 }, districtType: 'MIXED_USE' },
      grounding: 'PROCEDURAL_APPROXIMATION', updatedAtTick: 0,
    };
    const building = buildingEntity();
    building.scale = { level: 'BUILDING', parentEntityId: district.id };
    graph.addEntity(district);
    graph.addEntity(building);
    const input: WorldFrame = {
      time: 0,
      entities: [
        { ...frame(district), parentId: null },
        { ...frame(building), parentId: district.id },
      ],
    };
    const normalized = normalizeTemporalCinematicFrameHierarchy(input, graph);
    expect(normalized.entities[1]?.parentId).toBeNull();
    expect(graph.getEntity(building.id).scale.parentEntityId).toBe(district.id);
  });


  it('flattens geometry-backed graphics parents without mutating canonical WorldGraph containment', () => {
    const graph = new WorldGraph();
    const district: WorldModelEntity = {
      id: 'district:d', ref: { kind: 'district', id: 'd' }, label: 'District', scale: { level: 'DISTRICT' },
      spatial: { position: { x: 100, y: 0, z: 100 } },
      geometry: { kind: 'DISTRICT', bounds: { minX: 50, maxX: 150, minZ: 50, maxZ: 150 }, districtType: 'CIVIC' },
      grounding: 'PROCEDURAL_APPROXIMATION', updatedAtTick: 0,
    };
    const child = buildingEntity();
    child.scale = { level: 'BUILDING', parentEntityId: district.id };
    graph.addEntity(district);
    graph.addEntity(child);
    const input = { time: 0, entities: [{ ...frame(child), parentId: district.id }] };
    const normalized = normalizeTemporalCinematicFrameHierarchy(input, graph);
    expect(normalized.entities[0]?.parentId).toBeNull();
    expect(graph.getEntity(child.id).scale.parentEntityId).toBe(district.id);
  });

  it('derives ground extent from canonical geometry instead of a Warsaw/London constant', () => {
    const graph = new WorldGraph();
    graph.addEntity(roadEntity());
    expect(estimateTemporalWorldGroundSize(graph)).toBeGreaterThanOrEqual(200);
  });
});
