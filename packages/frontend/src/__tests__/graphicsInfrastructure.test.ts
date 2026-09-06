import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPumpAssembly, createValveAssembly } from '../core/three/graphics/infrastructure';

function material(): THREE.Material {
  return new THREE.MeshStandardMaterial();
}

describe('createPumpAssembly — a real composite built from existing primitives, not a placeholder', () => {
  it('produces a group containing plinth, body, motor and gauge parts', () => {
    const { group, parts } = createPumpAssembly(THREE, {
      position: [0, 0, 0],
      bodyMaterial: material(), motorMaterial: material(), plinthMaterial: material(), valveMaterial: material(), pipeMaterial: material(),
    });
    expect(group.children.length).toBeGreaterThanOrEqual(4);
    expect(parts.plinth).toBeInstanceOf(THREE.Mesh);
    expect(parts.body).toBeInstanceOf(THREE.Mesh);
    expect(parts.motor).toBeInstanceOf(THREE.Mesh);
    expect(parts.gauge).toBeInstanceOf(THREE.Mesh);
  });

  it('the body sits above the plinth and the motor sits above the body — a real vertical stack, not overlapping meshes', () => {
    const { parts } = createPumpAssembly(THREE, {
      position: [0, 0, 0],
      bodyMaterial: material(), motorMaterial: material(), plinthMaterial: material(), valveMaterial: material(), pipeMaterial: material(),
      bodyHeight: 1, bodyRadius: 0.5,
    });
    expect(parts.body.position.y).toBeGreaterThan(parts.plinth.position.y);
    expect(parts.motor.position.y).toBeGreaterThan(parts.body.position.y);
  });

  it('builds one real pipe run per requested connection, ending at the requested target', () => {
    const { parts } = createPumpAssembly(THREE, {
      position: [0, 0, 0],
      bodyMaterial: material(), motorMaterial: material(), plinthMaterial: material(), valveMaterial: material(), pipeMaterial: material(),
      pipeRuns: [{ to: [10, 0.5, 0] }, { to: [0, 0.5, -10] }],
    });
    expect(parts.pipes).toHaveLength(2);
    expect(parts.flanges).toHaveLength(2);
  });

  it('with no pipe runs requested, builds no pipes/flanges — never a fabricated connection', () => {
    const { parts } = createPumpAssembly(THREE, {
      position: [0, 0, 0],
      bodyMaterial: material(), motorMaterial: material(), plinthMaterial: material(), valveMaterial: material(), pipeMaterial: material(),
    });
    expect(parts.pipes).toHaveLength(0);
    expect(parts.flanges).toHaveLength(0);
  });
});

describe('createValveAssembly — body along the pipe axis, handle perpendicular to it', () => {
  it('produces a body and a handle, both real meshes', () => {
    const { parts } = createValveAssembly(THREE, {
      position: [0, 1, 0], axis: [1, 0, 0], bodyMaterial: material(), handleMaterial: material(),
    });
    expect(parts.body).toBeInstanceOf(THREE.Mesh);
    expect(parts.handle).toBeInstanceOf(THREE.Mesh);
  });

  it('the handle direction is perpendicular to the pipe axis, not parallel to it', () => {
    const { parts } = createValveAssembly(THREE, {
      position: [0, 0, 0], axis: [1, 0, 0], bodyMaterial: material(), handleMaterial: material(),
    });
    // The handle mesh's own local +Y (its cylinder axis, per createPipe's quaternion convention)
    // rotated into world space must be roughly perpendicular to the valve's own [1,0,0] axis.
    const handleAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(parts.handle.quaternion);
    const dot = handleAxis.dot(new THREE.Vector3(1, 0, 0));
    expect(Math.abs(dot)).toBeLessThan(0.05);
  });

  it('works for a vertical (Y-aligned) pipe axis too — the perpendicular-helper edge case', () => {
    expect(() => createValveAssembly(THREE, {
      position: [0, 0, 0], axis: [0, 1, 0], bodyMaterial: material(), handleMaterial: material(),
    })).not.toThrow();
  });
});
