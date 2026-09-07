import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { MoleculeScene3D } from '../core/three/moleculeScene3D';
import { MOLECULE_STATE_CODE, type MoleculeGeometrySource, type MoleculeMaterialisation } from '../core/worldModel/domains/molecularStructure';

/**
 * GRAPHICS V3, item 1 — end-to-end proof that the missing scene/world orchestration
 * (`moleculeScene3D.ts`) actually turns real RDKit atom+bond data into a real rendered scene, using
 * the SAME injected-fixture-source technique `worldModelBondsChannel.test.ts` uses to test C3's own
 * side of this channel — a real benzene topology (8 atoms, 8 bonds: 6 aromatic ring + 2 C-H single),
 * not a live network call.
 *
 * `document`/canvas stubbing matches every other `Sim3D.init()` test in this codebase —
 * `sceneEnvironment.ts`'s lighting setup touches `document.createElement('canvas')` indirectly via
 * shared material/texture factories even with `groundSize: 0`.
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

function benzene(bonds: typeof BENZENE_BONDS = BENZENE_BONDS): MoleculeMaterialisation {
  return {
    atoms: Array.from({ length: 8 }, (_, i) => ({ element: i < 6 ? 'C' : 'H', x: i * 1.4, y: 0.3, z: -0.2 })),
    bonds,
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

function blockedSource(reason = 'capability_unavailable'): MoleculeGeometrySource {
  return async () => ({ ok: false, reason });
}

async function buildInitializedScene(geometrySource: MoleculeGeometrySource) {
  const sim = new MoleculeScene3D({ geometrySource });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  // Let the fire-and-forget materialisation promise (and its .then chain) actually settle before
  // the test drives syncScene — real async work, not a timer race.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { sim, scene, camera };
}

describe('MoleculeScene3D — real atom+bond rendering wiring (GRAPHICS V3 item 1)', () => {
  it('before materialisation resolves, no atom/bond geometry exists yet (honest, not a fabricated interim)', () => {
    const sim = new MoleculeScene3D({ geometrySource: sourceOf(benzene()) });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    sim.init(THREE, scene, camera, 400, 300);
    sim.syncScene(scene, camera);
    let atomSpheres = 0;
    scene.traverse((n) => { if (n.name.startsWith('genesis-molecule-atom-')) atomSpheres++; });
    expect(atomSpheres).toBe(0);
    expect(sim.getStats().materialising).toBe(1);
  });

  it('once real RDKit atoms+bonds materialise, the scene renders exactly 8 real atom spheres and 8 real bonds (6 aromatic + 2 single)', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene()));
    sim.syncScene(scene, camera);

    const stats = sim.getStats();
    expect(stats.moleculeStateCode).toBe(MOLECULE_STATE_CODE.MATERIALISED);
    expect(stats.atomsMaterialised).toBe(8);
    expect(stats.bondsMaterialised).toBe(8);
    expect(stats.materialising).toBe(0);
    expect(stats.materialiseBlocked).toBe(0);

    let atomSpheres = 0;
    let carbonAtoms = 0;
    let hydrogenAtoms = 0;
    scene.traverse((n) => {
      if (n.name.startsWith('genesis-molecule-atom-')) {
        atomSpheres++;
        if (n.name === 'genesis-molecule-atom-c') carbonAtoms++;
        if (n.name === 'genesis-molecule-atom-h') hydrogenAtoms++;
      }
    });
    expect(atomSpheres).toBe(8);
    expect(carbonAtoms).toBe(6);
    expect(hydrogenAtoms).toBe(2);

    const bondsGroup = scene.getObjectByName('genesis-molecule-bonds')!;
    expect(bondsGroup.children).toHaveLength(8); // one Group per bond (one per real RDKit bond)
    // Real distinction between the 6 aromatic ring bonds and the 2 single C-H bonds: which
    // material each bond's one cylinder strand actually uses (createBond's own aromatic branch),
    // not a strand count — both render as ONE cylinder (see graphicsMoleculeKit.test.ts).
    let aromaticCount = 0;
    let singleCount = 0;
    for (const bondGroup of bondsGroup.children) {
      const strand = bondGroup.children[0] as THREE.Mesh;
      const material = strand.material as THREE.MeshStandardMaterial;
      // Distinguish by the emissive COLOR, not `emissiveIntensity` — MeshStandardMaterial defaults
      // `emissiveIntensity` to 1 on EVERY material regardless of emissive color, so only a real
      // non-black emissive color (aromaticMaterial's `0x1a4a5c`) actually distinguishes it from the
      // plain single-bond material (whose emissive stays the THREE default of black).
      if (material.emissive.getHex() > 0) aromaticCount++;
      else singleCount++;
    }
    expect(aromaticCount).toBe(6);
    expect(singleCount).toBe(2);
  });

  it('a bond genuinely renders as ONE real cylinder run whose endpoints are the two real bonded atoms\' world positions', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene()));
    sim.syncScene(scene, camera);
    const bondsGroup = scene.getObjectByName('genesis-molecule-bonds')!;
    const firstBond = bondsGroup.children[0] as THREE.Group;
    const strand = firstBond.children[0] as THREE.Mesh;
    expect(strand.geometry).toBeInstanceOf(THREE.CylinderGeometry);
  });

  it('a molecule the engine returns zero bonds for renders atoms with NO sticks — honest, never guessed from distance', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene([])));
    sim.syncScene(scene, camera);
    expect(sim.getStats().atomsMaterialised).toBe(8);
    expect(sim.getStats().bondsMaterialised).toBe(0);
    const bondsGroup = scene.getObjectByName('genesis-molecule-bonds')!;
    expect(bondsGroup.children).toHaveLength(0);
  });

  it('a real "capability_unavailable" refusal (this sandbox\'s own actual RDKit-missing case) renders NO atoms and reports the honest blocked state', async () => {
    const { sim, scene, camera } = await buildInitializedScene(blockedSource('capability_unavailable'));
    sim.syncScene(scene, camera);
    const stats = sim.getStats();
    expect(stats.moleculeStateCode).toBe(MOLECULE_STATE_CODE.MATERIALISATION_BLOCKED);
    expect(stats.materialiseBlocked).toBe(1);
    expect(stats.atomsMaterialised).toBe(0);
    expect(sim.describeState()).toContain('capability_unavailable');
    let atomSpheres = 0;
    scene.traverse((n) => { if (n.name.startsWith('genesis-molecule-atom-')) atomSpheres++; });
    expect(atomSpheres).toBe(0);
  });

  it('bonds are rebuilt only when bondsMaterialised actually changes, not every syncScene call', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene()));
    sim.syncScene(scene, camera);
    const bondsGroup = scene.getObjectByName('genesis-molecule-bonds')!;
    const firstBondObject = bondsGroup.children[0];
    sim.syncScene(scene, camera);
    sim.syncScene(scene, camera);
    expect(bondsGroup.children[0]).toBe(firstBondObject);
  });

  it('dispose() tears down without throwing', async () => {
    const { sim } = await buildInitializedScene(sourceOf(benzene()));
    expect(() => sim.dispose()).not.toThrow();
  });
});

describe('MoleculeScene3D — GRAPHICS V5 visual polish (hero lighting + real camera auto-frame)', () => {
  it('composes real HERO (KEY+RIM) and BACKGROUND lights, aimed at the molecule\'s own local origin', () => {
    const sim = new MoleculeScene3D({ geometrySource: sourceOf(benzene()) });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    sim.init(THREE, scene, camera, 400, 300);
    let spot = 0; let point = 0; let hemisphere = 0;
    scene.traverse((n) => {
      if (n instanceof THREE.SpotLight) spot++;
      if (n instanceof THREE.PointLight) point++;
      if (n instanceof THREE.HemisphereLight) hemisphere++;
    });
    // HERO = one SpotLight (KEY) + one PointLight (RIM); BACKGROUND = one HemisphereLight.
    expect(spot).toBe(1);
    expect(point).toBe(1);
    expect(hemisphere).toBe(1);
  });

  it('once real atom positions are known, the camera does a one-time real reframe scaled to the ACTUAL molecule extent', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene()));
    sim.syncScene(scene, camera);
    // Real benzene fixture: atom 7 (the far H) sits at x=7*1.4=9.8, y=0.3, z=-0.2 (Å, 1:1 world
    // units per molecularStructure.ts's DEFAULT_ANGSTROM_PER_WORLD_UNIT) — the real farthest atom
    // from local origin, so the real bounding radius (+0.6 CPK/bond padding) is derivable exactly.
    const realRadius = Math.sqrt(9.8 ** 2 + 0.3 ** 2 + 0.2 ** 2) + 0.6;
    const expectedFocusDistance = Math.max(3, realRadius * 2.2);
    expect(camera.position.length()).toBeCloseTo(expectedFocusDistance, 3);
  });

  it('a molecule with NO real atoms yet (still materialising) never reframes the camera off its initial shot', () => {
    const sim = new MoleculeScene3D({ geometrySource: sourceOf(benzene()) });
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    sim.init(THREE, scene, camera, 400, 300);
    const initialPosition = camera.position.clone();
    sim.syncScene(scene, camera);
    expect(camera.position.equals(initialPosition)).toBe(true);
  });

  it('the reframe preserves the camera\'s current viewing DIRECTION (only distance changes)', async () => {
    const { sim, scene, camera } = await buildInitializedScene(sourceOf(benzene()));
    const directionBefore = camera.position.clone().normalize();
    sim.syncScene(scene, camera);
    const directionAfter = camera.position.clone().normalize();
    expect(directionAfter.x).toBeCloseTo(directionBefore.x, 5);
    expect(directionAfter.y).toBeCloseTo(directionBefore.y, 5);
    expect(directionAfter.z).toBeCloseTo(directionBefore.z, 5);
  });

  it('dispose() removes the HERO/BACKGROUND lights from the scene, not just bookkeeping', async () => {
    const { sim, scene } = await buildInitializedScene(sourceOf(benzene()));
    sim.dispose();
    let lights = 0;
    scene.traverse((n) => { if ((n as THREE.Light).isLight) lights++; });
    expect(lights).toBe(0);
  });
});
