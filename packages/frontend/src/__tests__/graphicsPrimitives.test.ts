import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createColumn, createPlatform, createGlassChamber, createPipe } from '../core/three/graphics/primitives';

function material(): THREE.Material {
  return new THREE.MeshStandardMaterial();
}

describe('createColumn', () => {
  it('builds a vertical cylinder whose base sits at `position`, not its geometric center', () => {
    const column = createColumn(THREE, material(), { position: [1, 0, 2], height: 2 });
    expect(column.position.toArray()).toEqual([1, 1, 2]); // base at y=0 -> center at y=height/2
  });

  it('defaults to a slender radius', () => {
    const column = createColumn(THREE, material(), { position: [0, 0, 0], height: 1 });
    const geometry = column.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.radiusTop).toBe(0.06);
    expect(geometry.parameters.radiusBottom).toBe(0.06);
  });

  it('honors an explicit radius and radialSegments', () => {
    const column = createColumn(THREE, material(), { position: [0, 0, 0], height: 1, radius: 0.3, radialSegments: 20 });
    const geometry = column.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.radiusTop).toBe(0.3);
    expect(geometry.parameters.radialSegments).toBe(20);
  });

  it('throws on non-positive height or radius rather than producing degenerate geometry', () => {
    expect(() => createColumn(THREE, material(), { position: [0, 0, 0], height: 0 })).toThrow();
    expect(() => createColumn(THREE, material(), { position: [0, 0, 0], height: -1 })).toThrow();
    expect(() => createColumn(THREE, material(), { position: [0, 0, 0], height: 1, radius: 0 })).toThrow();
  });
});

describe('createPlatform', () => {
  it('defaults to a box footprint, centered at `position`', () => {
    const platform = createPlatform(THREE, material(), { position: [2, 1, 0], width: 4, depth: 3, thickness: 0.2 });
    expect(platform.position.toArray()).toEqual([2, 1, 0]);
    const geometry = platform.geometry as THREE.BoxGeometry;
    expect(geometry.parameters.width).toBe(4);
    expect(geometry.parameters.depth).toBe(3);
    expect(geometry.parameters.height).toBe(0.2);
  });

  it('builds a disc footprint when shape is "disc"', () => {
    const platform = createPlatform(THREE, material(), { position: [0, 0, 0], shape: 'disc', radius: 0.6, thickness: 0.12 });
    const geometry = platform.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.radiusTop).toBe(0.6);
    expect(geometry.parameters.height).toBe(0.12);
  });

  it('throws when box shape is missing width/depth', () => {
    expect(() => createPlatform(THREE, material(), { position: [0, 0, 0], thickness: 0.1 })).toThrow(/width.*depth/);
  });

  it('throws when disc shape is missing radius', () => {
    expect(() => createPlatform(THREE, material(), { position: [0, 0, 0], shape: 'disc', thickness: 0.1 })).toThrow(/radius/);
  });

  it('throws on non-positive thickness', () => {
    expect(() => createPlatform(THREE, material(), { position: [0, 0, 0], width: 1, depth: 1, thickness: 0 })).toThrow();
  });
});

describe('createGlassChamber', () => {
  it('builds an open-ended cylinder by default, base at `position`', () => {
    const chamber = createGlassChamber(THREE, material(), { position: [0, 0.15, 0], height: 1.1, radiusBottom: 0.42 });
    expect(chamber.position.y).toBeCloseTo(0.15 + 0.55);
    const geometry = chamber.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.openEnded).toBe(true);
    expect(geometry.parameters.radiusBottom).toBe(0.42);
    expect(geometry.parameters.radiusTop).toBe(0.42); // defaults to radiusBottom
  });

  it('supports an independent radiusTop for a tapered chamber', () => {
    const chamber = createGlassChamber(THREE, material(), { position: [0, 0, 0], height: 1, radiusTop: 0.2, radiusBottom: 0.5 });
    const geometry = chamber.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.radiusTop).toBe(0.2);
    expect(geometry.parameters.radiusBottom).toBe(0.5);
  });

  it('can be sealed (capped) via openEnded: false', () => {
    const chamber = createGlassChamber(THREE, material(), { position: [0, 0, 0], height: 1, openEnded: false });
    const geometry = chamber.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.openEnded).toBe(false);
  });

  it('throws on non-positive height/radius', () => {
    expect(() => createGlassChamber(THREE, material(), { position: [0, 0, 0], height: 0 })).toThrow();
    expect(() => createGlassChamber(THREE, material(), { position: [0, 0, 0], height: 1, radiusBottom: -1 })).toThrow();
  });
});

describe('createPipe', () => {
  it('spans the correct length between two arbitrary points', () => {
    const pipe = createPipe(THREE, material(), { from: [0, 0, 0], to: [3, 4, 0], radius: 0.05 });
    const geometry = pipe.geometry as THREE.CylinderGeometry;
    expect(geometry.parameters.height).toBeCloseTo(5); // 3-4-5 triangle
  });

  it('centers the mesh at the midpoint of from/to', () => {
    const pipe = createPipe(THREE, material(), { from: [0, 0, 0], to: [2, 0, 0], radius: 0.05 });
    expect(pipe.position.toArray()).toEqual([1, 0, 0]);
  });

  it('orients the cylinder so its two ends land exactly on from/to', () => {
    const from: THREE.Vector3Tuple = [1, 0, 2];
    const to: THREE.Vector3Tuple = [1, 3, 5];
    const pipe = createPipe(THREE, material(), { from, to, radius: 0.05 });
    const height = (pipe.geometry as THREE.CylinderGeometry).parameters.height;
    // The default cylinder's local +Y/-Y caps, transformed by the mesh's own position/quaternion,
    // must land exactly on `to`/`from` — proves the orientation math, not just the length.
    const topLocal = new THREE.Vector3(0, height / 2, 0).applyQuaternion(pipe.quaternion).add(pipe.position);
    const bottomLocal = new THREE.Vector3(0, -height / 2, 0).applyQuaternion(pipe.quaternion).add(pipe.position);
    expect(topLocal.toArray()[0]).toBeCloseTo(to[0]);
    expect(topLocal.toArray()[1]).toBeCloseTo(to[1]);
    expect(topLocal.toArray()[2]).toBeCloseTo(to[2]);
    expect(bottomLocal.toArray()[0]).toBeCloseTo(from[0]);
    expect(bottomLocal.toArray()[1]).toBeCloseTo(from[1]);
    expect(bottomLocal.toArray()[2]).toBeCloseTo(from[2]);
  });

  it('throws on a zero-length pipe (from === to) rather than a degenerate cylinder', () => {
    expect(() => createPipe(THREE, material(), { from: [1, 1, 1], to: [1, 1, 1], radius: 0.05 })).toThrow(/zero-length/);
  });

  it('throws on non-positive radius', () => {
    expect(() => createPipe(THREE, material(), { from: [0, 0, 0], to: [1, 0, 0], radius: 0 })).toThrow();
  });
});
