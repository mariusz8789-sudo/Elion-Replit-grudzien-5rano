import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AgentLabScene3D } from '../core/three/agentLabScene3D';
import * as humanLoader from '../core/three/humanTwinAsset';
import { DEFAULT_CUTAWAY } from '../core/three/humanTwinCutaway';
import { BIOLOGY_ROOM } from '../core/scientificWorlds/biologyLabWorld';

const scenes: AgentLabScene3D[] = [];

beforeEach(() => {
  // Canvas is only used to manufacture room textures in this Node lifecycle test.
  // No renderer is created and this test does not claim screenshot/browser proof.
  const pixels = (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' });
  const context = new Proxy<Record<string, unknown>>({
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 40 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => pixels(w, h),
    createImageData: pixels,
  }, { get: (target, key) => key in target ? target[String(key)] : () => {} });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
});

afterEach(() => {
  for (const scene of scenes.splice(0)) scene.dispose();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function readyFixture(name: string): Extract<humanLoader.HumanTwinLoadResult, { status: 'READY' }> {
  const root = new THREE.Group(); root.name = name;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.78, 0.3), new THREE.MeshStandardMaterial());
  mesh.position.y = 0.89; root.add(mesh);
  return {
    status: 'READY',
    asset: { root, meshes: [mesh], morphs: new Map(), heightMeters: 1.78, tier: 'LICENSED_CC0_ASSET', record: humanLoader.evaluateHumanTwinAsset().record! },
    diagnostics: { startedAtMs: 1, fetchStartedAtMs: 2, fetchCompletedAtMs: 3, decodeStartedAtMs: 4, decodeCompletedAtMs: 5, httpStatus: 200, bytes: 1 },
  };
}

function initialize(sim?: AgentLabScene3D) {
  const owned = sim ?? new AgentLabScene3D({} as never, [], BIOLOGY_ROOM, 'biology');
  if (!sim) scenes.push(owned);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
  owned.init(THREE, scene, camera);
  return { sim: owned, scene, camera };
}

/** Exercise the renderer callback boundary; actual WebGL proof belongs to Chromium tests. */
function acknowledgeDraw(ready: Extract<humanLoader.HumanTwinLoadResult, { status: 'READY' }>, scene: THREE.Scene, camera: THREE.Camera) {
  const mesh = ready.asset.meshes[0];
  mesh.onAfterRender({} as THREE.WebGLRenderer, scene, camera, mesh.geometry, mesh.material as THREE.Material, null as never);
}

describe('human asset replacement in the real AgentLabScene3D lifecycle', () => {
  it('keeps LOADING until frame acknowledgement and preserves the selected view, isolation, surface and camera', async () => {
    const request = deferred<humanLoader.HumanTwinLoadResult>();
    vi.spyOn(humanLoader, 'loadHumanTwinBodyResult').mockReturnValue(request.promise);
    const { sim, scene, camera } = initialize();
    expect(sim.getTwinTier()).toBe('PROXY');
    expect(sim.getTwinLoadState().status).toBe('LOADING');
    sim.onFrameRendered();
    expect(sim.getTwinLoadState().status).toBe('LOADING');
    sim.setCameraMode('TWIN'); sim.setTwinView('ORGANS', 'heart');
    sim.setTwinSurface('XRAY'); sim.setTwinIsolated(['heart']);
    const cutaway = { ...DEFAULT_CUTAWAY, enabled: true, position: 0.3 };
    sim.setTwinCutaway(cutaway);
    const ready = readyFixture('loaded-current-body'); request.resolve(ready);
    await vi.waitFor(() => expect(sim.getTwinLoadState().insertedAtMs).not.toBeNull());
    expect(scene.getObjectByName('loaded-current-body')).toBe(ready.asset.root);
    expect(sim.getTwinTier()).toBe('LICENSED_CC0_ASSET');
    expect(sim.getTwinLoadState().status).toBe('LOADING');
    expect(sim.getTwinLoadState().firstRenderedAtMs).toBeNull();
    expect(sim.getCameraMode()).toBe('TWIN');
    expect(sim.getTwinSurface()).toBe('XRAY');
    expect(sim.getTwinCutaway()).toEqual(cutaway);
    const heart = scene.getObjectByName('organ:heart') as THREE.Mesh;
    expect(heart.visible).toBe(true);
    expect((heart.material as THREE.MeshStandardMaterial).emissiveIntensity).toBe(0.9);
    expect(scene.getObjectByName('organ:liver')?.visible).toBe(false);
    expect((ready.asset.meshes[0].material as THREE.MeshStandardMaterial).clippingPlanes).toHaveLength(1);
    sim.onFrameRendered();
    expect(sim.getTwinLoadState().status).toBe('LOADING');
    acknowledgeDraw(ready, scene, camera);
    sim.onFrameRendered();
    expect(sim.getTwinLoadState()).toMatchObject({ status: 'READY', firstRenderedAtMs: expect.any(Number) });
  });

  it('aborts disposal and releases an asset returned late by a non-cancellable decoder', async () => {
    const request = deferred<humanLoader.HumanTwinLoadResult>();
    const load = vi.spyOn(humanLoader, 'loadHumanTwinBodyResult').mockReturnValue(request.promise);
    const { sim } = initialize();
    const signal = load.mock.calls[0][3]!;
    const ready = readyFixture('disposed-late-body');
    const dispose = vi.spyOn(ready.asset.meshes[0].geometry, 'dispose');
    sim.dispose(); expect(signal.aborted).toBe(true);
    request.resolve(ready);
    await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce());
    expect(ready.asset.root.parent).toBeNull();
    expect(sim.getTwinTier()).toBe('PROXY');
    expect(sim.getTwinLoadState().firstRenderedAtMs).toBeNull();
  });

  it('does not insert an old load into the same Sim3D after dispose and re-init', async () => {
    const first = deferred<humanLoader.HumanTwinLoadResult>();
    const second = deferred<humanLoader.HumanTwinLoadResult>();
    const load = vi.spyOn(humanLoader, 'loadHumanTwinBodyResult')
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { sim } = initialize();
    sim.dispose();
    const { scene: replacement, camera } = initialize(sim);
    expect(load.mock.calls[0][3]?.aborted).toBe(true);
    const obsolete = readyFixture('obsolete-body');
    const oldDispose = vi.spyOn(obsolete.asset.meshes[0].geometry, 'dispose');
    expect(sim.getTwinTier()).toBe('PROXY');
    const current = readyFixture('replacement-body'); second.resolve(current);
    await vi.waitFor(() => expect(replacement.getObjectByName('replacement-body')).toBe(current.asset.root));
    acknowledgeDraw(current, replacement, camera);
    sim.onFrameRendered();
    // The most recent scene is already ready when an older request finally resolves.
    first.resolve(obsolete);
    await vi.waitFor(() => expect(oldDispose).toHaveBeenCalledOnce());
    expect(replacement.getObjectByName('obsolete-body')).toBeUndefined();
    expect(replacement.getObjectByName('replacement-body')).toBe(current.asset.root);
    expect(sim.getTwinLoadState().status).toBe('READY');
  });

  it('keeps the proxy and failure reason visible, then supports an explicit retry', async () => {
    const retry = deferred<humanLoader.HumanTwinLoadResult>();
    const diagnostics: humanLoader.HumanTwinLoadDiagnostics = { startedAtMs: 1, fetchStartedAtMs: 2, fetchCompletedAtMs: 3, decodeStartedAtMs: null, decodeCompletedAtMs: null, httpStatus: 503, bytes: null };
    const load = vi.spyOn(humanLoader, 'loadHumanTwinBodyResult')
      .mockResolvedValueOnce({ status: 'ERROR', reason: 'HTTP_503', message: 'Service unavailable', diagnostics })
      .mockReturnValueOnce(retry.promise);
    const { sim, scene, camera } = initialize();
    await vi.waitFor(() => expect(sim.getTwinLoadState()).toMatchObject({ status: 'ERROR', reason: 'HTTP_503' }));
    expect(sim.getTwinTier()).toBe('PROXY');
    sim.retryTwinLoad();
    expect(load).toHaveBeenCalledTimes(2);
    expect(sim.getTwinLoadState().status).toBe('LOADING');
    // Repeated retry clicks while a request is active do not launch competing loads.
    sim.retryTwinLoad(); expect(load).toHaveBeenCalledTimes(2);
    const ready = readyFixture('retried-body'); retry.resolve(ready);
    await vi.waitFor(() => expect(scene.getObjectByName('retried-body')).toBe(ready.asset.root));
    acknowledgeDraw(ready, scene, camera);
    sim.onFrameRendered(); expect(sim.getTwinLoadState().status).toBe('READY');
  });
});
