import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBench, createCabinet, createShelfUnit, createMonitor } from '../core/three/graphics/labKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createBench', () => {
  it('builds four legs and one top platform', () => {
    const bench = createBench(THREE, { position: [0, 0, 0], width: 1.2, depth: 0.6, height: 0.9, topMaterial: material() });
    const meshes = bench.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes).toHaveLength(5); // 4 legs + 1 top
  });

  it('the top platform\'s upper face sits at exactly the requested height above `position`', () => {
    const height = 0.9;
    const bench = createBench(THREE, { position: [0, 0.5, 0], width: 1, depth: 1, height, topMaterial: material() });
    const top = bench.children[bench.children.length - 1] as THREE.Mesh;
    const geometry = top.geometry as THREE.BoxGeometry;
    const topThickness = geometry.parameters.height;
    const upperFaceY = top.position.y + topThickness / 2; // BoxGeometry is centered on its own origin
    expect(upperFaceY).toBeCloseTo(0.5 + height, 5);
  });

  it('is positioned relative to a non-origin `position`', () => {
    const bench = createBench(THREE, { position: [5, 0, -3], width: 1, depth: 1, height: 0.9, topMaterial: material() });
    for (const child of bench.children) {
      expect(Math.abs((child as THREE.Mesh).position.x - 5)).toBeLessThan(1);
      expect(Math.abs((child as THREE.Mesh).position.z - -3)).toBeLessThan(1);
    }
  });
});

describe('createCabinet', () => {
  it('builds a body, a door, and a handle', () => {
    const cabinet = createCabinet(THREE, { position: [0, 0, 0], width: 0.6, depth: 0.4, height: 1.2, bodyMaterial: material() });
    expect(cabinet.children).toHaveLength(3);
    expect(cabinet.name).toBe('genesis-lab-cabinet');
  });

  it('falls back to bodyMaterial for the door/handle when not given their own', () => {
    const body = material();
    const cabinet = createCabinet(THREE, { position: [0, 0, 0], width: 0.6, depth: 0.4, height: 1.2, bodyMaterial: body });
    const [bodyMesh, doorMesh, handleMesh] = cabinet.children as THREE.Mesh[];
    expect(bodyMesh!.material).toBe(body);
    expect(doorMesh!.material).toBe(body);
    expect(handleMesh!.material).toBe(body);
  });

  it('uses a distinct doorMaterial when supplied', () => {
    const body = material();
    const door = material();
    const cabinet = createCabinet(THREE, { position: [0, 0, 0], width: 0.6, depth: 0.4, height: 1.2, bodyMaterial: body, doorMaterial: door });
    const doorMesh = cabinet.children[1] as THREE.Mesh;
    expect(doorMesh.material).toBe(door);
  });
});

describe('createShelfUnit', () => {
  it('rejects a non-positive height', () => {
    expect(() => createShelfUnit(THREE, { position: [0, 0, 0], width: 1, depth: 0.4, height: 0, material: material() })).toThrow();
  });

  it('builds 4 corner posts plus the default 4 shelves', () => {
    const unit = createShelfUnit(THREE, { position: [0, 0, 0], width: 1, depth: 0.4, height: 1.8, material: material() });
    expect(unit.children).toHaveLength(4 + 4);
  });

  it('respects a custom shelfCount', () => {
    const unit = createShelfUnit(THREE, { position: [0, 0, 0], width: 1, depth: 0.4, height: 1.8, material: material(), shelfCount: 6 });
    expect(unit.children).toHaveLength(4 + 6);
  });

  it('shelves are evenly spaced from floor to the requested height', () => {
    const unit = createShelfUnit(THREE, { position: [0, 0, 0], width: 1, depth: 0.4, height: 2, material: material(), shelfCount: 3 });
    const shelves = unit.children.slice(4) as THREE.Mesh[];
    const ys = shelves.map((s) => s.position.y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(0, 1);
    expect(ys[2]).toBeCloseTo(2, 1);
  });
});

describe('createMonitor', () => {
  it('builds a stand, a frame, and a screen', () => {
    const monitor = createMonitor(THREE, { position: [0, 0.9, 0], width: 0.4, height: 0.25, frameMaterial: material() });
    expect(monitor.children).toHaveLength(3);
  });

  it('provides a plausible default screen material when none is given', () => {
    const monitor = createMonitor(THREE, { position: [0, 0.9, 0], width: 0.4, height: 0.25, frameMaterial: material() });
    const screen = monitor.children[2] as THREE.Mesh;
    expect(screen.material).toBeInstanceOf(THREE.MeshStandardMaterial);
  });

  it('uses a caller-supplied screen material (e.g. a live readout) when given', () => {
    const readout = material();
    const monitor = createMonitor(THREE, { position: [0, 0.9, 0], width: 0.4, height: 0.25, frameMaterial: material(), screenMaterial: readout });
    const screen = monitor.children[2] as THREE.Mesh;
    expect(screen.material).toBe(readout);
  });
});
