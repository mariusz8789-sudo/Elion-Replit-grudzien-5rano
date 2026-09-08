import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildTerrainFieldMesh, type HeightfieldLike } from '../core/three/graphics/terrainField';

function flatTerrain(cols: number, rows: number, cellSizeM = 10): HeightfieldLike {
  return { cols, rows, cellSizeM, elevationsM: new Array(cols * rows).fill(0) };
}

describe('buildTerrainFieldMesh', () => {
  it('produces one vertex per grid cell, row-major, matching elevationsM length', () => {
    const terrain = flatTerrain(4, 3);
    const field = buildTerrainFieldMesh(THREE, terrain, { cellValueOf: () => null, colorOfValue: () => new THREE.Color(0xffffff) });
    const positions = field.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    expect(positions.count).toBe(4 * 3);
  });

  it('displaces each vertex by its real elevation (scaled by heightScale and worldScale)', () => {
    const cols = 3;
    const rows = 3;
    const elevationsM = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const terrain: HeightfieldLike = { cols, rows, cellSizeM: 5, elevationsM };
    const field = buildTerrainFieldMesh(THREE, terrain, {
      heightScale: 2,
      cellValueOf: () => null,
      colorOfValue: () => new THREE.Color(0x000000),
    });
    const positions = field.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < elevationsM.length; i++) {
      expect(positions.getY(i)).toBeCloseTo(elevationsM[i]! * 2, 5);
    }
  });

  it('sizes the mesh footprint from cellSizeM and worldScale', () => {
    const terrain = flatTerrain(5, 4, 10);
    const field = buildTerrainFieldMesh(THREE, terrain, { worldScale: 2, cellValueOf: () => null, colorOfValue: () => new THREE.Color(0) });
    const box = new THREE.Box3().setFromObject(field.mesh);
    const size = new THREE.Vector3();
    box.getSize(size);
    expect(size.x).toBeCloseTo((5 - 1) * 10 * 2, 5);
    expect(size.z).toBeCloseTo((4 - 1) * 10 * 2, 5);
  });

  it('colors a real (non-null, finite) cell using colorOfValue', () => {
    const terrain = flatTerrain(2, 2);
    const field = buildTerrainFieldMesh(THREE, terrain, {
      cellValueOf: (i) => (i === 0 ? 0.5 : null),
      colorOfValue: () => new THREE.Color(0xff0000),
    });
    const colors = field.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(colors.getX(0)).toBeCloseTo(1, 5);
    expect(colors.getY(0)).toBeCloseTo(0, 5);
    expect(colors.getZ(0)).toBeCloseTo(0, 5);
  });

  it('never extrapolates a null cell onto the severity scale — it gets noDataColor instead', () => {
    const terrain = flatTerrain(2, 2);
    const field = buildTerrainFieldMesh(THREE, terrain, {
      noDataColor: 0x123456,
      cellValueOf: () => null,
      colorOfValue: () => new THREE.Color(0xff0000),
    });
    const colors = field.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const expected = new THREE.Color(0x123456);
    expect(colors.getX(0)).toBeCloseTo(expected.r, 5);
    expect(colors.getY(0)).toBeCloseTo(expected.g, 5);
    expect(colors.getZ(0)).toBeCloseTo(expected.b, 5);
  });

  it('treats a non-finite real value (e.g. Infinity, an unreached fire cell) the same as null', () => {
    const terrain = flatTerrain(2, 2);
    const field = buildTerrainFieldMesh(THREE, terrain, {
      noDataColor: 0x00ff00,
      cellValueOf: () => Infinity,
      colorOfValue: () => new THREE.Color(0xff0000),
    });
    const colors = field.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(colors.getX(0)).toBeCloseTo(0, 5);
    expect(colors.getY(0)).toBeCloseTo(1, 5);
    expect(colors.getZ(0)).toBeCloseTo(0, 5);
  });

  it('updateColors() re-reads cellValueOf and re-applies without rebuilding geometry', () => {
    const terrain = flatTerrain(2, 2);
    let value = 0;
    const field = buildTerrainFieldMesh(THREE, terrain, {
      cellValueOf: (i) => (i === 0 ? value : null),
      colorOfValue: (_T, v) => new THREE.Color(v, 0, 0),
    });
    const geometryBefore = field.mesh.geometry;
    value = 0.75;
    field.updateColors();
    const colors = field.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(colors.getX(0)).toBeCloseTo(0.75, 5);
    expect(field.mesh.geometry).toBe(geometryBefore);
  });

  it('throws on a degenerate (< 2x2) grid instead of producing an invalid mesh', () => {
    const terrain = flatTerrain(1, 3);
    expect(() => buildTerrainFieldMesh(THREE, terrain, { cellValueOf: () => null, colorOfValue: () => new THREE.Color(0) })).toThrow();
  });

  it('dispose() releases geometry and material without throwing', () => {
    const terrain = flatTerrain(2, 2);
    const field = buildTerrainFieldMesh(THREE, terrain, { cellValueOf: () => null, colorOfValue: () => new THREE.Color(0) });
    expect(() => field.dispose()).not.toThrow();
  });
});
