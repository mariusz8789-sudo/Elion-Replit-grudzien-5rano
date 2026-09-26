import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HUMAN_TWIN_RUNTIME_PATH, loadHumanTwinBody, loadHumanTwinBodyResult } from '../core/three/humanTwinAsset';
import { disposeSceneResources } from '../core/three/graphics/lifecycle';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Minimal geometry fixture parsed by the real GLTFLoader; not evidence for the human asset itself. */
function triangleGlb(): ArrayBuffer {
  const positions = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 2, 0]);
  const json = JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 2, 0] }],
    bufferViews: [{ buffer: 0, byteLength: positions.byteLength }], buffers: [{ byteLength: positions.byteLength }],
  });
  const encoded = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const buffer = new ArrayBuffer(12 + 8 + encoded.length + 8 + positions.byteLength);
  const view = new DataView(buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, encoded.length, true); view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buffer, 20, encoded.length).set(encoded);
  view.setUint32(20 + encoded.length, positions.byteLength, true); view.setUint32(24 + encoded.length, 0x004e4942, true);
  new Uint8Array(buffer, 28 + encoded.length).set(new Uint8Array(positions.buffer));
  return buffer;
}

describe('human twin loader: observable transport/decode outcomes', () => {
  it('blocks an unregistered asset before any fetch', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy);
    const result = await loadHumanTwinBodyResult(THREE, 1.8, '/unregistered.glb');
    expect(result).toMatchObject({ status: 'BLOCKED', reason: 'NO_MANIFEST_RECORD' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.diagnostics.fetchStartedAtMs).toBeNull();
  });

  it('reports the actual HTTP failure and does not try decoding an error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('missing', { status: 404 })));
    const decode = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const result = await loadHumanTwinBodyResult(THREE, 1.8);
    expect(result).toMatchObject({ status: 'ERROR', reason: 'HTTP_404', diagnostics: { httpStatus: 404, decodeStartedAtMs: null } });
    expect(decode).not.toHaveBeenCalled();
  });

  it('retains a transport failure message rather than silently returning a proxy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Connection closed')));
    const result = await loadHumanTwinBodyResult(THREE, 1.8);
    expect(result).toMatchObject({ status: 'ERROR', reason: 'FETCH_FAILED', message: 'Connection closed' });
  });

  it('classifies corrupt GLB bytes as a decode failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]))));
    const result = await loadHumanTwinBodyResult(THREE, 1.8);
    expect(result).toMatchObject({ status: 'ERROR', reason: 'DECODE_FAILED', diagnostics: { httpStatus: 200, bytes: 4 } });
    expect(result.diagnostics.fetchCompletedAtMs).toEqual(expect.any(Number));
    expect(result.diagnostics.decodeStartedAtMs).toEqual(expect.any(Number));
  });

  it('parses actual GLB geometry, normalizes height and measures completed stages', async () => {
    const buffer = triangleGlb();
    const transport = vi.fn().mockResolvedValue(new Response(buffer)); vi.stubGlobal('fetch', transport);
    const result = await loadHumanTwinBodyResult(THREE, 1.8);
    expect(result.status).toBe('READY');
    if (result.status !== 'READY') throw new Error(JSON.stringify(result));
    expect(transport).toHaveBeenCalledWith(HUMAN_TWIN_RUNTIME_PATH, { signal: undefined });
    expect(result.asset.meshes).toHaveLength(1);
    expect(result.asset.tier).toBe('LICENSED_CC0_ASSET');
    expect(new THREE.Box3().setFromObject(result.asset.root).getSize(new THREE.Vector3()).y).toBeCloseTo(1.8);
    expect(result.asset.meshes[0].castShadow).toBe(true);
    const d = result.diagnostics;
    expect(d.bytes).toBe(buffer.byteLength);
    expect(d.fetchStartedAtMs!).toBeGreaterThanOrEqual(d.startedAtMs);
    expect(d.fetchCompletedAtMs!).toBeGreaterThanOrEqual(d.fetchStartedAtMs!);
    expect(d.decodeStartedAtMs!).toBeGreaterThanOrEqual(d.fetchCompletedAtMs!);
    expect(d.decodeCompletedAtMs!).toBeGreaterThanOrEqual(d.decodeStartedAtMs!);
    disposeSceneResources(result.asset.root);
  });

  it('preserves the existing success/null wrapper for cinematic consumers', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(triangleGlb()))
      .mockResolvedValueOnce(new Response('missing', { status: 404 })));
    const body = await loadHumanTwinBody(THREE, 1.75);
    expect(body?.meshes).toHaveLength(1);
    expect(await loadHumanTwinBody(THREE, 1.75)).toBeNull();
    disposeSceneResources(body!.root);
  });

  it('does not fetch for a request that was already aborted', async () => {
    const controller = new AbortController(); controller.abort();
    const transport = vi.fn(); vi.stubGlobal('fetch', transport);
    expect(await loadHumanTwinBodyResult(THREE, 1.8, undefined, controller.signal)).toMatchObject({ status: 'CANCELLED', reason: 'CANCELLED' });
    expect(transport).not.toHaveBeenCalled();
  });

  it('passes cancellation to in-flight transport', async () => {
    vi.stubGlobal('fetch', vi.fn((_path: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));
    const controller = new AbortController();
    const pending = loadHumanTwinBodyResult(THREE, 1.8, undefined, controller.signal);
    controller.abort();
    expect(await pending).toMatchObject({ status: 'CANCELLED' });
  });

  it('disposes decoded geometry, materials and textures when cancellation happens during decode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(triangleGlb())));
    const texture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Group(); scene.add(new THREE.Mesh(geometry, material));
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(material, 'dispose');
    const textureDispose = vi.spyOn(texture, 'dispose');
    let resolveDecode!: (gltf: GLTF) => void;
    const decode = vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockImplementation(() => new Promise((resolve) => { resolveDecode = resolve; }));
    const controller = new AbortController();
    const pending = loadHumanTwinBodyResult(THREE, 1.8, undefined, controller.signal);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    controller.abort(); resolveDecode({ scene } as unknown as GLTF);
    expect(await pending).toMatchObject({ status: 'CANCELLED' });
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(textureDispose).toHaveBeenCalledOnce();
  });

  it('refuses a successfully decoded file without any mesh', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(triangleGlb())));
    vi.spyOn(GLTFLoader.prototype, 'parseAsync').mockResolvedValue({ scene: new THREE.Group() } as unknown as GLTF);
    expect(await loadHumanTwinBodyResult(THREE, 1.8)).toMatchObject({ status: 'ERROR', reason: 'EMPTY_MODEL' });
  });
});
