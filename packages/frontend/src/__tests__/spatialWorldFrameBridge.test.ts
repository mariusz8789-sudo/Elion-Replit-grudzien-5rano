import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { normalizeOsmMapXml } from '../core/experimentFabric/spatialImport';
import { createSpatialWorldOverlay } from '../core/simulationRenderer/spatialOverlay';
import {
  buildSpatialWorldFrame, metricOverlaySize,
  OSM_BUILDING_HINT, OSM_ROAD_HINT,
} from '../core/simulationRenderer/spatialWorldFrame';
import { createSpatialFeatureAdapter, isSpatialFeatureHint } from '../core/three/graphics/spatialFeatureBridge';
import { WorldFrameRenderer } from '../core/three/graphics/worldFrameRenderer';

/**
 * GRAPHICS V2 SPRINT A — proves the whole imported-spatial pathway end to end:
 *
 *   OSM XML -> normalizeOsmMapXml -> createSpatialWorldOverlay -> buildSpatialWorldFrame
 *           -> WorldFrameRenderer.sync -> real THREE objects in a real scene graph
 *
 * SCOPE OF WHAT THIS PROVES, stated precisely: the XML below is authored here, in OSM's real schema,
 * so these tests exercise the real parser and the real bridge. It is NOT a fetched extract of a real
 * place — live OSM acquisition is blocked in this environment (see the Sprint A report), and
 * `gisImportBoundary.test.ts` deliberately parks `importOsmMap` anyway. So: the PIPELINE is proven
 * real; the CONTENT here is test data.
 */

/** Two buildings and one road, in OSM's own XML schema. One building carries a real `height` tag,
 * the other carries nothing — which is the case the honesty flags exist for. */
const OSM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="test-fixture">
  <node id="1" lon="-0.5140" lat="38.3650"/>
  <node id="2" lon="-0.5130" lat="38.3650"/>
  <node id="3" lon="-0.5130" lat="38.3660"/>
  <node id="4" lon="-0.5140" lat="38.3660"/>
  <node id="10" lon="-0.5120" lat="38.3650"/>
  <node id="11" lon="-0.5110" lat="38.3650"/>
  <node id="12" lon="-0.5110" lat="38.3658"/>
  <node id="13" lon="-0.5120" lat="38.3658"/>
  <node id="20" lon="-0.5145" lat="38.3665"/>
  <node id="21" lon="-0.5105" lat="38.3665"/>
  <node id="22" lon="-0.5100" lat="38.3670"/>
  <way id="100">
    <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="4"/><nd ref="1"/>
    <tag k="building" v="hospital"/>
    <tag k="height" v="24"/>
    <tag k="name" v="Hospital"/>
  </way>
  <way id="101">
    <nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><nd ref="10"/>
    <tag k="building" v="yes"/>
  </way>
  <way id="200">
    <nd ref="20"/><nd ref="21"/><nd ref="22"/>
    <tag k="highway" v="primary"/>
    <tag k="lanes" v="4"/>
  </way>
