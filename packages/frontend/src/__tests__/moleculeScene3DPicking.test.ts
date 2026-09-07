import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { MoleculeScene3D, type SelectedAtomInfo } from '../core/three/moleculeScene3D';
import type { MoleculeGeometrySource, MoleculeMaterialisation } from '../core/worldModel/domains/molecularStructure';

/**
 * GENESIS WORLD INTERACTION — clickable atoms + optional camera follow, using the SAME injected-
 * fixture-source technique `moleculeScene3DWiring.test.ts` already established (a real benzene
 * topology, not a live network call), so picking is exercised against real, known atom positions.
 */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {}, fill: () => {},
    roundRect: (() => {}) as unknown as CanvasRenderingContext2D['roundRect'],
    measureText: () => ({ width: 40 }) as TextMetrics,
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
    createImageData: ((w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' })) as unknown as CanvasRenderingContext2D['createImageData'],
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  const fakeImage = { addEventListener: () => {}, removeEventListener: () => {}, set src(_v: string) {} };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };
});

const BENZENE_BONDS = [
  { a: 0, b: 1, order: 1.5, aromatic: 1 },
  { a: 1, b: 2, order: 1.5, aromatic: 1 },
  { a: 2, b: 3, order: 1.5, aromatic: 1 },
  { a: 3, b: 4, order: 1.5, aromatic: 1 },
  { a: 4, b: 5, order: 1.5, aromatic: 1 },
  { a: 5, b: 0, order: 1.5, aromatic: 1 },
  { a: 0, b: 6, order: 1, aromatic: 0 },
  { a: 1, b: 7, order: 1, aromatic: 0 },
];

function benzene(): MoleculeMaterialisation {
  return {
    atoms: Array.from({ length: 8 }, (_, i) => ({ element: i < 6 ? 'C' : 'H', x: i * 1.4, y: 0.3, z: -0.2 })),
    bonds: BENZENE_BONDS,
    forceField: 'MMFF',
    seed: 42,
    nAtoms: 8,
    formalCharge: 0,
    canonicalSmiles: 'c1ccccc1',
  };
}

function sourceOf(data: MoleculeMaterialisation): MoleculeGeometrySource {
  return async () => ({ ok: true, data });
}

const WIDTH = 400;
const HEIGHT = 300;

async function buildScene() {
  const sim = new MoleculeScene3D({ geometrySource: sourceOf(benzene()) });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 500);
  sim.init(THREE, scene, camera, WIDTH, HEIGHT);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  sim.syncScene(scene, camera);
  scene.updateMatrixWorld(true);
  return { sim, scene, camera };
}

/** Screen-space (pixel, y-down) position of an already-rendered atom mesh, the exact input
 * `sim.pointer()` expects — the same projection `screenToNDC`/`raycastFromScreenPoint` invert. */
function screenPointOf(object: THREE.Object3D, camera: THREE.PerspectiveCamera): { x: number; y: number } {
  const world = new THREE.Vector3();
  object.getWorldPosition(world);
  const ndc = world.clone().project(camera);
  return { x: ((ndc.x + 1) / 2) * WIDTH, y: ((1 - ndc.y) / 2) * HEIGHT };
}

function firstAtomMesh(scene: THREE.Scene, namePrefix = 'genesis-molecule-atom-'): THREE.Object3D {
  let found: THREE.Object3D | null = null;
  scene.traverse((n) => { if (!found && n.name.startsWith(namePrefix)) found = n; });
  if (!found) throw new Error('no atom mesh found in scene');
  return found;
}

function click(sim: MoleculeScene3D, point: { x: number; y: number }): void {
  sim.pointer(point.x, point.y, 'down');
  sim.pointer(point.x, point.y, 'up');
}

describe('MoleculeScene3D — clickable atoms (GENESIS WORLD INTERACTION)', () => {
  it('clicking a real atom mesh reports its real element and REAL (not NOT_MODELLED) grounding', async () => {
    const { sim, scene, camera } = await buildScene();
    const atom = firstAtomMesh(scene, 'genesis-molecule-atom-c');
    let selected: SelectedAtomInfo | null | undefined;
    sim.onAtomSelected = (info) => { selected = info; };
    click(sim, screenPointOf(atom, camera));
    expect(selected).toBeTruthy();
    expect(selected!.element).toBe('c');
    expect(selected!.notModeled).toBe(false);
  });

  it('clicking empty space reports an honest null selection, never a guessed one', async () => {
    const { sim } = await buildScene();
    let calls = 0;
    let lastValue: SelectedAtomInfo | null = { entityId: 'x', element: 'x', notModeled: false };
    sim.onAtomSelected = (info) => { calls++; lastValue = info; };
    // Far outside any real geometry — nothing pickable sits at this screen point.
    click(sim, { x: -500, y: -500 });
    expect(calls).toBe(1);
    expect(lastValue).toBeNull();
  });

  it('a drag (pointer moves past the click threshold) never fires a selection', async () => {
    const { sim, scene, camera } = await buildScene();
    const atom = firstAtomMesh(scene);
    const point = screenPointOf(atom, camera);
    let calls = 0;
    sim.onAtomSelected = () => { calls++; };
    sim.pointer(point.x, point.y, 'down');
    sim.pointer(point.x + 40, point.y + 40, 'move');
    sim.pointer(point.x + 40, point.y + 40, 'up');
    expect(calls).toBe(0);
  });

  it('getOrbitTarget/getOrbitFocusDistance stay null with nothing selected, even if follow is on', async () => {
    const { sim } = await buildScene();
    sim.setFollowSelected(true);
    expect(sim.getOrbitTarget()).toBeNull();
    expect(sim.getOrbitFocusDistance()).toBeNull();
  });

  it('after selecting an atom and enabling follow, getOrbitTarget returns its real world position (the existing OrbitControls target/distance seam, no new camera system)', async () => {
    const { sim, scene, camera } = await buildScene();
    const atom = firstAtomMesh(scene);
    click(sim, screenPointOf(atom, camera));
    sim.setFollowSelected(true);
    const world = new THREE.Vector3();
    atom.getWorldPosition(world);
    const target = sim.getOrbitTarget();
    expect(target).not.toBeNull();
    expect(target!.distanceTo(world)).toBeLessThan(1e-4);
    expect(sim.getOrbitFocusDistance()).toBeGreaterThan(0);
  });

  it('follow turns off its effect once the selection is cleared (clicking empty space)', async () => {
    const { sim, scene, camera } = await buildScene();
    const atom = firstAtomMesh(scene);
    click(sim, screenPointOf(atom, camera));
    sim.setFollowSelected(true);
    expect(sim.getOrbitTarget()).not.toBeNull();
    click(sim, { x: -500, y: -500 });
    expect(sim.getOrbitTarget()).toBeNull();
  });

  it('dispose() tears down cleanly with an active selection/follow', async () => {
    const { sim, scene, camera } = await buildScene();
    click(sim, screenPointOf(firstAtomMesh(scene), camera));
    sim.setFollowSelected(true);
    expect(() => sim.dispose()).not.toThrow();
  });
});
