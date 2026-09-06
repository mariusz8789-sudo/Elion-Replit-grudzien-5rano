import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstancedHumanoidCrowd, HEALTH_COLORS, type HumanoidAgentState } from '../core/three/humanoidAgentVisual';

/**
 * Regression coverage for the per-frame Color-allocation fix in InstancedHumanoidCrowd.update():
 * it now reuses scratch THREE.Color fields across every instance in the loop instead of
 * allocating fresh ones. These tests exist specifically to catch the failure mode that kind of
 * refactor risks — one instance's color "bleeding" into another's because a scratch object wasn't
 * fully overwritten before being read.
 */

function state(overrides: Partial<HumanoidAgentState> = {}): HumanoidAgentState {
  return {
    id: 1,
    worldX: 0,
    worldZ: 0,
    facing: 0,
    speed: 0,
    gait: 0,
    pose: 'idle',
    health: 'S',
    behavior: 'idle',
    stateSince: 0,
    isolated: false,
    hospitalized: false,
    ...overrides,
  };
}

describe('InstancedHumanoidCrowd — per-instance color correctness after the scratch-reuse fix', () => {
  it('gives each instance its own health-marker color, matching HEALTH_COLORS exactly, with no bleed between instances', () => {
    const crowd = new InstancedHumanoidCrowd(THREE, 8);
    crowd.update([
      state({ id: 1, health: 'S' }),
      state({ id: 2, health: 'D' }),
      state({ id: 3, health: 'I' }),
    ]);

    const readColor = (mesh: THREE.InstancedMesh, index: number) => {
      const c = new THREE.Color();
      mesh.getColorAt(index, c);
      return c.getHex();
    };

    // status/aura receive the raw `health` color untouched by any lerp — the strongest possible
    // check that instance 1's color computation didn't leak into instance 0's or 2's.
    expect(readColor(crowd.status, 0)).toBe(new THREE.Color(HEALTH_COLORS.S).getHex());
    expect(readColor(crowd.status, 1)).toBe(new THREE.Color(HEALTH_COLORS.D).getHex());
    expect(readColor(crowd.status, 2)).toBe(new THREE.Color(HEALTH_COLORS.I).getHex());
  });

  it('produces different torso (shirt) colors for a healthy vs. a deceased agent sharing the same palette seed', () => {
    const crowd = new InstancedHumanoidCrowd(THREE, 8);
    // Same id -> same base palette (paletteFromSeed(id+1)) -> any torso color difference below is
    // caused ONLY by the health-tint lerp, isolating exactly the logic this fix touches.
    crowd.update([state({ id: 5, health: 'S' })]);
    const healthy = new THREE.Color();
    crowd.torso.getColorAt(0, healthy);

    crowd.update([state({ id: 5, health: 'D' })]);
    const deceased = new THREE.Color();
    crowd.torso.getColorAt(0, deceased);

    expect(healthy.getHex()).not.toBe(deceased.getHex());
  });

  it('uses the same constant ground-shadow color for every instance', () => {
    const crowd = new InstancedHumanoidCrowd(THREE, 8);
    crowd.update([state({ id: 1, health: 'S' }), state({ id: 2, health: 'D' })]);
    const a = new THREE.Color();
    const b = new THREE.Color();
    crowd.groundShadow.getColorAt(0, a);
    crowd.groundShadow.getColorAt(1, b);
    expect(a.getHex()).toBe(b.getHex());
    expect(a.getHex()).toBe(new THREE.Color(0x152331).getHex());
  });

  it('re-running update() with fewer states does not leave stale colors on out-of-range instances (count is trimmed)', () => {
    const crowd = new InstancedHumanoidCrowd(THREE, 8);
    crowd.update([state({ id: 1 }), state({ id: 2 }), state({ id: 3 })]);
    crowd.update([state({ id: 1 })]);
    expect(crowd.torso.count).toBe(1);
  });
});