</osm>`;

const BBOX = [-0.5145, 38.3645, -0.5100, 38.3672] as const;

function dataset() {
  return normalizeOsmMapXml(OSM_XML, { bbox: BBOX, sourceTimestamp: '2026-01-01T00:00:00Z' });
}

function overlay() {
  const data = dataset();
  const { worldWidth, worldHeight } = metricOverlaySize(data.bbox);
  return createSpatialWorldOverlay(data, worldWidth, worldHeight);
}

beforeAll(() => {
  // materials.ts's procedural textures touch document.createElement('canvas') — the same minimal
  // stub every other graphics test in this suite uses.
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

describe('metricOverlaySize — imported units are real metres, not arbitrary ones', () => {
  it('converts a lon/lat bbox into a real metric extent, shrinking longitude by latitude', () => {
    const { worldWidth, worldHeight } = metricOverlaySize(BBOX);
    // 0.0027° of latitude ≈ 300 m; the longitude span is 0.0045° but at 38°N a degree of longitude
    // is only ~cos(38°) ≈ 0.79 of a degree of latitude.
    expect(worldHeight).toBeCloseTo(0.0027 * 111_320, 0);
    expect(worldWidth).toBeLessThan(0.0045 * 111_320);
    expect(worldWidth).toBeGreaterThan(0.0045 * 111_320 * 0.7);
  });
});

describe('buildSpatialWorldFrame — OSM overlay to canonical WorldFrame', () => {
  it('emits one entity per building, positioned at the real footprint centroid', () => {
    const frame = buildSpatialWorldFrame(overlay());
    const buildings = frame.entities.filter((e) => e.visualHint === OSM_BUILDING_HINT);
    expect(buildings).toHaveLength(2);
    // Ids are the real OSM way ids, so they are stable across frames (SOLVER_DATA_CONTRACT Rule 4).
    expect(buildings.map((b) => b.id).sort()).toEqual(['way/100', 'way/101']);
    for (const building of buildings) {
      expect(Number.isFinite(building.position[0])).toBe(true);
      expect(building.position[1]).toBe(0);
      expect(Number.isFinite(building.position[2])).toBe(true);
    }
  });

  it('carries the real footprint extent in metres, matching the bbox of the real vertices', () => {
    const frame = buildSpatialWorldFrame(overlay());
    const hospital = frame.entities.find((e) => e.id === 'way/100')!;
    // 0.001° lon at 38°N ≈ 87.7 m; 0.001° lat ≈ 111.3 m.
    expect(hospital.scalars!.footprintWidthM).toBeCloseTo(0.001 * 111_320 * Math.cos((38.36585 * Math.PI) / 180), 0);
    expect(hospital.scalars!.footprintDepthM).toBeCloseTo(0.001 * 111_320, 0);
    expect(hospital.scalars!.footprintMeasured).toBe(1);
  });

  it('HONESTY: a real height tag is carried and marked measured; a building with no height gets no heightM at all', () => {
    const frame = buildSpatialWorldFrame(overlay());
    const tagged = frame.entities.find((e) => e.id === 'way/100')!;
    const untagged = frame.entities.find((e) => e.id === 'way/101')!;

    expect(tagged.scalars!.heightM).toBe(24);
    expect(tagged.scalars!.heightMeasured).toBe(1);
    expect(tagged.grounding).toBe('MODELED');

    // The critical case: nothing is invented. No height key, and the grounding says so.
    expect(untagged.scalars!.heightM).toBeUndefined();
    expect(untagged.grounding).toBe('DERIVED');
  });

  it('splits a road way into per-segment entities with real length and heading', () => {
    const frame = buildSpatialWorldFrame(overlay());
    const segments = frame.entities.filter((e) => e.visualHint === OSM_ROAD_HINT);
    // A 3-node way is 2 segments.
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.scalars!.lengthM).toBeGreaterThan(0);
      expect(segment.rotation).toBeDefined();
      // lanes=4 is real OSM data, so a width is derived from it — but derived, not surveyed.
      expect(segment.scalars!.widthM).toBeCloseTo(4 * 3.2, 5);
      expect(segment.scalars!.widthMeasured).toBe(0);
    }
  });

  it('centres the import on the world origin by default, and can be told not to', () => {
    const centred = buildSpatialWorldFrame(overlay(), { center: true });
    const raw = buildSpatialWorldFrame(overlay(), { center: false });
    const centredX = centred.entities.map((e) => e.position[0]);
    const rawX = raw.entities.map((e) => e.position[0]);
    // Un-centred coordinates start at a corner, so they are all positive; centred ones straddle zero.
    expect(Math.min(...rawX)).toBeGreaterThanOrEqual(0);
    expect(Math.min(...centredX)).toBeLessThan(0);
  });

  it('is deterministic and does not mutate the overlay', () => {
    const source = overlay();
    const before = JSON.stringify(source);
    const a = buildSpatialWorldFrame(source);
    const b = buildSpatialWorldFrame(source);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(source)).toBe(before);
  });

  it('drops sub-threshold segments rather than emitting an entity per stray vertex', () => {
    const huge = buildSpatialWorldFrame(overlay(), { minSegmentLength: 100_000 });
    expect(huge.entities.filter((e) => e.visualHint === OSM_ROAD_HINT)).toHaveLength(0);
  });
});

describe('createSpatialFeatureAdapter — imported features into a real scene graph', () => {
  function materials() {
    return {
      wallMaterial: new THREE.MeshStandardMaterial(),
      windowMaterial: new THREE.MeshStandardMaterial(),
      roadMaterial: new THREE.MeshStandardMaterial(),
    };
  }

  it('routes only its own hints', () => {
    expect(isSpatialFeatureHint(OSM_BUILDING_HINT)).toBe(true);
    expect(isSpatialFeatureHint(OSM_ROAD_HINT)).toBe(true);
    expect(isSpatialFeatureHint('object:water-pump')).toBe(false);
    expect(isSpatialFeatureHint(undefined)).toBe(false);
  });

  it('END TO END: OSM XML reaches the canonical WorldFrameRenderer as real objects in a real scene', () => {
    const scene = new THREE.Scene();
    const adapter = createSpatialFeatureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, {
      resolveVisual: (entity) => adapter.resolveVisual(entity),
      updateVisual: (entity, object) => adapter.updateVisual(entity, object),
    });

    renderer.sync(buildSpatialWorldFrame(overlay()));

    const buildings: THREE.Object3D[] = [];
    const roads: THREE.Object3D[] = [];
    scene.traverse((node) => {
      if (node.name === 'genesis-spatial-building') buildings.push(node);
      if (node.name === 'genesis-spatial-road') roads.push(node);
    });
    expect(buildings).toHaveLength(2);
    expect(roads).toHaveLength(2);

    renderer.dispose();
    adapter.dispose();
  });

  it('builds every object at LOCAL ORIGIN so applyTransform can place it (ADAPTER_CONTRACT rule 4)', () => {
    const adapter = createSpatialFeatureAdapter(THREE, materials());
    const frame = buildSpatialWorldFrame(overlay());
    for (const entity of frame.entities) {
      const spec = adapter.resolveVisual(entity);
      if (spec.kind !== 'object') continue;
      expect(spec.object.position.x).toBe(0);
      expect(spec.object.position.z).toBe(0);
    }
    adapter.dispose();
  });

  it('HONESTY: an approximated height is flagged notModeled; a real one is not', () => {
    const adapter = createSpatialFeatureAdapter(THREE, materials());
    const frame = buildSpatialWorldFrame(overlay());

    const measured = adapter.resolveVisual(frame.entities.find((e) => e.id === 'way/100')!);
    const approximated = adapter.resolveVisual(frame.entities.find((e) => e.id === 'way/101')!);

    expect(measured.kind === 'object' && measured.object.userData.heightMeasured).toBe(true);
    expect(measured.kind === 'object' && measured.object.userData.notModeled).toBe(false);

    expect(approximated.kind === 'object' && approximated.object.userData.heightMeasured).toBe(false);
    expect(approximated.kind === 'object' && approximated.object.userData.notModeled).toBe(true);
    adapter.dispose();
  });

  it('uses the REAL height when the import has one, rather than its own fallback', () => {
    const adapter = createSpatialFeatureAdapter(THREE, materials(), { fallbackBuildingHeightM: 5 });
    const frame = buildSpatialWorldFrame(overlay());
    const spec = adapter.resolveVisual(frame.entities.find((e) => e.id === 'way/100')!);
    expect(spec.kind).toBe('object');
    if (spec.kind !== 'object') return;
    const box = new THREE.Box3().setFromObject(spec.object);
    // The real tag says 24 m; the fallback would have produced 5.
    expect(box.max.y).toBeGreaterThan(20);
    adapter.dispose();
  });

  it('re-asserts the measured flags on every sync, so a stale flag can never linger', () => {
    const adapter = createSpatialFeatureAdapter(THREE, materials());
    const frame = buildSpatialWorldFrame(overlay());
    const entity = frame.entities.find((e) => e.id === 'way/101')!;
    const spec = adapter.resolveVisual(entity);
    if (spec.kind !== 'object') throw new Error('expected an object visual');

    // Simulate a richer re-import that now knows this building's real height.
    adapter.updateVisual({ ...entity, scalars: { ...entity.scalars, heightM: 12 } }, spec.object);
    expect(spec.object.userData.heightMeasured).toBe(true);
    expect(spec.object.userData.notModeled).toBe(false);
    adapter.dispose();
  });
});
