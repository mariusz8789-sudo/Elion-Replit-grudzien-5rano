import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  readFrameCounters, FrameProfiler, RollingFrameStats, estimateSceneTextureMemory,
  estimateSceneGeometryMemory, estimateRenderTargetMemory, estimateSceneGpuMemory,
  type FrameSample,
} from '../core/three/graphics/diagnostics';
import type * as THREE_NS from 'three';

function fakeRenderer(overrides: Partial<{ calls: number; triangles: number; points: number; lines: number; geometries: number; textures: number; programCount: number }> = {}) {
  const {
    calls = 12, triangles = 3400, points = 0, lines = 0, geometries = 8, textures = 5, programCount = 4,
  } = overrides;
  return {
    info: {
      render: { calls, triangles, points, lines, frame: 1 },
      memory: { geometries, textures },
      programs: new Array(programCount).fill(null),
    },
  } as unknown as THREE_NS.WebGLRenderer;
}

describe('readFrameCounters', () => {
  it('reads draw calls/triangles/points/lines/geometries/textures/programs from renderer.info', () => {
    const renderer = fakeRenderer({ calls: 42, triangles: 9000, points: 1, lines: 2, geometries: 10, textures: 6, programCount: 3 });
    const counters = readFrameCounters(renderer);
    expect(counters).toEqual({ drawCalls: 42, triangles: 9000, points: 1, lines: 2, geometries: 10, textures: 6, programs: 3 });
  });

  it('reports 0 programs when renderer.info.programs is null (before any material has compiled)', () => {
    const renderer = fakeRenderer();
    (renderer.info as unknown as { programs: null }).programs = null;
    expect(readFrameCounters(renderer).programs).toBe(0);
  });
});

describe('FrameProfiler', () => {
  it('reports frameTimeMs: 0 and fps: 0 on the very first sample', () => {
    const profiler = new FrameProfiler();
    const sample = profiler.sample(fakeRenderer(), 1000);
    expect(sample.frameTimeMs).toBe(0);
    expect(sample.fps).toBe(0);
  });

  it('computes frameTimeMs as the wall-clock gap between two samples', () => {
    const profiler = new FrameProfiler();
    profiler.sample(fakeRenderer(), 1000);
    const second = profiler.sample(fakeRenderer(), 1016.6);
    expect(second.frameTimeMs).toBeCloseTo(16.6);
    expect(second.fps).toBeCloseTo(1000 / 16.6, 1);
  });

  it('never reports a negative frameTimeMs even if `now` goes backwards', () => {
    const profiler = new FrameProfiler();
    profiler.sample(fakeRenderer(), 1000);
    const second = profiler.sample(fakeRenderer(), 900);
    expect(second.frameTimeMs).toBe(0);
  });

  it('includes the current frame counters alongside the timing', () => {
    const profiler = new FrameProfiler();
    const sample = profiler.sample(fakeRenderer({ calls: 7 }), 1000);
    expect(sample.drawCalls).toBe(7);
  });

  it('reset() forgets the last sample time, so the next sample reads as the first again', () => {
    const profiler = new FrameProfiler();
    profiler.sample(fakeRenderer(), 1000);
    profiler.reset();
    const sample = profiler.sample(fakeRenderer(), 5000);
    expect(sample.frameTimeMs).toBe(0);
  });
});

describe('RollingFrameStats', () => {
  function sampleAt(frameTimeMs: number): FrameSample {
    return { drawCalls: 1, triangles: 1, points: 0, lines: 0, geometries: 1, textures: 1, programs: 1, frameTimeMs, fps: frameTimeMs > 0 ? 1000 / frameTimeMs : 0 };
  }

  it('throws on a non-positive window size', () => {
    expect(() => new RollingFrameStats(0)).toThrow();
    expect(() => new RollingFrameStats(-1)).toThrow();
  });

  it('reports NaN average and null latestCounters before any sample is pushed', () => {
    const stats = new RollingFrameStats(5);
    expect(stats.count).toBe(0);
    expect(stats.averageFrameTimeMs).toBeNaN();
    expect(stats.latestCounters).toBeNull();
  });

  it('averages frame time across pushed samples', () => {
    const stats = new RollingFrameStats(5);
    stats.push(sampleAt(10));
    stats.push(sampleAt(20));
    stats.push(sampleAt(30));
    expect(stats.averageFrameTimeMs).toBeCloseTo(20);
    expect(stats.averageFps).toBeCloseTo(50);
  });

  it('drops the oldest sample once the window is full (a true rolling window, not an ever-growing log)', () => {
    const stats = new RollingFrameStats(2);
    stats.push(sampleAt(10));
    stats.push(sampleAt(20));
    stats.push(sampleAt(30)); // should push out the first 10ms sample
    expect(stats.count).toBe(2);
    expect(stats.averageFrameTimeMs).toBeCloseTo(25); // (20+30)/2, not (10+20+30)/3
  });

  it('latestCounters returns the most recent sample without averaging (exact counts, not smoothed)', () => {
    const stats = new RollingFrameStats(5);
    stats.push({ ...sampleAt(10), drawCalls: 5 });
    stats.push({ ...sampleAt(10), drawCalls: 9 });
    expect(stats.latestCounters?.drawCalls).toBe(9);
  });
});

