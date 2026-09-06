import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity } from '../core/three/graphics/worldFrame';
import { InteractionController } from '../core/three/graphics/interaction';

function entity(overrides: Partial<WorldFrameEntity> & { id: string }): WorldFrameEntity {
  return { position: [0, 0, 0], ...overrides };
}

function frame(entities: WorldFrameEntity[], time = 0): WorldFrame {
  return { time, entities };
}

describe('WorldFrameRenderer.resolveEntityId', () => {
  it('resolves an object-kind hit even when the raycast lands on a deeply-nested child mesh', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: (): EntityVisualSpec => {
        const group = new THREE.Group();
        const child = new THREE.Mesh(new THREE.BoxGeometry());
        group.add(child);
        return { kind: 'object', object: group };
      },
    });
    renderer.sync(frame([entity({ id: 'building-1' })]));
    const group = root.children[0]!;
    const leafMesh = group.children[0] as THREE.Mesh;
    const fakeIntersection = { object: leafMesh } as unknown as THREE.Intersection;
    expect(renderer.resolveEntityId(fakeIntersection)).toBe('building-1');
  });

  it('resolves an instanced hit via intersection.instanceId against the recorded entity order', () => {
    const root = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: () => ({ kind: 'instanced', batchKey: 'crowd', geometry, material }),
    });
    renderer.sync(frame([entity({ id: 'agent-A' }), entity({ id: 'agent-B' }), entity({ id: 'agent-C' })]));
    const mesh = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const hit = { object: mesh, instanceId: 1 } as unknown as THREE.Intersection;
    expect(renderer.resolveEntityId(hit)).toBe('agent-B');
  });

  it('returns null for a hit that belongs to neither an object nor a tracked instanced batch', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root);
    const untrackedMesh = new THREE.Mesh(new THREE.BoxGeometry());
    expect(renderer.resolveEntityId({ object: untrackedMesh } as unknown as THREE.Intersection)).toBeNull();
  });

  it('keeps resolving correctly after an incremental (non-rebuilt) instanced update', () => {
    const root = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: () => ({ kind: 'instanced', batchKey: 'crowd', geometry, material }),
    });
    renderer.sync(frame([entity({ id: 'agent-A' }), entity({ id: 'agent-B' })]));
    renderer.sync(frame([entity({ id: 'agent-A', position: [9, 0, 0] }), entity({ id: 'agent-B', position: [9, 0, 0] })]));
    const mesh = root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(renderer.resolveEntityId({ object: mesh, instanceId: 0 } as unknown as THREE.Intersection)).toBe('agent-A');
  });
});

describe('InteractionController', () => {
  function cameraLookingAt(target: THREE.Object3D): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(target.position);
    camera.updateMatrixWorld(true);
    return camera;
  }

  it('fires onHoverChange when the hovered entity changes, and not when it stays the same', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData.worldFrameEntityId = 'obj-1';
    scene.add(mesh);
    const camera = cameraLookingAt(mesh);
    const onHoverChange = vi.fn();
    const controller = new InteractionController(THREE, {
      camera,
      resolver: { resolveEntityId: (hit) => (hit.object.userData.worldFrameEntityId as string) ?? null },
      getTargets: () => [mesh],
      onHoverChange,
    });
    controller.pointerMove(50, 50, 100, 100); // center of viewport -> hits the box
    expect(onHoverChange).toHaveBeenCalledWith('obj-1');
    controller.pointerMove(51, 51, 100, 100); // still on the box
    expect(onHoverChange).toHaveBeenCalledTimes(1); // no redundant fire
    controller.pointerMove(0, 0, 100, 100); // top-left corner -> misses the box
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it('fires onSelect on a genuine click but not on a pointer-up that ends a drag', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.userData.worldFrameEntityId = 'obj-1';
    scene.add(mesh);
    const camera = cameraLookingAt(mesh);
    const onSelect = vi.fn();
    const controller = new InteractionController(THREE, {
      camera,
      resolver: { resolveEntityId: (hit) => (hit.object.userData.worldFrameEntityId as string) ?? null },
      getTargets: () => [mesh],
      onSelect,
    });

    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50, 100, 100);
    expect(onSelect).toHaveBeenCalledWith('obj-1');
    expect(controller.selected).toBe('obj-1');

    onSelect.mockClear();
    controller.pointerDown(50, 50);
    controller.pointerMove(80, 80, 100, 100); // far enough to count as a drag
    controller.pointerUp(80, 80, 100, 100);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects null when clicking empty space (a deselect signal)', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    const onSelect = vi.fn();
    const controller = new InteractionController(THREE, {
      camera,
      resolver: { resolveEntityId: () => 'unreachable' },
      getTargets: () => [], // nothing to hit
      onSelect,
    });
    controller.pointerDown(50, 50);
    controller.pointerUp(50, 50, 100, 100);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('clearHover fires onHoverChange(null) only when something was actually hovered', () => {
    const onHoverChange = vi.fn();
    const controller = new InteractionController(THREE, {
      camera: new THREE.PerspectiveCamera(),
      resolver: { resolveEntityId: () => null },
      getTargets: () => [],
      onHoverChange,
    });
    controller.clearHover();
    expect(onHoverChange).not.toHaveBeenCalled();
  });
});
