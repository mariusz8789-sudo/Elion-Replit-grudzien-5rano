import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAtomSphere, createBond, elementStyleOf, ELEMENT_STYLE, DEFAULT_ELEMENT_STYLE } from '../core/three/graphics/moleculeKit';

describe('elementStyleOf', () => {
  it('returns the real CPK entry for a known element, case-insensitively', () => {
    expect(elementStyleOf('C')).toEqual(ELEMENT_STYLE.C);
    expect(elementStyleOf('c')).toEqual(ELEMENT_STYLE.C);
    expect(elementStyleOf('Cl')).toEqual(ELEMENT_STYLE.CL);
  });

  it('falls back to a real, visible default for an element outside the table — never invents a per-element guess', () => {
    expect(elementStyleOf('Xx')).toEqual(DEFAULT_ELEMENT_STYLE);
  });
});

describe('createAtomSphere', () => {
  it('builds a sphere at local origin, sized/colored by the real element style', () => {
    const atom = createAtomSphere(THREE, { element: 'O' });
    expect(atom.position.toArray()).toEqual([0, 0, 0]);
    const geometry = atom.geometry as THREE.SphereGeometry;
    expect(geometry.parameters.radius).toBeCloseTo(ELEMENT_STYLE.O.radius);
    const material = atom.material as THREE.MeshStandardMaterial;
    expect(material.color.getHex()).toBe(ELEMENT_STYLE.O.color);
  });

  it('reuses a caller-supplied shared material instance instead of always creating one', () => {
    const shared = new THREE.MeshStandardMaterial({ color: 0x123456 });
    const atom = createAtomSphere(THREE, { element: 'C', material: shared });
    expect(atom.material).toBe(shared);
  });

  it('an explicit radius override wins over the element table', () => {
    const atom = createAtomSphere(THREE, { element: 'H', radius: 0.5 });
    expect((atom.geometry as THREE.SphereGeometry).parameters.radius).toBe(0.5);
  });
});

describe('createBond', () => {
  const mat = () => new THREE.MeshStandardMaterial();

  it('a single bond is exactly one real cylinder run between the two world points', () => {
    const bond = createBond(THREE, { from: [0, 0, 0], to: [0, 0, 2], order: 1, material: mat() });
    expect(bond.children).toHaveLength(1);
    const cyl = bond.children[0] as THREE.Mesh;
    expect(cyl.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    // createPipe centers the cylinder at the midpoint of from/to.
    expect(cyl.position.toArray()).toEqual([0, 0, 1]);
  });

  it('a double bond is two parallel cylinders, offset apart (not overlapping)', () => {
    const bond = createBond(THREE, { from: [0, 0, 0], to: [0, 0, 2], order: 2, material: mat() });
    expect(bond.children).toHaveLength(2);
    const [a, b] = bond.children as THREE.Mesh[];
    expect(a.position.distanceTo(b.position)).toBeGreaterThan(0);
    // Both strands still run the same real length as the single-bond case.
    for (const strand of [a, b]) expect(strand.position.z).toBeCloseTo(1);
  });

  it('a triple bond is three parallel cylinders, centered on the bond axis', () => {
    const bond = createBond(THREE, { from: [0, 0, 0], to: [0, 0, 2], order: 3, material: mat() });
    expect(bond.children).toHaveLength(3);
    // The middle strand sits exactly on the axis (no lateral offset).
    const positions = (bond.children as THREE.Mesh[]).map((m) => new THREE.Vector2(m.position.x, m.position.y).length());
    expect(Math.min(...positions)).toBeCloseTo(0, 5);
  });

  it('an aromatic bond is ONE cylinder in a distinct material — never a fake fractional stick count', () => {
    const aromaticMat = new THREE.MeshStandardMaterial({ color: 0x00ffaa });
    const bond = createBond(THREE, { from: [0, 0, 0], to: [1, 0, 0], order: 1.5, aromatic: true, material: mat(), aromaticMaterial: aromaticMat });
    expect(bond.children).toHaveLength(1);
    expect((bond.children[0] as THREE.Mesh).material).toBe(aromaticMat);
  });

  it('aromatic wins over order even if a caller passes a numeric order alongside it', () => {
    const bond = createBond(THREE, { from: [0, 0, 0], to: [1, 0, 0], order: 2, aromatic: true, material: mat() });
    expect(bond.children).toHaveLength(1); // not 2 — aromatic is checked first
  });

  it('throws on a zero-length bond rather than silently producing degenerate geometry (inherited from createPipe)', () => {
    expect(() => createBond(THREE, { from: [0, 0, 0], to: [0, 0, 0], order: 1, material: mat() })).toThrow();
  });
});
