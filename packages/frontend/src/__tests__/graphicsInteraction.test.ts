import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity } from '../core/three/graphics/worldFrame';
import { InteractionController, applyHighlight, clearHighlight } from '../core/three/graphics/interaction';

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

describe('WorldFrameRenderer.getObjectForEntity', () => {
  it('returns the tracked Object3D for a live object-kind entity', () => {
    const root = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: () => ({ kind: 'object', object: new THREE.Mesh(new THREE.BoxGeometry()) }),
    });
    renderer.sync({ time: 0, entities: [{ id: 'a', position: [0, 0, 0] }] });
    const object = renderer.getObjectForEntity('a');
    expect(object).not.toBeNull();
    expect(root.children).toContain(object);
  });

  it('returns null for an unknown id and for an instanced-kind entity', () => {
    const root = new THREE.Scene();
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshStandardMaterial();
    const renderer = new WorldFrameRenderer(THREE, root, {
      resolveVisual: () => ({ kind: 'instanced', batchKey: 'crowd', geometry, material }),
    });
    renderer.sync({ time: 0, entities: [{ id: 'crowd-1', position: [0, 0, 0] }] });
    expect(renderer.getObjectForEntity('crowd-1')).toBeNull();
    expect(renderer.getObjectForEntity('nonexistent')).toBeNull();
  });
});

describe('applyHighlight / clearHighlight', () => {
  it('boosts emissive on every emissive-capable material in the subtree', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x000000, emissiveIntensity: 0 }));
    group.add(mesh);
    applyHighlight(THREE, group, 'hover');
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBeGreaterThan(0);
    expect(material.emissive.getHex()).not.toBe(0x000000);
  });

  it('select highlights stronger than hover', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x000000, emissiveIntensity: 0 }));
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x000000, emissiveIntensity: 0 }));
    applyHighlight(THREE, meshA, 'hover');
    applyHighlight(THREE, meshB, 'select');
    expect((meshB.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan((meshA.material as THREE.MeshStandardMaterial).emissiveIntensity);
  });

  it('clearHighlight restores the exact original emissive/intensity', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x224466, emissiveIntensity: 0.15 }));
    applyHighlight(THREE, mesh, 'select');
    clearHighlight(mesh);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).toBe(new THREE.Color(0x224466).getHex());
    expect(material.emissiveIntensity).toBeCloseTo(0.15);
  });

  it('re-applying (hover promoted to select) does not compound against an already-highlighted baseline', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x111111, emissiveIntensity: 0.1 }));
    applyHighlight(THREE, mesh, 'hover');
    applyHighlight(THREE, mesh, 'select');
    clearHighlight(mesh);
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).toBe(new THREE.Color(0x111111).getHex());
    expect(material.emissiveIntensity).toBeCloseTo(0.1);
  });

  it('skips a material with no emissive channel without throwing', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    expect(() => applyHighlight(THREE, mesh, 'hover')).not.toThrow();
    expect(() => clearHighlight(mesh)).not.toThrow();
  });

  it('clearHighlight on a never-highlighted object is a safe no-op', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ emissive: 0x333333, emissiveIntensity: 0.2 }));
    expect(() => clearHighlight(mesh)).not.toThrow();
    const material = mesh.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).toBe(new THREE.Color(0x333333).getHex());
  });
});
