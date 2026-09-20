import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCanonicalLaboratoryGeometry } from '../core/three/canonicalLaboratoryGeometry';
import { GENESIS_LAB_DOORS, GENESIS_LAB_ROOMS } from '../core/scientificWorlds/canonicalLaboratory';

function material() { return new THREE.MeshStandardMaterial(); }

describe('canonical laboratory geometry — real three.js meshes for all 7 rooms and 6 doors', () => {
  it('builds one floor, one ceiling and one label per room, matching the data layer\'s own room list', () => {
    const { group, rooms } = createCanonicalLaboratoryGeometry(THREE, { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material() });
    expect(rooms.map((r) => r.id)).toEqual(GENESIS_LAB_ROOMS.map((r) => r.id));
    for (const r of rooms) {
      expect(group.getObjectByName(`lab:room:${r.id}:floor`)).toBeTruthy();
      expect(group.getObjectByName(`lab:room:${r.id}:ceiling`)).toBeTruthy();
      expect(group.getObjectByName(`lab:room:${r.id}:label`)).toBeTruthy();
    }
  });

  it('every mesh has a finite, non-degenerate position (no NaN slipping through the wall-segment math)', () => {
    const { group } = createCanonicalLaboratoryGeometry(THREE, { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material() });
    group.traverse((o) => {
      expect(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z), o.name).toBe(true);
    });
  });

  it('leaves a real gap at every door (no wall segment spans across a door center)', () => {
    const { group } = createCanonicalLaboratoryGeometry(THREE, { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material() });
    const box = new THREE.Box3();
    for (const door of GENESIS_LAB_DOORS) {
      const p = new THREE.Vector3(door.center.x, 1.2, door.center.z);
      let blocked = false;
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        // Only wall/frame geometry can legitimately block a door; floors/ceilings/labels/lights/glass do not.
        if (mesh.name.includes(':floor') || mesh.name.includes(':ceiling') || mesh.name.includes(':label') || mesh.name.includes(':light') || mesh.name.includes(':glass')) return;
        box.setFromObject(mesh);
        if (box.containsPoint(p)) blocked = true;
      });
      expect(blocked, door.id).toBe(false);
    }
  });

  it('door glazing is built only when a glassMaterial is supplied — one panel per (room, door) pairing, since each door is listed under both the rooms it connects', () => {
    const withoutGlass = createCanonicalLaboratoryGeometry(THREE, { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material() });
    expect(withoutGlass.group.children.filter((c) => c.name.endsWith(':glass'))).toHaveLength(0);

    const withGlass = createCanonicalLaboratoryGeometry(THREE, { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material(), glassMaterial: material() });
    expect(withGlass.group.children.filter((c) => c.name.endsWith(':glass'))).toHaveLength(GENESIS_LAB_DOORS.length * 2);
  });

  it('is deterministic: two builds produce the same mesh names in the same order', () => {
    const opts = { floorMaterial: material(), wallMaterial: material(), ceilingMaterial: material(), frameMaterial: material() };
    const a = createCanonicalLaboratoryGeometry(THREE, opts);
    const b = createCanonicalLaboratoryGeometry(THREE, opts);
    expect(a.group.children.map((c) => c.name)).toEqual(b.group.children.map((c) => c.name));
  });
});
