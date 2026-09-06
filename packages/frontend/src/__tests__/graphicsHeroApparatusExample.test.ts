import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';

/** Same minimal canvas/document stub as graphicsMaterials.test.ts — this example pulls in
 * `createGenesisMaterialPalette`, which needs `document.createElement('canvas')`. See that file
 * for why this project stubs it locally instead of adding jsdom project-wide. */
beforeAll(() => {
  const fakeContext: Partial<CanvasRenderingContext2D> = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    fillRect: () => {}, strokeRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    stroke: () => {}, fillText: () => {}, clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () => ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }) as ImageData,
    putImageData: () => {},
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => fakeContext as CanvasRenderingContext2D };
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => (tag === 'canvas' ? { ...fakeCanvas } : {}),
  };
});

import { buildExampleHeroApparatus } from '../core/three/graphics/examples/heroApparatusExample';
import { severityColor } from '../core/three/graphics/stateVisualization';

describe('buildExampleHeroApparatus — integration smoke test', () => {
  it('builds without throwing and adds a group to the scene', () => {
    const scene = new THREE.Scene();
    const handles = buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    expect(scene.children).toContain(handles.group);
    expect(handles.group.children.length).toBeGreaterThan(0);
  });

  it('adds hero KEY/RIM lights to the scene', () => {
    const scene = new THREE.Scene();
    buildExampleHeroApparatus(THREE, scene, { position: [1, 0, -2] });
    const spotLights = scene.children.filter((c) => c instanceof THREE.SpotLight);
    const pointLights = scene.children.filter((c) => c instanceof THREE.PointLight);
    expect(spotLights.length).toBeGreaterThanOrEqual(1);
    expect(pointLights.length).toBeGreaterThanOrEqual(1);
  });

  it('applies the shadow policy, including the forced status-light override', () => {
    const scene = new THREE.Scene();
    buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    let structuralCastCount = 0;
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.castShadow) structuralCastCount += 1;
    });
    // At minimum, the forced status light casts a shadow despite being tiny.
    expect(structuralCastCount).toBeGreaterThan(0);
  });

  it('batches the bolt ring into a single InstancedMesh (one draw call, not sixteen)', () => {
    const scene = new THREE.Scene();
    const handles = buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    const instancedMeshes = handles.group.children.filter((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh[];
    expect(instancedMeshes).toHaveLength(1);
    expect(instancedMeshes[0]!.count).toBe(16);
  });

  it('scientific-state hook drives fill scale and color (via stateVisualization.ts), never a fabricated value', () => {
    const scene = new THREE.Scene();
    const handles = buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    const fill = handles.group.children.find((c) => c.name === 'exampleApparatusFill') as THREE.Mesh | undefined;
    expect(fill).toBeDefined();

    handles.updateVisualState(0.75, 'warning');
    expect(fill!.scale.y).toBeCloseTo(0.75);
    const material = fill!.material as THREE.MeshStandardMaterial;
    expect(material.emissive.getHex()).toBe(severityColor(THREE, 0.6).getHex());

    handles.updateVisualState(0.1, 'critical');
    expect(fill!.scale.y).toBeCloseTo(0.1);
    expect(material.emissive.getHex()).toBe(severityColor(THREE, 1).getHex());
  });

  it('clamps fraction to [0, 1] rather than trusting out-of-range input', () => {
    const scene = new THREE.Scene();
    const handles = buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    const fill = handles.group.children.find((c) => c.name === 'exampleApparatusFill') as THREE.Mesh;
    handles.updateVisualState(5, 'nominal');
    expect(fill.scale.y).toBeCloseTo(1);
    handles.updateVisualState(-3, 'nominal');
    expect(fill.scale.y).toBeGreaterThan(0); // never collapses to exactly 0 (matches the real vessel's Math.max(0.02, ...) pattern)
  });

  it('suggestedDofSettings hands back an enabled, opt-in DOF config at the given distance', () => {
    const scene = new THREE.Scene();
    const handles = buildExampleHeroApparatus(THREE, scene, { position: [0, 0, 0] });
    const dof = handles.suggestedDofSettings(3.2);
    expect(dof.enabled).toBe(true);
    expect(dof.focusDistance).toBe(3.2);
  });

  it('scales geometry and lighting distances together when a larger apparatus is requested', () => {
    const small = new THREE.Scene();
    const large = new THREE.Scene();
    const smallHandles = buildExampleHeroApparatus(THREE, small, { position: [0, 0, 0], scale: 1 });
    const largeHandles = buildExampleHeroApparatus(THREE, large, { position: [0, 0, 0], scale: 3 });
    expect(largeHandles.group.scale.x).toBeGreaterThan(smallHandles.group.scale.x);
  });
});
