import { describe, expect, it, vi } from 'vitest';
import { disposeSceneResources, disposeMaterials } from '../core/three/graphics/lifecycle';
import type * as THREE_NS from 'three';

function fakeTexture() {
  return { isTexture: true, dispose: vi.fn() };
}

function fakeMaterial(overrides: Record<string, unknown> = {}) {
  return { isMaterial: true, dispose: vi.fn(), ...overrides };
}

function fakeGeometry() {
  return { dispose: vi.fn() };
}

function fakeMesh(opts: { geometry?: unknown; material?: unknown; children?: unknown[] } = {}) {
  const children = opts.children ?? [];
  const node: Record<string, unknown> = {
    geometry: opts.geometry,
    material: opts.material,
    children,
  };
  node.traverse = (callback: (n: unknown) => void) => {
    callback(node);
    for (const child of children) (child as { traverse: (cb: (n: unknown) => void) => void }).traverse(callback);
  };
  return node as unknown as THREE_NS.Object3D;
}

describe('disposeSceneResources', () => {
  it('disposes a single mesh\'s geometry and material', () => {
    const geometry = fakeGeometry();
    const material = fakeMaterial();
    const mesh = fakeMesh({ geometry, material });
    disposeSceneResources(mesh);
    expect(geometry.dispose).toHaveBeenCalledOnce();
    expect(material.dispose).toHaveBeenCalledOnce();
  });

  it('disposes every texture referenced by a material\'s own properties', () => {
    const map = fakeTexture();
    const normalMap = fakeTexture();
    const material = fakeMaterial({ map, normalMap, color: 'not-a-texture' });
    const mesh = fakeMesh({ geometry: fakeGeometry(), material });
    disposeSceneResources(mesh);
    expect(map.dispose).toHaveBeenCalledOnce();
    expect(normalMap.dispose).toHaveBeenCalledOnce();
  });

  it('disposes each material in a multi-material array', () => {
    const materialA = fakeMaterial();
    const materialB = fakeMaterial();
    const mesh = fakeMesh({ geometry: fakeGeometry(), material: [materialA, materialB] });
    disposeSceneResources(mesh);
    expect(materialA.dispose).toHaveBeenCalledOnce();
    expect(materialB.dispose).toHaveBeenCalledOnce();
  });

  it('recurses into children, disposing the whole subtree', () => {
    const childGeometry = fakeGeometry();
    const childMaterial = fakeMaterial();
    const child = fakeMesh({ geometry: childGeometry, material: childMaterial });
    const root = fakeMesh({ geometry: fakeGeometry(), material: fakeMaterial(), children: [child] });
    disposeSceneResources(root);
    expect(childGeometry.dispose).toHaveBeenCalledOnce();
    expect(childMaterial.dispose).toHaveBeenCalledOnce();
  });

  it('skips nodes with no geometry/material (e.g. a plain THREE.Group) without throwing', () => {
    const group = fakeMesh({});
    expect(() => disposeSceneResources(group)).not.toThrow();
  });

  it('never disposes a material listed in excludeMaterials — for a shared/registry-owned material', () => {
    const sharedMaterial = fakeMaterial();
    const mesh = fakeMesh({ geometry: fakeGeometry(), material: sharedMaterial });
    disposeSceneResources(mesh, { excludeMaterials: [sharedMaterial as unknown as THREE_NS.Material] });
    expect(sharedMaterial.dispose).not.toHaveBeenCalled();
  });

  it('never disposes a texture listed in excludeTextures even when its material is disposed', () => {
    const sharedTexture = fakeTexture();
    const material = fakeMaterial({ map: sharedTexture });
    const mesh = fakeMesh({ geometry: fakeGeometry(), material });
    disposeSceneResources(mesh, { excludeTextures: [sharedTexture as unknown as THREE_NS.Texture] });
    expect(material.dispose).toHaveBeenCalledOnce();
    expect(sharedTexture.dispose).not.toHaveBeenCalled();
  });

  it('is idempotent — calling twice on the same subtree is safe (matches three.js dispose() semantics)', () => {
    const geometry = fakeGeometry();
    const material = fakeMaterial();
    const mesh = fakeMesh({ geometry, material });
    disposeSceneResources(mesh);
    expect(() => disposeSceneResources(mesh)).not.toThrow();
    expect(geometry.dispose).toHaveBeenCalledTimes(2);
  });

  it('ignores a value on a material property that is not texture-shaped', () => {
    const material = fakeMaterial({ opacity: 1, side: 2, someObject: { notATexture: true } });
    const mesh = fakeMesh({ geometry: fakeGeometry(), material });
    expect(() => disposeSceneResources(mesh)).not.toThrow();
  });
});

describe('disposeMaterials', () => {
  it('disposes every material in the bag, not just some of them', () => {
    const registry = { a: fakeMaterial(), b: fakeMaterial(), c: fakeMaterial() };
    disposeMaterials(Object.values(registry) as unknown as THREE_NS.Material[]);
    expect(registry.a.dispose).toHaveBeenCalledOnce();
    expect(registry.b.dispose).toHaveBeenCalledOnce();
    expect(registry.c.dispose).toHaveBeenCalledOnce();
  });

  it('also disposes each material\'s own loaded textures — the exact bug found in highFidelitySlice3D.ts', () => {
    const map = fakeTexture();
    const normalMap = fakeTexture();
    const roughnessMap = fakeTexture();
    const aoMap = fakeTexture();
    const asphalt = fakeMaterial({ map, normalMap, roughnessMap, aoMap });
    disposeMaterials([asphalt as unknown as THREE_NS.Material]);
    expect(map.dispose).toHaveBeenCalledOnce();
    expect(normalMap.dispose).toHaveBeenCalledOnce();
    expect(roughnessMap.dispose).toHaveBeenCalledOnce();
    expect(aoMap.dispose).toHaveBeenCalledOnce();
  });

  it('never disposes a texture listed in excludeTextures', () => {
    const shared = fakeTexture();
    const material = fakeMaterial({ map: shared });
    disposeMaterials([material as unknown as THREE_NS.Material], [shared as unknown as THREE_NS.Texture]);
    expect(material.dispose).toHaveBeenCalledOnce();
    expect(shared.dispose).not.toHaveBeenCalled();
  });
});
