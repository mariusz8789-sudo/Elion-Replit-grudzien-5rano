import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { screenToNDC, raycastFromScreenPoint, findTaggedAncestor, ClickDragTracker } from '../core/three/graphics/picking';

describe('screenToNDC', () => {
  it('maps the viewport center to (0, 0)', () => {
    const ndc = screenToNDC(THREE, 400, 300, 800, 600);
    expect(ndc.x).toBeCloseTo(0);
    expect(ndc.y).toBeCloseTo(0);
  });

  it('maps the top-left corner to (-1, 1) — y flips from screen-down to NDC-up', () => {
    const ndc = screenToNDC(THREE, 0, 0, 800, 600);
    expect(ndc.x).toBeCloseTo(-1);
    expect(ndc.y).toBeCloseTo(1);
  });

  it('maps the bottom-right corner to (1, -1)', () => {
    const ndc = screenToNDC(THREE, 800, 600, 800, 600);
    expect(ndc.x).toBeCloseTo(1);
    expect(ndc.y).toBeCloseTo(-1);
  });

  it('throws on a non-positive viewport rather than producing Infinity/NaN', () => {
    expect(() => screenToNDC(THREE, 1, 1, 0, 600)).toThrow();
    expect(() => screenToNDC(THREE, 1, 1, 800, -1)).toThrow();
  });
});

describe('raycastFromScreenPoint', () => {
  it('hits an object placed directly in front of the camera at the viewport center', () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    target.position.set(0, 0, 0);
    target.updateMatrixWorld();

    const hits = raycastFromScreenPoint(THREE, new THREE.Raycaster(), camera, 400, 300, 800, 600, [target]);
    // A ray through a box hits both its near and far face — 2 intersections is correct raycasting
    // behavior, not a bug; what matters here is the nearest hit is the target itself.
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]!.object).toBe(target);
  });

  it('misses when the screen point is far from the object', () => {
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    target.updateMatrixWorld();

    const hits = raycastFromScreenPoint(THREE, new THREE.Raycaster(), camera, 10, 10, 800, 600, [target]);
    expect(hits).toHaveLength(0);
  });
});

describe('findTaggedAncestor', () => {
  it('returns the leaf itself when it already carries the tag', () => {
    const leaf = new THREE.Object3D();
    leaf.userData.agentId = 5;
    expect(findTaggedAncestor(leaf, (d) => typeof d.agentId === 'number')).toBe(leaf);
  });

  it('walks up through untagged parents to find the tagged ancestor', () => {
    const group = new THREE.Group();
    group.userData.agentId = 7;
    const child = new THREE.Object3D();
    const grandchild = new THREE.Mesh();
    group.add(child);
    child.add(grandchild);
    expect(findTaggedAncestor(grandchild, (d) => typeof d.agentId === 'number')).toBe(group);
  });

  it('returns null when no ancestor (including the scene root) carries the tag', () => {
    const scene = new THREE.Scene();
    const child = new THREE.Object3D();
    scene.add(child);
    expect(findTaggedAncestor(child, (d) => typeof d.agentId === 'number')).toBeNull();
  });

  it('returns null when given a null object', () => {
    expect(findTaggedAncestor(null, () => true)).toBeNull();
  });
});

describe('ClickDragTracker', () => {
  it('reports no drag for a click that never moves', () => {
    const tracker = new ClickDragTracker();
    tracker.track(100, 100, 'down');
    expect(tracker.finish()).toBe(false);
  });

  it('reports a drag once movement exceeds the threshold', () => {
    const tracker = new ClickDragTracker();
    tracker.track(100, 100, 'down');
    tracker.track(120, 100, 'move'); // 20px > default 6px threshold
    expect(tracker.finish()).toBe(true);
  });

  it('does not flag small jitter under the threshold as a drag', () => {
    const tracker = new ClickDragTracker();
    tracker.track(100, 100, 'down');
    tracker.track(102, 101, 'move'); // ~2.2px < 6px threshold
    expect(tracker.finish()).toBe(false);
  });

  it('honors a custom drag threshold', () => {
    const tracker = new ClickDragTracker(50);
    tracker.track(0, 0, 'down');
    tracker.track(20, 0, 'move'); // under the custom 50px threshold
    expect(tracker.finish()).toBe(false);
  });

  it('resets state after finish(), so the next gesture starts clean', () => {
    const tracker = new ClickDragTracker();
    tracker.track(0, 0, 'down');
    tracker.track(100, 100, 'move');
    expect(tracker.finish()).toBe(true);
    tracker.track(0, 0, 'down');
    expect(tracker.finish()).toBe(false);
  });

  it('ignores move events with no preceding down', () => {
    const tracker = new ClickDragTracker();
    tracker.track(500, 500, 'move');
    expect(tracker.finish()).toBe(false);
  });
});
