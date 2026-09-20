import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AgentLabScene3D } from '../core/three/agentLabScene3D';
import { createTwinProxy } from '../core/three/biologyLabKit';
import { evaluateHumanTwinAsset, type LoadedHumanTwinBody } from '../core/three/humanTwinAsset';

/**
 * Visual regression (real browser screenshots): the very first frame rendered right after switching
 * to the TWIN camera could show a huge, pale, blown-out surface instead of the person — reproduced
 * twice, identically, with the unrelated rim-light/clothing/glass changes already reverted, which
 * proved it was never those. Root cause: `upgradeTwinsToLicensedAsset` (agentLabScene3D.ts) swapped
 * the procedural proxy for the licensed GLB — and reported the swap via `onTwinTier`/the HUD badge —
 * the instant the JS-side object graph was built, before WebGL had necessarily finished compiling
 * shaders/uploading textures for the new materials (three.js otherwise does this lazily on first
 * use). The fix gates the swap on `renderer.compileAsync()` resolving for the new group in an
 * off-scene compile pass, so by the time the badge and the live scene graph change, the asset can
 * already render correctly on its very first live frame.
 *
 * `initBiology()`/`.init()` build the whole scene (real WebGL, real GLTFLoader network fetch) and are
 * exercised only by real browser E2E in this repo (confirmed by `agentLabScene3DOrganPicking.test.ts`,
 * the sibling file this one follows). This test isolates the exact readiness-gate mechanism instead:
 * a controllable fake `renderer.compileAsync` stands in for the GPU, so the swap's ordering — old
 * proxy stays live and reachable for as long as compiling takes, the badge/tier/scene graph change
 * only once compiling resolves — is asserted deterministically, with no wall-clock guessing.
 */
vi.mock('../core/three/humanTwinAsset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/three/humanTwinAsset')>();
  return { ...actual, loadHumanTwinBody: vi.fn() };
});

// Must follow the vi.mock call above (vitest hoists the mock itself, but not this import).
import { loadHumanTwinBody } from '../core/three/humanTwinAsset';

function fakeAsset(): LoadedHumanTwinBody {
  const root = new THREE.Group();
  const skinMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial());
  skinMesh.name = 'base';
  root.add(skinMesh);
  const gate = evaluateHumanTwinAsset();
  return { root, meshes: [skinMesh], morphs: new Map(), heightMeters: 1.78, tier: 'LICENSED_CC0_ASSET', record: gate.record! };
}

describe('AgentLabScene3D — Human Twin readiness gate (immediate post-TWIN-switch regression)', () => {
  it('keeps the old proxy live and reports PROXY until the new asset is GPU-compiled, then swaps atomically', async () => {
    const scene = new AgentLabScene3D({ pose: { reach: 0, position: { x: 0, z: 0 }, facing: 0 } } as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    // Minimal stand-in for what `init()` would have set up — no real WebGL context required.
    (scene as unknown as { scene: THREE.Scene }).scene = new THREE.Scene();
    (scene as unknown as { camera: THREE.PerspectiveCamera }).camera = new THREE.PerspectiveCamera();
    let resolveCompile!: () => void;
    let compileCalls = 0;
    const renderer = {
      compileAsync: (..._args: unknown[]) => { compileCalls++; return new Promise<void>((res) => { resolveCompile = res; }); },
      info: { render: { calls: 0 } },
    } as unknown as THREE.WebGLRenderer;
    (scene as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;

    const anchor = new THREE.Group();
    const old = createTwinProxy(THREE, scene.manifest, { skinHex: '#c9a58a', hologram: true });
    anchor.add(old.group);
    (scene as unknown as { twins: unknown[] }).twins = [old];

    const tierEvents: string[] = [];
    scene.setTwinTierListener((tier) => tierEvents.push(tier));
    vi.mocked(loadHumanTwinBody).mockResolvedValue(fakeAsset());

    const done = (scene as unknown as { upgradeTwinsToLicensedAsset(t: typeof THREE, a: THREE.Group, p: unknown): Promise<void> })
      .upgradeTwinsToLicensedAsset(THREE, anchor, {});

    await vi.waitFor(() => expect(compileCalls).toBe(1));
    // Mid-compile: the badge/tier/scene graph must all still show the OLD, already-stable state —
    // this is the "stable loading/neutral state" the fix must render instead of invalid geometry.
    expect(scene.getStats().humanTwinCompiling).toBe(1);
    expect(scene.getTwinTier()).toBe('PROXY');
    expect(anchor.children).toEqual([old.group]);
    expect(tierEvents).toEqual([]);

    resolveCompile();
    await done;

    // Only now — asset compiled — does the swap become visible at all, atomically.
    expect(scene.getStats().humanTwinCompiling).toBe(0);
    expect(scene.getTwinTier()).toBe('LICENSED_CC0_ASSET');
    expect(anchor.children).toHaveLength(1);
    expect(anchor.children[0]).not.toBe(old.group);
    expect(tierEvents).toEqual(['LICENSED_CC0_ASSET']);
  });

  it('never blocks the swap if compileAsync itself rejects — best effort, not a stuck loading state forever', async () => {
    const scene = new AgentLabScene3D({ pose: { reach: 0, position: { x: 0, z: 0 }, facing: 0 } } as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    (scene as unknown as { scene: THREE.Scene }).scene = new THREE.Scene();
    (scene as unknown as { camera: THREE.PerspectiveCamera }).camera = new THREE.PerspectiveCamera();
    const renderer = {
      compileAsync: () => Promise.reject(new Error('no WebGL context')),
      info: { render: { calls: 0 } },
    } as unknown as THREE.WebGLRenderer;
    (scene as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer;

    const anchor = new THREE.Group();
    const old = createTwinProxy(THREE, scene.manifest, { skinHex: '#c9a58a', hologram: true });
    anchor.add(old.group);
    (scene as unknown as { twins: unknown[] }).twins = [old];
    vi.mocked(loadHumanTwinBody).mockResolvedValue(fakeAsset());

    await (scene as unknown as { upgradeTwinsToLicensedAsset(t: typeof THREE, a: THREE.Group, p: unknown): Promise<void> })
      .upgradeTwinsToLicensedAsset(THREE, anchor, {});

    expect(scene.getTwinTier()).toBe('LICENSED_CC0_ASSET');
    expect(scene.getStats().humanTwinCompiling).toBe(0);
  });
});
