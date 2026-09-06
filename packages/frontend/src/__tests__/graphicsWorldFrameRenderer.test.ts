import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity } from '../core/three/graphics/worldFrame';

function entity(overrides: Partial<WorldFrameEntity> & { id: string }): WorldFrameEntity {
  return { position: [0, 0, 0], ...overrides };
}

function frame(entities: WorldFrameEntity[], time = 0): WorldFrame {
  return { time, entities };
}

describe('WorldFrameRenderer — object-kind lifecycle', () => {
  it('creates a visible Object3D for a new entity and parents it under the root by default', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a', position: [1, 2, 3] })]));
    expect(root.children).toHaveLength(1);
    expect(root.children[0]!.position.toArray()).toEqual([1, 2, 3]);
  });

  it('moves an existing entity in place — same Object3D instance, not recreated', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a', position: [0, 0, 0] })]));
    const object = root.children[0]!;
    renderer.sync(frame([entity({ id: 'a', position: [5, 0, 0] })]));
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toBe(object);
    expect(object.position.toArray()).toEqual([5, 0, 0]);
  });

  it('applies rotation and scale from the entity', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a', position: [0, 0, 0], rotation: [0, Math.PI / 2, 0], scale: 3 })]));
    const object = root.children[0]!;
    expect(object.scale.x).toBe(3);
    expect(object.rotation.y).toBeCloseTo(Math.PI / 2);
  });

  it('removes and disposes an entity no longer present in the frame', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a' })]));
    const object = root.children[0] as THREE.Mesh;
    const disposeSpy = vi.spyOn(object.geometry, 'dispose');
    renderer.sync(frame([])); // 'a' no longer present
    expect(root.children).toHaveLength(0);
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('treats visible: false as absent — removes and disposes without requiring omission from the frame', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a' })]));
    renderer.sync(frame([entity({ id: 'a', visible: false })]));
    expect(root.children).toHaveLength(0);
  });

  it('re-adds an entity that reappears after being removed', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a' })]));
    renderer.sync(frame([]));
    renderer.sync(frame([entity({ id: 'a', position: [9, 9, 9] })]));
    expect(root.children).toHaveLength(1);
    expect(root.children[0]!.position.toArray()).toEqual([9, 9, 9]);
  });
});

describe('WorldFrameRenderer — hierarchy', () => {
  it('parents a child entity under its parent\'s Object3D, not the root', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([
      entity({ id: 'parent', position: [10, 0, 0] }),
      entity({ id: 'child', parentId: 'parent', position: [1, 0, 0] }),
    ]));
    expect(root.children).toHaveLength(1); // only the parent at root level
    const parentObject = root.children[0]!;
    expect(parentObject.children).toHaveLength(1);
    expect(parentObject.children[0]!.position.toArray()).toEqual([1, 0, 0]);
  });

  it('falls back to root-level when parentId references an entity not present in the frame', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'orphan', parentId: 'missing-parent' })]));
    expect(root.children).toHaveLength(1);
  });

  it('re-parents an entity when its parentId changes between syncs', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([
      entity({ id: 'p1' }), entity({ id: 'p2' }),
      entity({ id: 'child', parentId: 'p1' }),
    ]));
    const p2 = root.children.find((c) => c.children.length === 0)!;
    renderer.sync(frame([
      entity({ id: 'p1' }), entity({ id: 'p2' }),
      entity({ id: 'child', parentId: 'p2' }),
    ]));
    expect(p2.children).toHaveLength(1);
  });
});

describe('WorldFrameRenderer — honest boundary (NOT_MODELED grounding)', () => {
  it('uses the built-in placeholder, never the caller\'s resolver, for a NOT_MODELED entity', () => {
    const root = new THREE.Group();
    const resolveVisual = vi.fn((): EntityVisualSpec => ({ kind: 'object', object: new THREE.Mesh() }));
    const renderer = new WorldFrameRenderer(THREE, root, { resolveVisual });
    renderer.sync(frame([entity({ id: 'unknown-depth', grounding: 'NOT_MODELED' })]));
    expect(resolveVisual).not.toHaveBeenCalled();
    expect(root.children).toHaveLength(1);
  });

  it('never calls updateVisual on a placeholder entity', () => {
    const root = new THREE.Group();
    const updateVisual = vi.fn();
    const renderer = new WorldFrameRenderer(THREE, root, { updateVisual });
    renderer.sync(frame([entity({ id: 'a', grounding: 'NOT_MODELED' })]));
    expect(updateVisual).not.toHaveBeenCalled();
  });

  it('honors a caller-supplied placeholder resolver', () => {
    const root = new THREE.Group();
    const marker = new THREE.Group();
    marker.name = 'my-custom-boundary';
    const renderer = new WorldFrameRenderer(THREE, root, { resolveBoundaryPlaceholder: () => marker });
    renderer.sync(frame([entity({ id: 'a', grounding: 'NOT_MODELED' })]));
    expect(root.children[0]).toBe(marker);
  });
});

