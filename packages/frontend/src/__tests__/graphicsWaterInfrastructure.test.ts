import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPump, createValve, createStorageTank, createPipeNetwork, type WaterInfrastructureState } from '../core/three/graphics/waterInfrastructure';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createPump', () => {
  it('builds a plinth, housing, inlet/outlet pipes, and a status light', () => {
    const pump = createPump(THREE, { position: [0, 0, 0], housingMaterial: material() });
    expect(pump.group.children).toHaveLength(1 + 1 + 2 + 1);
  });

  it('defaults to NORMAL state', () => {
    const pump = createPump(THREE, { position: [0, 0, 0], housingMaterial: material() });
    expect(pump.state).toBe('NORMAL');
  });

  const STATES: WaterInfrastructureState[] = ['NORMAL', 'WARNING', 'FAILED', 'OFFLINE'];
  it('every state produces a genuinely different emissive intensity on the status light (real applyVisualState wiring, not a no-op)', () => {
    const pump = createPump(THREE, { position: [0, 0, 0], housingMaterial: material() });
    const light = pump.group.children[pump.group.children.length - 1] as THREE.Mesh;
    const intensities = new Set<number>();
    for (const state of STATES) {
      pump.setState(state);
      intensities.add((light.material as THREE.MeshStandardMaterial).emissiveIntensity);
    }
    expect(intensities.size).toBe(STATES.length);
  });

  it('never fabricates a non-NORMAL state on its own — stays NORMAL until setState is called', () => {
    const pump = createPump(THREE, { position: [0, 0, 0], housingMaterial: material() });
    expect(pump.state).toBe('NORMAL');
    // Re-reading state repeatedly without calling setState must never drift.
    expect(pump.state).toBe('NORMAL');
  });

  it('dispose() does not throw', () => {
    const pump = createPump(THREE, { position: [0, 0, 0], housingMaterial: material() });
    expect(() => pump.dispose()).not.toThrow();
  });
});

describe('createValve', () => {
  it('builds a body and a wheel', () => {
    const valve = createValve(THREE, { position: [0, 0, 0], material: material() });
    expect(valve.children).toHaveLength(2);
  });
});

describe('createStorageTank', () => {
  it('builds legs, a tank body, and a dome cap when elevated (default)', () => {
    const tank = createStorageTank(THREE, { position: [0, 0, 0], radius: 0.3, height: 0.6, bodyMaterial: material() });
    expect(tank.children).toHaveLength(4 + 1 + 1);
  });

  it('omits legs when elevated: false', () => {
    const tank = createStorageTank(THREE, { position: [0, 0, 0], radius: 0.3, height: 0.6, bodyMaterial: material(), elevated: false });
    expect(tank.children).toHaveLength(1 + 1);
  });
});

describe('createPipeNetwork', () => {
  it('connects N waypoints into N-1 pipe segments', () => {
    const network = createPipeNetwork(THREE, {
      waypoints: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [2, 0, 1]],
      radius: 0.02,
      material: material(),
    });
    expect(network.children).toHaveLength(3);
  });

  it('throws with fewer than 2 waypoints', () => {
    expect(() => createPipeNetwork(THREE, { waypoints: [[0, 0, 0]], radius: 0.02, material: material() })).toThrow();
  });
});
