import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { getWorldAssetRecord } from '../core/three/assetGovernance';

/**
 * GENESIS GRAPHICS ENGINE — VISUAL WORLD BUILD 3.0: proves the asset-pipeline swap
 * (`graphics/assetPipeline.ts`'s `createAssetSlot`) end to end with a REAL committed GLB asset, not
 * just the seam in isolation. See `scripts/exportAmbulanceAsset.mjs` for how the asset was generated
 * and `assetGovernance.ts` for its provenance record.
 */

const GLB_PATH = path.resolve(__dirname, '../../public/assets/genesis-procedural/ambulance/ambulance.glb');
const RUNTIME_PATH = '/assets/genesis-procedural/ambulance/ambulance.glb';

let originalFetch: typeof fetch | undefined;
let originalDocument: unknown;
let originalRequest: typeof Request | undefined;

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
  originalDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : { ...fakeImage }),
    createElementNS: () => ({ ...fakeImage }),
  };

  // THREE.FileLoader builds `new Request(url, ...)` before calling `fetch` — in a real browser that
  // resolves a root-relative URL like '/assets/...' against the document's base URL, but Node's
  // built-in `Request` has no document to resolve against and throws synchronously on a relative
  // URL. Stubbing only `fetch` can't reach that: the throw happens one line earlier. A minimal
  // `Request` stand-in (store the url, skip WHATWG's absolute-URL validation) fixes that Node-only
  // gap without touching the loader/parsing logic this test actually exercises.
  originalRequest = globalThis.Request;
  class TestRequest {
    url: string;
    headers: unknown;
    constructor(url: string, init?: { headers?: unknown }) {
      this.url = url;
      this.headers = init?.headers;
    }
  }
  (globalThis as { Request?: unknown }).Request = TestRequest as unknown as typeof Request;

  // THREE.FileLoader uses the global `fetch` when available — stub it to serve the real committed
  // file from disk regardless of the requested URL, since this test has no real HTTP server. This
  // is the SAME loader class (GLTFLoader -> FileLoader) production code uses; only the transport is
  // substituted, not the parsing/loading logic under test.
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const buf = await readFile(GLB_PATH);
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      headers: new Map(),
    } as unknown as Response;
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch as typeof fetch;
  (globalThis as { document?: unknown }).document = originalDocument;
  (globalThis as { Request?: unknown }).Request = originalRequest;
});

function buildInitializedScene(): { sim: EpidemicCity3DSim; scene: THREE.Scene } {
  const sim = new EpidemicCity3DSim({ nAgents: 48, seed: 7 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  sim.init(THREE, scene, camera, 400, 300);
  return { sim, scene };
}

describe('committed ambulance.glb asset', () => {
  it('is a real, valid binary glTF file whose SHA-256 matches its assetGovernance.ts manifest record', async () => {
    const buf = await readFile(GLB_PATH);
    expect(buf.subarray(0, 4).toString('ascii')).toBe('glTF'); // GLB magic
    expect(buf.readUInt32LE(4)).toBe(2); // glTF version 2
    expect(buf.readUInt32LE(8)).toBe(buf.length); // declared total length matches the real file
    const digest = createHash('sha256').update(buf).digest('hex');
    const record = getWorldAssetRecord(RUNTIME_PATH);
    expect(record?.status).toBe('APPROVED');
    expect(record?.sha256['ambulance.glb']).toBe(digest);
  });

  it('loads via the exact GLTFLoader class production code uses, producing the expected ambulance geometry', async () => {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const buf = await readFile(GLB_PATH);
    const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
    let meshCount = 0;
    gltf.scene.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshCount++; });
    // chassis + cabin + 4 wheels + light bar + 2 cross bars = 9, matching exportAmbulanceAsset.mjs.
    expect(meshCount).toBe(9);
  });
});

describe('EpidemicCity3DSim — ambulance asset-pipeline swap, end to end in the real production scene', () => {
  it('the procedural ambulance fallback is visible immediately after init()', () => {
    const { scene } = buildInitializedScene();
    expect(scene.getObjectByName('genesis-vehicle-ambulance')).toBeDefined();
  });

  it('the real GLB asset swaps in, replacing the procedural fallback at the same transform, once the async load resolves', async () => {
    const { scene } = buildInitializedScene();
    const extras = scene.getObjectByName('visual-world-build-city-extras')!;
    const fallback = extras.children.find((c) => c.name === 'genesis-vehicle-ambulance');
    expect(fallback).toBeDefined();
    const fallbackPosition = fallback!.position.clone();

    // Let the in-flight async load (kicked off during init()) settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await Promise.resolve(); // flush any remaining microtasks from the loader's own promise chain

    expect(extras.children).not.toContain(fallback);
    const swapped = extras.children.find((c) => c !== fallback && c.position.distanceTo(fallbackPosition) < 1e-6);
    expect(swapped).toBeDefined();
    let meshCount = 0;
    swapped!.traverse((n) => { if ((n as THREE.Mesh).isMesh) meshCount++; });
    expect(meshCount).toBe(9);
  });
});