/** A texture with a plain `{width, height}` image — avoids needing a real `HTMLCanvasElement` (this
 * test environment has no `document`), and `estimateSceneTextureMemory` only ever reads
 * `image.width`/`image.height`, exactly what a real `CanvasTexture`'s image also exposes. */
function fakeTexture(width: number, height: number, generateMipmaps = true): THREE_NS.Texture {
  const texture = new THREE.Texture({ width, height } as unknown as HTMLImageElement);
  texture.generateMipmaps = generateMipmaps;
  return texture;
}

describe('estimateSceneTextureMemory', () => {
  it('reports zero for an empty scene', () => {
    const scene = new THREE.Scene();
    expect(estimateSceneTextureMemory(scene)).toEqual({ totalBytes: 0, uniqueTextureCount: 0 });
  });

  it('estimates RGBA8 bytes with the standard mipmap factor (4/3) for one textured mesh', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ map: fakeTexture(256, 256) });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    const result = estimateSceneTextureMemory(scene);
    expect(result.uniqueTextureCount).toBe(1);
    expect(result.totalBytes).toBeCloseTo(256 * 256 * 4 * (4 / 3));
  });

  it('skips the mipmap factor when generateMipmaps is false', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({ map: fakeTexture(128, 128, false) });
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    const result = estimateSceneTextureMemory(scene);
    expect(result.totalBytes).toBeCloseTo(128 * 128 * 4);
  });

  it('deduplicates a texture shared across multiple materials/meshes (the common case here — one procedural CanvasTexture, many building materials)', () => {
    const scene = new THREE.Scene();
    const shared = fakeTexture(64, 64);
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: shared })));
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: shared })));
    const result = estimateSceneTextureMemory(scene);
    expect(result.uniqueTextureCount).toBe(1);
    expect(result.totalBytes).toBeCloseTo(64 * 64 * 4 * (4 / 3));
  });

  it('counts every distinct map property on one material (map + normalMap + roughnessMap are 3 real textures, not 1)', () => {
    const scene = new THREE.Scene();
    const material = new THREE.MeshStandardMaterial({
      map: fakeTexture(32, 32), normalMap: fakeTexture(32, 32), roughnessMap: fakeTexture(32, 32),
    });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
    expect(estimateSceneTextureMemory(scene).uniqueTextureCount).toBe(3);
  });

  it('walks an array of materials on one mesh (multi-material geometry)', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      new THREE.MeshStandardMaterial({ map: fakeTexture(16, 16) }),
      new THREE.MeshStandardMaterial({ map: fakeTexture(32, 32) }),
    ]);
    scene.add(mesh);
    const result = estimateSceneTextureMemory(scene);
    expect(result.uniqueTextureCount).toBe(2);
    expect(result.totalBytes).toBeCloseTo((16 * 16 + 32 * 32) * 4 * (4 / 3));
  });

  it('ignores meshes with no map (a plain-color material contributes 0 textures)', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xff0000 })));
    expect(estimateSceneTextureMemory(scene)).toEqual({ totalBytes: 0, uniqueTextureCount: 0 });
  });
});

/** A minimal geometry with a KNOWN exact byte size (3 vertices × 3 floats × 4 bytes = 36 bytes) —
 * avoids hand-deriving a real primitive's (e.g. BoxGeometry's) actual vertex count, which is an
 * implementation detail of three.js, not of the function under test. */
function tinyGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  return geometry;
}

