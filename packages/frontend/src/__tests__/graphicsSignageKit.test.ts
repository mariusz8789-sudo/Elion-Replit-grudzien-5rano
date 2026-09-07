import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPostSign, createWallSign, createHangingSign } from '../core/three/graphics/signageKit';

function material() {
  return new THREE.MeshStandardMaterial();
}

describe('createPostSign', () => {
  it('builds a post and a panel', () => {
    const sign = createPostSign(THREE, {
      position: [0, 0, 0], panelWidth: 0.6, panelHeight: 0.6, postMaterial: material(), panelMaterial: material(),
    });
    expect(sign.group.children).toHaveLength(2);
    expect(sign.group.name).toBe('genesis-post-sign');
  });

  it('the post height reaches exactly the panel\'s own top edge', () => {
    const panelCenterHeight = 1.1;
    const panelHeight = 0.6;
    const sign = createPostSign(THREE, {
      position: [0, 0, 0], panelWidth: 0.6, panelHeight, panelCenterHeight, postMaterial: material(), panelMaterial: material(),
    });
    const post = sign.group.children[0] as THREE.Mesh;
    const postGeometry = post.geometry as THREE.CylinderGeometry;
    const postTopY = post.position.y + postGeometry.parameters.height / 2;
    expect(postTopY).toBeCloseTo(panelCenterHeight + panelHeight / 2, 5);
  });

  it('is positioned and rotated relative to a non-origin position/heading', () => {
    const sign = createPostSign(THREE, {
      position: [4, 0, -2], headingRadians: Math.PI / 2, panelWidth: 0.5, panelHeight: 0.5, postMaterial: material(), panelMaterial: material(),
    });
    expect(sign.group.position.x).toBe(4);
    expect(sign.group.position.z).toBe(-2);
    expect(sign.group.rotation.y).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('createWallSign', () => {
  it('builds a single thin box panel offset outward from the wall by half its thickness', () => {
    const sign = createWallSign(THREE, { position: [0, 1, 0], width: 0.8, height: 0.3, thickness: 0.04, material: material() });
    expect(sign).toBeInstanceOf(THREE.Mesh);
    expect(sign.position.z).toBeCloseTo(0.02, 5); // heading 0 -> +Z normal, offset by half thickness
  });

  it('offsets along the correct axis when facing a different heading', () => {
    const sign = createWallSign(THREE, { position: [0, 1, 0], headingRadians: Math.PI / 2, width: 0.8, height: 0.3, thickness: 0.04, material: material() });
    expect(Math.abs(sign.position.x)).toBeCloseTo(0.02, 5);
    expect(sign.position.z).toBeCloseTo(0, 5);
  });
});

describe('createHangingSign', () => {
  it('builds a bracket arm, a hanger drop, and a panel', () => {
    const sign = createHangingSign(THREE, {
      position: [0, 2, 0], armLength: 0.5, dropHeight: 0.3, panelWidth: 0.6, panelHeight: 0.4,
      bracketMaterial: material(), panelMaterial: material(),
    });
    expect(sign.group.children).toHaveLength(3); // arm + panel + hanger drop
  });

  it('omits the hanger drop segment when dropHeight is ~0 (would otherwise be a zero-length pipe)', () => {
    const sign = createHangingSign(THREE, {
      position: [0, 2, 0], armLength: 0.5, dropHeight: 0, panelWidth: 0.6, panelHeight: 0.4,
      bracketMaterial: material(), panelMaterial: material(),
    });
    expect(sign.group.children).toHaveLength(2); // arm + panel only
  });

  it('the panel hangs at the bracket\'s real outer end, not an independently-guessed position', () => {
    const armLength = 0.7;
    const sign = createHangingSign(THREE, {
      position: [1, 2, 3], headingRadians: 0, armLength, dropHeight: 0.2, panelWidth: 0.6, panelHeight: 0.4,
      bracketMaterial: material(), panelMaterial: material(),
    });
    const panel = sign.group.children[1] as THREE.Mesh;
    expect(panel.position.x).toBeCloseTo(1, 5);
    expect(panel.position.z).toBeCloseTo(3 + armLength, 5);
  });
});
