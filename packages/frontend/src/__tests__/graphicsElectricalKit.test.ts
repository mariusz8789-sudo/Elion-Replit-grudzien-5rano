import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createElectricalCabinet, createConduitRun, createCondenserUnit } from '../core/three/graphics/electricalKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createElectricalCabinet', () => {
  it('builds a plinth, body, door, and 3 louvres by default (no hazard stripe)', () => {
    const cabinet = createElectricalCabinet(THREE, { position: [0, 0, 0], bodyMaterial: material() });
    expect(cabinet.children).toHaveLength(1 + 1 + 1 + 3);
    expect(cabinet.name).toBe('genesis-electrical-cabinet');
  });

  it('adds a hazard stripe mesh when hazardStripeMaterial is given', () => {
    const cabinet = createElectricalCabinet(THREE, { position: [0, 0, 0], bodyMaterial: material(), hazardStripeMaterial: material() });
    expect(cabinet.children).toHaveLength(1 + 1 + 1 + 3 + 1);
  });

  it('is positioned and rotated relative to a non-origin position/heading', () => {
    const cabinet = createElectricalCabinet(THREE, { position: [2, 0, 5], headingRadians: Math.PI / 3, bodyMaterial: material() });
    expect(cabinet.position.x).toBe(2);
    expect(cabinet.position.z).toBe(5);
    expect(cabinet.rotation.y).toBeCloseTo(Math.PI / 3, 5);
  });
});

describe('createConduitRun', () => {
  it('connects N waypoints into N-1 pipe segments with no brackets by default', () => {
    const run = createConduitRun(THREE, {
      waypoints: [[0, 1, 0], [1, 1, 0], [1, 1, 1]], material: material(),
    });
    expect(run.children).toHaveLength(2);
  });

  it('adds one bracket per INTERIOR waypoint when bracketMaterial is given (never at the open ends)', () => {
    const run = createConduitRun(THREE, {
      waypoints: [[0, 1, 0], [1, 1, 0], [2, 1, 0], [3, 1, 0]], material: material(), bracketMaterial: material(),
    });
    // 3 pipe segments + 2 interior-waypoint brackets (indices 1 and 2, not 0 or 3)
    expect(run.children).toHaveLength(3 + 2);
  });

  it('throws with fewer than 2 waypoints', () => {
    expect(() => createConduitRun(THREE, { waypoints: [[0, 0, 0]], material: material() })).toThrow();
  });
});

describe('createCondenserUnit', () => {
  it('builds 4 feet, a body, and a fan grille', () => {
    const unit = createCondenserUnit(THREE, { position: [0, 0, 0], bodyMaterial: material() });
    expect(unit.children).toHaveLength(4 + 1 + 1);
    expect(unit.name).toBe('genesis-condenser-unit');
  });

  it('the fan sits above the body\'s own top surface', () => {
    const height = 0.2;
    const unit = createCondenserUnit(THREE, { position: [0, 0, 0], height, bodyMaterial: material() });
    const body = unit.children.find((c) => c instanceof THREE.Mesh && (c as THREE.Mesh).geometry instanceof THREE.BoxGeometry) as THREE.Mesh;
    // The fan is the LAST child added (after the 4 cylindrical feet, which also use CylinderGeometry
    // but at a much smaller radius) — grab it by position, not by geometry type alone.
    const fan = unit.children[unit.children.length - 1] as THREE.Mesh;
    const bodyTop = body.position.y + (body.geometry as THREE.BoxGeometry).parameters.height / 2;
    expect(fan.position.y).toBeGreaterThan(bodyTop);
  });
});