describe('estimateSceneGeometryMemory', () => {
  it('reports zero for an empty scene', () => {
    const scene = new THREE.Scene();
    expect(estimateSceneGeometryMemory(scene)).toEqual({ totalBytes: 0, uniqueGeometryCount: 0 });
  });

  it('sums exact attribute buffer bytes for one mesh (no assumption, unlike texture memory — real byteLength)', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(tinyGeometry(), new THREE.MeshStandardMaterial()));
    const result = estimateSceneGeometryMemory(scene);
    expect(result.uniqueGeometryCount).toBe(1);
    expect(result.totalBytes).toBe(9 * 4); // 3 vertices × 3 floats × 4 bytes/float
  });

  it('includes the index buffer when present', () => {
    const scene = new THREE.Scene();
    const geometry = tinyGeometry();
    geometry.setIndex([0, 1, 2]);
    scene.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial()));
    const result = estimateSceneGeometryMemory(scene);
    // Uint16Array index for 3 vertices (three.js picks Uint16 under 65536 vertices) = 3 × 2 bytes,
    // on top of the 36-byte position attribute.
    expect(result.totalBytes).toBe(9 * 4 + geometry.index!.array.byteLength);
  });

  it('deduplicates a geometry shared across multiple regular meshes', () => {
    const scene = new THREE.Scene();
    const shared = tinyGeometry();
    scene.add(new THREE.Mesh(shared, new THREE.MeshStandardMaterial()));
    scene.add(new THREE.Mesh(shared, new THREE.MeshStandardMaterial()));
    const result = estimateSceneGeometryMemory(scene);
    expect(result.uniqueGeometryCount).toBe(1);
    expect(result.totalBytes).toBe(9 * 4);
  });

  it('an InstancedMesh\'s own instance buffers are counted PER INSTANCED MESH, never deduplicated — even when two share the same base geometry', () => {
    const scene = new THREE.Scene();
    const shared = tinyGeometry();
    const a = new THREE.InstancedMesh(shared, new THREE.MeshStandardMaterial(), 5);
    const b = new THREE.InstancedMesh(shared, new THREE.MeshStandardMaterial(), 3);
    scene.add(a, b);
    const result = estimateSceneGeometryMemory(scene);
    // Base geometry counted once (36 bytes); each InstancedMesh's own instanceMatrix (16 floats ×
    // instance count × 4 bytes) is a real, separate GPU allocation neither three.js nor this
    // function shares between them.
    expect(result.uniqueGeometryCount).toBe(1);
    expect(result.totalBytes).toBe(9 * 4 + 16 * 5 * 4 + 16 * 3 * 4);
  });

  it('includes an InstancedMesh\'s instanceColor buffer when present', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.InstancedMesh(tinyGeometry(), new THREE.MeshStandardMaterial(), 4);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(4 * 3), 3);
    scene.add(mesh);
    const result = estimateSceneGeometryMemory(scene);
    expect(result.totalBytes).toBe(9 * 4 + 16 * 4 * 4 + 4 * 3 * 4);
  });
});

describe('estimateRenderTargetMemory', () => {
  it('reports zero for no targets', () => {
    expect(estimateRenderTargetMemory([])).toBe(0);
  });

  it('estimates RGBA8 color bytes for a target with no depth buffer', () => {
    const target = new THREE.WebGLRenderTarget(100, 50, { depthBuffer: false });
    expect(estimateRenderTargetMemory([target])).toBe(100 * 50 * 4);
  });

  it('adds a packed depth/stencil buffer when depthBuffer is set (the three.js default)', () => {
    const target = new THREE.WebGLRenderTarget(100, 50);
    expect(target.depthBuffer).toBe(true); // sanity: this is really the three.js default
    expect(estimateRenderTargetMemory([target])).toBe(100 * 50 * 4 * 2);
  });

  it('sums multiple targets (the EffectComposer ping-pong pair)', () => {
    const a = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: false });
    const b = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: false });
    expect(estimateRenderTargetMemory([a, b])).toBe(2 * 64 * 64 * 4);
  });

  it('multiplies by MSAA sample count when set', () => {
    const target = new THREE.WebGLRenderTarget(32, 32, { depthBuffer: false, samples: 4 });
    expect(estimateRenderTargetMemory([target])).toBe(32 * 32 * 4 * 4);
  });
});

describe('estimateSceneGpuMemory', () => {
  it('combines texture + geometry + render-target bytes into one real total, with the breakdown preserved', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(tinyGeometry(), new THREE.MeshStandardMaterial({ map: fakeTexture(16, 16, false) })));
    const target = new THREE.WebGLRenderTarget(10, 10, { depthBuffer: false });
    const result = estimateSceneGpuMemory(scene, [target]);
    const expectedTexture = 16 * 16 * 4;
    const expectedGeometry = 9 * 4;
    const expectedRenderTarget = 10 * 10 * 4;
    expect(result.textureBytes).toBe(expectedTexture);
    expect(result.geometryBytes).toBe(expectedGeometry);
    expect(result.renderTargetBytes).toBe(expectedRenderTarget);
    expect(result.totalBytes).toBe(expectedTexture + expectedGeometry + expectedRenderTarget);
    expect(result.uniqueTextureCount).toBe(1);
    expect(result.uniqueGeometryCount).toBe(1);
  });

  it('defaults renderTargets to empty — a scene with no post-processing pipeline still gets a real texture+geometry total', () => {
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(tinyGeometry(), new THREE.MeshStandardMaterial()));
    const result = estimateSceneGpuMemory(scene);
    expect(result.renderTargetBytes).toBe(0);
    expect(result.totalBytes).toBe(9 * 4);
  });
});
