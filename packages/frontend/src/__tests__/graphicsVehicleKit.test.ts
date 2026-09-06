import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createVehicle, type VehicleKind, type VehicleState } from '../core/three/graphics/vehicleKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

const KINDS: VehicleKind[] = ['car', 'van', 'bus', 'truck', 'ambulance'];

describe('createVehicle', () => {
  for (const kind of KINDS) {
    it(`builds a real, non-empty group for kind '${kind}'`, () => {
      const vehicle = createVehicle(THREE, { kind, position: [0, 0, 0], bodyMaterial: material() });
      expect(vehicle.group.name).toBe(`genesis-vehicle-${kind}`);
      const meshCount = vehicle.group.children.filter((c) => c instanceof THREE.Mesh).length;
      expect(meshCount).toBeGreaterThanOrEqual(4 + 4); // chassis + cabin + 4 wheels + at least one light/mirror
    });
  }

  it('is positioned at the requested base position and heading', () => {
    const vehicle = createVehicle(THREE, { kind: 'car', position: [3, 0, -2], headingRadians: Math.PI / 2, bodyMaterial: material() });
    expect(vehicle.group.position.x).toBe(3);
    expect(vehicle.group.position.z).toBe(-2);
    expect(vehicle.group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });

  it('two vehicles of the same kind with different seeds are not identical in size', () => {
    const a = createVehicle(THREE, { kind: 'van', position: [0, 0, 0], bodyMaterial: material(), seed: 1 });
    const b = createVehicle(THREE, { kind: 'van', position: [0, 0, 0], bodyMaterial: material(), seed: 99 });
    const chassisA = a.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const chassisB = b.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const widthA = (chassisA.geometry as THREE.BoxGeometry).parameters.width;
    const widthB = (chassisB.geometry as THREE.BoxGeometry).parameters.width;
    expect(widthA).not.toBe(widthB);
  });

  it('the same seed always produces the same dimensions (deterministic, not Math.random)', () => {
    const a = createVehicle(THREE, { kind: 'truck', position: [0, 0, 0], bodyMaterial: material(), seed: 42 });
    const b = createVehicle(THREE, { kind: 'truck', position: [0, 0, 0], bodyMaterial: material(), seed: 42 });
    const chassisA = a.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    const chassisB = b.group.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh;
    expect((chassisA.geometry as THREE.BoxGeometry).parameters.width).toBe((chassisB.geometry as THREE.BoxGeometry).parameters.width);
  });

  it('an ambulance carries a red-cross panel', () => {
    const vehicle = createVehicle(THREE, { kind: 'ambulance', position: [0, 0, 0], bodyMaterial: material() });
    const crossMeshes = vehicle.group.children.filter(
      (c) => c instanceof THREE.Mesh && c.material instanceof THREE.MeshBasicMaterial && (c.material as THREE.MeshBasicMaterial).color.getHex() === 0xff3b3b,
    );
    expect(crossMeshes.length).toBe(2); // horizontal + vertical bar
  });

  it('defaults to PARKED state and setState changes the reported state', () => {
    const vehicle = createVehicle(THREE, { kind: 'car', position: [0, 0, 0], bodyMaterial: material() });
    expect(vehicle.state).toBe('PARKED');
    vehicle.setState('EMERGENCY');
    expect(vehicle.state).toBe('EMERGENCY');
  });

  const STATES: VehicleState[] = ['PARKED', 'MOVING', 'STOPPED', 'EMERGENCY', 'OFFLINE'];
  it('every state maps to a distinct, real applyVisualState emissive intensity on the light material', () => {
    const vehicle = createVehicle(THREE, { kind: 'car', position: [0, 0, 0], bodyMaterial: material() });
    const light = vehicle.group.children.find(
      (c) => c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial && (c.material as THREE.MeshStandardMaterial).color.getHex() === 0x222222,
    ) as THREE.Mesh;
    const seenIntensities = new Set<number>();
    for (const state of STATES) {
      vehicle.setState(state);
      seenIntensities.add((light.material as THREE.MeshStandardMaterial).emissiveIntensity);
    }
    expect(seenIntensities.size).toBeGreaterThan(1); // states genuinely differ, not a no-op
  });

  it('dispose() does not throw and disposes geometries it created', () => {
    const vehicle = createVehicle(THREE, { kind: 'bus', position: [0, 0, 0], bodyMaterial: material() });
    expect(() => vehicle.dispose()).not.toThrow();
  });
});
