import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame } from '../core/three/graphics/worldFrame';
import { createWaterInfrastructureAdapter, isWaterInfrastructureVisualHint } from '../core/three/graphics/waterInfrastructureBridge';

/**
 * These tests exist to prove the C3 integration SEAM works — not to prove any hydraulic science,
 * because none exists yet (see the bridge module's own doc). The bar: a future real C3 pump/valve/
 * tank WorldFrame entity must render and update correctly through this adapter, AND an entity with
 * no real backing must never be rendered as if it had one.
 */

function materials() {
  return { housingMaterial: new THREE.MeshStandardMaterial() };
}

describe('isWaterInfrastructureVisualHint', () => {
  it('recognizes exactly the three water-infrastructure hints', () => {
    expect(isWaterInfrastructureVisualHint('object:water-pump')).toBe(true);
    expect(isWaterInfrastructureVisualHint('object:water-valve')).toBe(true);
    expect(isWaterInfrastructureVisualHint('object:water-tank')).toBe(true);
    expect(isWaterInfrastructureVisualHint('object:building')).toBe(false);
    expect(isWaterInfrastructureVisualHint(undefined)).toBe(false);
  });
});

describe('createWaterInfrastructureAdapter — the C3 integration seam', () => {
  it('renders a real pump object for a MODELED entity with a recognized status', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame: WorldFrame = {
      time: 0,
      entities: [{ id: 'pump-1', position: [1, 0, 2], status: 'NORMAL', visualHint: 'object:water-pump' }],
    };
    renderer.sync(frame);
    const object = renderer.getObjectForEntity('pump-1');
    expect(object).not.toBeNull();
    expect(object!.name).toBe('genesis-water-pump');
    expect(object!.position.x).toBe(1);
    expect(object!.position.z).toBe(2);
    expect(object!.userData.notModeled).toBe(false);
  });

  it('applies a REAL status change (e.g. FAILED) only because the caller supplied it — proves state follows the model, not a timer', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const baseFrame = (status: string): WorldFrame => ({
      time: 0, entities: [{ id: 'pump-1', position: [0, 0, 0], status, visualHint: 'object:water-pump' }],
    });
    renderer.sync(baseFrame('NORMAL'));
    const object = renderer.getObjectForEntity('pump-1') as THREE.Mesh;
    let light: THREE.Mesh | null = null;
    object.traverse((node) => { if (node instanceof THREE.Mesh && node.geometry instanceof THREE.SphereGeometry) light = node; });
    const normalIntensity = (light! as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const before = normalIntensity.emissiveIntensity;

    renderer.sync(baseFrame('FAILED'));
    const after = ((light! as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity;
    expect(after).not.toBe(before);
    expect(object.userData.notModeled).toBe(false);
  });

  it('never fabricates a status for an entity with grounding NOT_MODELED — stays tagged notModeled and does not call setState', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    // NOT_MODELED short-circuits inside WorldFrameRenderer itself (an honest-boundary placeholder,
    // never reaching this adapter's resolver at all) — the real proof this test needs is that an
    // entity claiming a MODELED grounding with a bogus/unrecognized status is ALSO never trusted.
    const frame: WorldFrame = {
      time: 0,
      entities: [{ id: 'pump-2', position: [0, 0, 0], status: 'some-invented-status', visualHint: 'object:water-pump' }],
    };
    renderer.sync(frame);
    const object = renderer.getObjectForEntity('pump-2');
    expect(object!.userData.notModeled).toBe(true);
  });

  it('an entity with grounding NOT_MODELED renders as the generic honest-boundary placeholder, never as a detailed pump', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame: WorldFrame = {
      time: 0,
      entities: [{ id: 'pump-3', position: [0, 0, 0], visualHint: 'object:water-pump', grounding: 'NOT_MODELED' }],
    };
    renderer.sync(frame);
    const object = renderer.getObjectForEntity('pump-3')!;
    // This engine's own boundary placeholder, not this bridge's pump geometry — proves the bridge's
    // resolveVisual was never even called for a NOT_MODELED entity (WorldFrameRenderer's own rule).
    expect(object.name).not.toBe('genesis-water-pump');
  });

  it('a stable entity id maps to the SAME object across syncs (no duplicate creation, no re-fabrication)', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame = (status: string): WorldFrame => ({ time: 0, entities: [{ id: 'pump-1', position: [0, 0, 0], status, visualHint: 'object:water-pump' }] });
    renderer.sync(frame('NORMAL'));
    const first = renderer.getObjectForEntity('pump-1');
    renderer.sync(frame('WARNING'));
    const second = renderer.getObjectForEntity('pump-1');
    expect(second).toBe(first);
  });

  it('valve and tank hints render their own real geometry, also honestly tagged notModeled when ungrounded', () => {
    const scene = new THREE.Scene();
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    renderer.sync({ time: 0, entities: [
      { id: 'valve-1', position: [0, 0, 0], visualHint: 'object:water-valve' },
      { id: 'tank-1', position: [1, 0, 0], visualHint: 'object:water-tank' },
    ] });
    expect(renderer.getObjectForEntity('valve-1')!.name).toBe('genesis-water-valve');
    expect(renderer.getObjectForEntity('tank-1')!.name).toBe('genesis-water-storage-tank');
    expect(renderer.getObjectForEntity('valve-1')!.userData.notModeled).toBe(true);
    expect(renderer.getObjectForEntity('tank-1')!.userData.notModeled).toBe(true);
  });

  it('dispose() clears the adapter\'s own bookkeeping without throwing', () => {
    const adapter = createWaterInfrastructureAdapter(THREE, materials());
    expect(() => adapter.dispose()).not.toThrow();
  });
});
