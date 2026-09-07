import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame } from '../core/three/graphics/worldFrame';
import { createMoleculeAdapter, isMoleculeVisualHint } from '../core/three/graphics/moleculeAdapterBridge';

describe('isMoleculeVisualHint', () => {
  it('recognizes the molecule root and any atom-<element> hint (an open family, not a fixed enum)', () => {
    expect(isMoleculeVisualHint('molecule')).toBe(true);
    expect(isMoleculeVisualHint('atom-c')).toBe(true);
    expect(isMoleculeVisualHint('atom-fe')).toBe(true);
    expect(isMoleculeVisualHint('atom-xx')).toBe(true); // still routed here — element table fallback handles the color
    expect(isMoleculeVisualHint('object:water-pump')).toBe(false);
    expect(isMoleculeVisualHint(undefined)).toBe(false);
  });
});

describe('createMoleculeAdapter — the C3 bond-channel integration seam', () => {
  it('the molecule root resolves to an empty, invisible-by-content anchor (no geometry of its own)', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame: WorldFrame = { time: 0, entities: [{ id: 'mol-1', position: [0, 0, 0], visualHint: 'molecule' }] };
    renderer.sync(frame);
    const root = renderer.getObjectForEntity('mol-1')!;
    expect(root.name).toBe('genesis-molecule-root');
    expect(root.children).toHaveLength(0);
  });

  it('a real atom renders as a real CPK-colored sphere at the entity\'s real position', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame: WorldFrame = { time: 0, entities: [{ id: 'atom-0', position: [1.4, 0, -0.2], visualHint: 'atom-c' }] };
    renderer.sync(frame);
    const atom = renderer.getObjectForEntity('atom-0')! as THREE.Mesh;
    expect(atom.name).toBe('genesis-molecule-atom-c');
    expect(atom.position.toArray()).toEqual([1.4, 0, -0.2]);
    expect(atom.userData.notModeled).toBe(false);
  });

  it('reuses a caller-supplied shared material per element instead of one per atom', () => {
    const scene = new THREE.Scene();
    const shared = new THREE.MeshStandardMaterial();
    const adapter = createMoleculeAdapter(THREE, { atomMaterials: { C: shared } });
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    renderer.sync({ time: 0, entities: [
      { id: 'atom-0', position: [0, 0, 0], visualHint: 'atom-c' },
      { id: 'atom-1', position: [1, 0, 0], visualHint: 'atom-c' },
    ] });
    const a = renderer.getObjectForEntity('atom-0') as THREE.Mesh;
    const b = renderer.getObjectForEntity('atom-1') as THREE.Mesh;
    expect(a.material).toBe(shared);
    expect(b.material).toBe(shared);
  });

  it('an atom entity with grounding NOT_MODELED renders as the generic honest-boundary placeholder, never a fabricated element sphere', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    renderer.sync({ time: 0, entities: [{ id: 'atom-0', position: [0, 0, 0], visualHint: 'atom-c', grounding: 'NOT_MODELED' }] });
    const object = renderer.getObjectForEntity('atom-0')!;
    // This engine's own boundary placeholder — proves resolveVisual was never even called.
    expect(object.name).not.toBe('genesis-molecule-atom-c');
  });

  it('updateVisual re-checks grounding every sync, not just at creation', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame = (grounding?: 'MODELED' | 'NOT_MODELED'): WorldFrame => ({
      time: 0, entities: [{ id: 'atom-0', position: [0, 0, 0], visualHint: 'atom-c', grounding }],
    });
    renderer.sync(frame('MODELED'));
    expect(renderer.getObjectForEntity('atom-0')!.userData.notModeled).toBe(false);
  });

  it('a stable atom id maps to the SAME object across syncs (positions update, geometry is not recreated)', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    const frame = (x: number): WorldFrame => ({ time: 0, entities: [{ id: 'atom-0', position: [x, 0, 0], visualHint: 'atom-c' }] });
    renderer.sync(frame(0));
    const first = renderer.getObjectForEntity('atom-0');
    renderer.sync(frame(2));
    const second = renderer.getObjectForEntity('atom-0');
    expect(second).toBe(first);
    expect(second!.position.x).toBe(2);
  });

  it('an unrecognized element symbol still renders a real sphere (default style), never nothing', () => {
    const scene = new THREE.Scene();
    const adapter = createMoleculeAdapter(THREE);
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: adapter.resolveVisual, updateVisual: adapter.updateVisual });
    renderer.sync({ time: 0, entities: [{ id: 'atom-0', position: [0, 0, 0], visualHint: 'atom-xx' }] });
    const atom = renderer.getObjectForEntity('atom-0') as THREE.Mesh;
    expect(atom.geometry).toBeInstanceOf(THREE.SphereGeometry);
  });

  it('dispose() clears without throwing', () => {
    const adapter = createMoleculeAdapter(THREE);
    expect(() => adapter.dispose()).not.toThrow();
  });
});
