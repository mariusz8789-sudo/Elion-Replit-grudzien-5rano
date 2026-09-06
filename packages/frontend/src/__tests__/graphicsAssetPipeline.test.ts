import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { KeyedResourceCache, assignTextureSlot, createAssetSlot } from '../core/three/graphics/assetPipeline';

describe('KeyedResourceCache', () => {
  it('creates a value on first access and reuses it on later access with the same key', () => {
    const cache = new KeyedResourceCache<THREE.BoxGeometry>();
    const factory = vi.fn(() => new THREE.BoxGeometry());
    const a = cache.getOrCreate('trunk', factory);
    const b = cache.getOrCreate('trunk', factory);
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledOnce();
  });

  it('creates independent values for different keys', () => {
    const cache = new KeyedResourceCache<THREE.BoxGeometry>();
    const a = cache.getOrCreate('a', () => new THREE.BoxGeometry());
    const b = cache.getOrCreate('b', () => new THREE.BoxGeometry());
    expect(a).not.toBe(b);
    expect(cache.size).toBe(2);
  });

  it('has()/get() reflect cache contents without creating anything', () => {
    const cache = new KeyedResourceCache<number>();
    expect(cache.has('x')).toBe(false);
    expect(cache.get('x')).toBeUndefined();
    cache.getOrCreate('x', () => 42);
    expect(cache.has('x')).toBe(true);
    expect(cache.get('x')).toBe(42);
  });

  it('dispose() disposes every cached value via the given disposer and clears the cache', () => {
    const cache = new KeyedResourceCache<{ dispose: () => void }>();
    const disposeSpies = [vi.fn(), vi.fn()];
    cache.getOrCreate('a', () => ({ dispose: disposeSpies[0]! }));
    cache.getOrCreate('b', () => ({ dispose: disposeSpies[1]! }));
    cache.dispose((v) => v.dispose());
    expect(disposeSpies[0]).toHaveBeenCalledOnce();
    expect(disposeSpies[1]).toHaveBeenCalledOnce();
    expect(cache.size).toBe(0);
  });
});

describe('assignTextureSlot', () => {
  it('disposes the outgoing texture before assigning the new one', () => {
    const outgoing = new THREE.Texture();
    const disposeSpy = vi.spyOn(outgoing, 'dispose');
    const material = new THREE.MeshStandardMaterial({ map: outgoing });
    const incoming = new THREE.Texture();
    const versionBefore = material.version;
    assignTextureSlot(material as unknown as Record<string, unknown>, 'map', incoming);
    expect(disposeSpy).toHaveBeenCalledOnce();
    expect(material.map).toBe(incoming);
    // `needsUpdate` is a write-only setter in three.js (bumps `.version` internally, always reads
    // back `undefined`) — checking the version bump is the real, observable proof it was set.
    expect(material.version).toBeGreaterThan(versionBefore);
  });

  it('is a safe no-op-for-disposal when the slot was previously empty', () => {
    const material = new THREE.MeshStandardMaterial();
    const incoming = new THREE.Texture();
    expect(() => assignTextureSlot(material as unknown as Record<string, unknown>, 'map', incoming)).not.toThrow();
    expect(material.map).toBe(incoming);
  });
});

describe('createAssetSlot', () => {
  it('shows the fallback immediately as .current', () => {
    const fallback = new THREE.Mesh(new THREE.BoxGeometry());
    const slot = createAssetSlot(fallback);
    expect(slot.current).toBe(fallback);
  });

  it('replace() swaps in the real asset at the fallback\'s exact transform', () => {
    const fallback = new THREE.Mesh(new THREE.BoxGeometry());
    fallback.position.set(3, 1, -2);
    fallback.rotation.set(0, Math.PI / 4, 0);
    fallback.scale.set(2, 2, 2);
    const slot = createAssetSlot(fallback);
    const real = new THREE.Group();
    slot.replace(real);
    expect(slot.current).toBe(real);
    expect(real.position.toArray()).toEqual([3, 1, -2]);
    expect(real.rotation.y).toBeCloseTo(Math.PI / 4);
    expect(real.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('replace() reparents into the same slot the fallback occupied, and disposes the fallback', () => {
    const scene = new THREE.Scene();
    const fallback = new THREE.Mesh(new THREE.BoxGeometry());
    scene.add(fallback);
    const disposeSpy = vi.spyOn(fallback.geometry, 'dispose');
    const slot = createAssetSlot(fallback);
    const real = new THREE.Group();
    slot.replace(real);
    expect(scene.children).toContain(real);
    expect(scene.children).not.toContain(fallback);
    expect(disposeSpy).toHaveBeenCalledOnce();
  });

  it('dispose() removes and disposes whichever object is currently active', () => {
    const scene = new THREE.Scene();
    const fallback = new THREE.Mesh(new THREE.BoxGeometry());
    scene.add(fallback);
    const slot = createAssetSlot(fallback);
    const real = new THREE.Mesh(new THREE.SphereGeometry());
    slot.replace(real);
    const realDisposeSpy = vi.spyOn(real.geometry, 'dispose');
    slot.dispose();
    expect(scene.children).toHaveLength(0);
    expect(realDisposeSpy).toHaveBeenCalledOnce();
  });
});
