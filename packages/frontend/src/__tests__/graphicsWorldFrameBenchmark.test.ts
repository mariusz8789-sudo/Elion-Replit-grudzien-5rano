import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WorldFrameRenderer, type EntityVisualSpec } from '../core/three/graphics/worldFrameRenderer';
import type { WorldFrame, WorldFrameEntity } from '../core/three/graphics/worldFrame';

/**
 * WorldFrameRenderer scale/perf characterization — NOT a hard pass/fail perf gate (CI hardware
 * varies too much for a hardcoded ms budget to be meaningful, and this suite already runs on
 * whatever software/CI environment is available, never a real GPU — see the module doc below).
 * What this DOES verify, with real assertions: the renderer produces the CORRECT result at
 * increasing population sizes (exactly one InstancedMesh, exactly N instances, still one call
 * regardless of N), and reports real, reproducible timing numbers via console output for a human to
 * read in this engine's own performance record — not a fabricated or extrapolated number.
 *
 * IMPORTANT HONESTY NOTE for anyone reading these numbers later: this suite runs on Node (no
 * WebGL/GPU at all — `InstancedMesh` construction and matrix/color buffer population here is pure
 * CPU-side JS, never touching a real graphics driver). These numbers characterize the CPU cost of
 * `WorldFrameRenderer.sync()` itself (frame diffing, resolver calls, buffer population) — NOT
 * frame-render time, NOT GPU cost, and NOT a substitute for profiling on real hardware with a real
 * WebGL context. Presenting a Node timing as "GPU performance" would be exactly the false claim this
 * engine's own rules forbid.
 */

function buildFrame(count: number, time: number, jitter = 0): WorldFrame {
  const entities: WorldFrameEntity[] = new Array(count);
  for (let i = 0; i < count; i++) {
    entities[i] = {
      id: `e${i}`,
      visualHint: 'instanced:agent',
      position: [Math.sin(i + time * jitter) * 10, 0, Math.cos(i + time * jitter) * 10],
    };
  }
  return { time, entities };
}

/** Fresh geometry/material per test — sharing one module-level instance across tests that each
 * call `renderer.dispose()` would mean later tests build instances against an already-disposed
 * resource. Harmless in this Node (no real WebGL context) test environment, but confusing to read
 * and not the pattern a real caller should copy. */
function makeBenchResolver(): () => EntityVisualSpec {
  const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  const material = new THREE.MeshStandardMaterial();
  return () => ({ kind: 'instanced', batchKey: 'agents', geometry, material });
}

const SCALES = [1000, 5000, 10000];

describe('WorldFrameRenderer — population-scale characterization (1k/5k/10k synthetic entities)', () => {
  for (const count of SCALES) {
    it(`builds exactly one InstancedMesh with ${count} instances (first sync — full rebuild path)`, () => {
      const scene = new THREE.Scene();
      const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: makeBenchResolver() });
      const start = performance.now();
      renderer.sync(buildFrame(count, 0));
      const elapsedMs = performance.now() - start;

      const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
      expect(meshes).toHaveLength(1);
      expect(meshes[0]!.count).toBe(count);
      // eslint-disable-next-line no-console -- deliberate: this is the human-readable perf record this test exists to produce.
      console.log(`[WorldFrameRenderer benchmark] first sync, ${count} instances (full rebuild): ${elapsedMs.toFixed(2)}ms (Node CPU-side, not GPU)`);
      renderer.dispose();
    });

    it(`retunes ${count} instances via the incremental path (same membership) without rebuilding`, () => {
      const scene = new THREE.Scene();
      const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: makeBenchResolver() });
      renderer.sync(buildFrame(count, 0));
      const firstMesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

      const start = performance.now();
      renderer.sync(buildFrame(count, 1)); // same ids/order, different positions
      const elapsedMs = performance.now() - start;

      const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
      expect(meshes).toHaveLength(1);
      expect(meshes[0]).toBe(firstMesh); // proves the incremental path actually ran, not a silent rebuild
      // eslint-disable-next-line no-console -- deliberate: this is the human-readable perf record this test exists to produce.
      console.log(`[WorldFrameRenderer benchmark] incremental sync, ${count} instances (no rebuild): ${elapsedMs.toFixed(2)}ms (Node CPU-side, not GPU)`);
      renderer.dispose();
    });
  }

  it('disposes a large population cleanly (no leaked geometry/material/textures) at the largest tested scale', () => {
    const scene = new THREE.Scene();
    const renderer = new WorldFrameRenderer(THREE, scene, { resolveVisual: makeBenchResolver() });
    renderer.sync(buildFrame(10000, 0));
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const disposeSpy = mesh.geometry.dispose.bind(mesh.geometry);
    let disposed = false;
    mesh.geometry.dispose = () => { disposed = true; disposeSpy(); };
    renderer.dispose();
    expect(disposed).toBe(true);
    expect(scene.children).toHaveLength(0);
  });
});