describe('WorldFrameRenderer — updateVisual hook', () => {
  it('calls updateVisual on the very first sync (state is correct from frame one)', () => {
    const root = new THREE.Group();
    const updateVisual = vi.fn();
    const renderer = new WorldFrameRenderer(THREE, root, { updateVisual });
    renderer.sync(frame([entity({ id: 'a', scalars: { temperature: 90 } })]));
    expect(updateVisual).toHaveBeenCalledOnce();
    expect(updateVisual.mock.calls[0]![0].scalars).toEqual({ temperature: 90 });
  });

  it('calls updateVisual again on subsequent syncs with the updated entity', () => {
    const root = new THREE.Group();
    const updateVisual = vi.fn();
    const renderer = new WorldFrameRenderer(THREE, root, { updateVisual });
    renderer.sync(frame([entity({ id: 'a', scalars: { risk: 0.1 } })]));
    renderer.sync(frame([entity({ id: 'a', scalars: { risk: 0.9 } })]));
    expect(updateVisual).toHaveBeenCalledTimes(2);
    expect(updateVisual.mock.calls[1]![0].scalars).toEqual({ risk: 0.9 });
  });
});

describe('WorldFrameRenderer — instanced-kind large populations', () => {
  function instancedResolver(): EntityVisualSpec {
    return {
      kind: 'instanced', batchKey: 'crowd',
      geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshStandardMaterial(),
    };
  }

  it('combines every entity sharing a batchKey into exactly one InstancedMesh', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, { resolveVisual: instancedResolver });
    renderer.sync(frame([entity({ id: '1' }), entity({ id: '2' }), entity({ id: '3' })]));
    const meshes = root.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.count).toBe(3);
  });

  it('rebuilds the batch (disposing the old one) when the population changes', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, { resolveVisual: instancedResolver });
    renderer.sync(frame([entity({ id: '1' }), entity({ id: '2' })]));
    const firstMesh = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const disposeSpy = vi.spyOn(firstMesh.geometry, 'dispose');
    renderer.sync(frame([entity({ id: '1' }), entity({ id: '2' }), entity({ id: '3' })]));
    expect(disposeSpy).toHaveBeenCalledOnce();
    const meshes = root.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.count).toBe(3);
  });

  it('tears the batch down entirely once its population drops to zero', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, { resolveVisual: instancedResolver });
    renderer.sync(frame([entity({ id: '1' })]));
    renderer.sync(frame([]));
    const meshes = root.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(meshes).toHaveLength(0);
  });

  it('positions each instance at its own entity\'s position', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, { resolveVisual: instancedResolver });
    renderer.sync(frame([entity({ id: '1', position: [1, 0, 0] }), entity({ id: '2', position: [2, 0, 0] })]));
    const mesh = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    mesh.getMatrixAt(0, matrix);
    matrix.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    expect(position.toArray()).toEqual([1, 0, 0]);
  });
});

describe('WorldFrameRenderer — default visual (no resolver supplied)', () => {
  it('produces a working mesh sized by the entity\'s own scale', () => {
    const root = new THREE.Group();
    const renderer = new WorldFrameRenderer(THREE, root);
    renderer.sync(frame([entity({ id: 'a', scale: 4 })]));
    const mesh = root.children[0] as THREE.Mesh;
    expect(mesh.isMesh).toBe(true);
    const geometry = mesh.geometry as THREE.SphereGeometry;
    expect(geometry.parameters.radius).toBeCloseTo(2); // 0.5 * scale
  });
});

describe('WorldFrameRenderer — dispose', () => {
  it('disposes every tracked object AND every instanced batch, clearing the scene', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: (e) => (e.id.startsWith('crowd') ? {
        kind: 'instanced', batchKey: 'crowd', geometry: new THREE.BoxGeometry(), material: new THREE.MeshStandardMaterial(),
      } : { kind: 'object', object: new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()) }),
    });
    renderer.sync(frame([entity({ id: 'solo' }), entity({ id: 'crowd-1' }), entity({ id: 'crowd-2' })]));
    expect(root.children.length).toBeGreaterThan(0);
    renderer.dispose();
    expect(root.children).toHaveLength(0);
  });
});
