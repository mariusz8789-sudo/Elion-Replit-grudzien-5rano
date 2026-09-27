import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildLymphaticNetwork, buildNeuralNetwork, buildVascularNetwork } from '../core/scientificWorlds/humanLab/anatomyNetworks';
import { buildAnatomyNetworkGroup, placeCylinderBetween } from '../core/three/anatomyNetworkGeometry';

const manifest = createHumanDigitalTwinManifest('HDT-geo-test');

describe('D-135 anatomy network geometry — real three.js meshes built from the real graph, no renderer required', () => {
  it('placeCylinderBetween positions and scales a unit cylinder to span exactly from a to b', () => {
    const mesh = new THREE.Object3D();
    const a = new THREE.Vector3(0, 1, 0); const b = new THREE.Vector3(0, 1.3, 0);
    const length = placeCylinderBetween(THREE, mesh, a, b);
    expect(length).toBeCloseTo(0.3, 10);
    expect(mesh.position.toArray()).toEqual([0, 1, 0]);
    expect(mesh.scale.y).toBeCloseTo(0.3, 10);
    // Straight up +Y: no rotation needed, quaternion stays identity.
    expect(mesh.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });

  it('placeCylinderBetween orients a non-vertical span correctly (endpoint reachable by walking the transform)', () => {
    const mesh = new THREE.Object3D();
    const a = new THREE.Vector3(0, 0, 0); const b = new THREE.Vector3(1, 0, 0); // straight along +X
    const length = placeCylinderBetween(THREE, mesh, a, b);
    expect(length).toBeCloseTo(1, 10);
    // A point at local (0,1,0) (the cylinder's tip before placement) should land on `b` after the transform.
    const tip = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion).multiplyScalar(mesh.scale.y).add(mesh.position);
    expect(tip.x).toBeCloseTo(1, 10); expect(tip.y).toBeCloseTo(0, 10); expect(tip.z).toBeCloseTo(0, 10);
  });

  it('a zero-length span (a === b) is handled without throwing or producing NaN', () => {
    const mesh = new THREE.Object3D();
    const p = new THREE.Vector3(1, 2, 3);
    const length = placeCylinderBetween(THREE, mesh, p, p.clone());
    expect(length).toBe(0);
    expect(Number.isFinite(mesh.quaternion.x)).toBe(true);
  });

  it('builds one edge mesh per network edge and one hub marker per hub node, matching the source graph exactly', () => {
    for (const network of [buildVascularNetwork(manifest), buildNeuralNetwork(manifest), buildLymphaticNetwork(manifest)]) {
      const built = buildAnatomyNetworkGroup(THREE, network);
      expect(built.edgeMeshCount, network.kind).toBe(network.edges.length);
      expect(built.hubMeshCount, network.kind).toBe(network.nodes.filter((n) => n.hub).length);
      const edgeMeshes = built.group.children.filter((c) => c.name.startsWith('anatomy-network-edge:'));
      const hubMeshes = built.group.children.filter((c) => c.name.startsWith('anatomy-network-node:'));
      expect(edgeMeshes).toHaveLength(network.edges.length);
      expect(hubMeshes).toHaveLength(network.nodes.filter((n) => n.hub).length);
      built.dispose();
    }
  });

  it('every built edge mesh has a finite, non-degenerate transform (no NaN position/scale slipping through)', () => {
    const built = buildAnatomyNetworkGroup(THREE, buildVascularNetwork(manifest));
    for (const mesh of built.group.children) {
      expect(Number.isFinite(mesh.position.x) && Number.isFinite(mesh.position.y) && Number.isFinite(mesh.position.z), mesh.name).toBe(true);
      expect(Number.isFinite(mesh.scale.x) && Number.isFinite(mesh.scale.y) && Number.isFinite(mesh.scale.z), mesh.name).toBe(true);
    }
    built.dispose();
  });

  it('the group starts hidden — a caller must explicitly turn a layer on, it is never visible by default', () => {
    const built = buildAnatomyNetworkGroup(THREE, buildVascularNetwork(manifest));
    expect(built.group.visible).toBe(false);
    built.dispose();
  });

  it('is deterministic: two builds from the same network produce the same mesh count and names, in the same order', () => {
    const network = buildNeuralNetwork(manifest);
    const a = buildAnatomyNetworkGroup(THREE, network);
    const b = buildAnatomyNetworkGroup(THREE, network);
    expect(a.group.children.map((c) => c.name)).toEqual(b.group.children.map((c) => c.name));
    a.dispose(); b.dispose();
  });
});
