/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMERA_ROOF_CLEARANCE,
  DEFAULT_FOCUS_DIRECTION,
  focusCameraPosition,
  isPointInsideOccluder,
  resolveSafeFocusDirection,
  type CameraOccluder,
} from '../core/three/cityCameraSafety';

/**
 * CITY3D CAMERA FOCUS SAFETY.
 *
 * The defect these tests pin down was measured on the live base
 * (`manus/high-fidelity-epidemic-digital-twin` @ 66ed598) by reproducing the
 * renderer's own focus maths: for the `'agent'` preset used by the
 * "Ostatnia transmisja" action, the camera sits at y ≈ 1.6893 and ≈ 1.6486
 * horizontally from the tracked agent, while the tallest visual-context
 * buildings top out at 1.70 — roughly 0.011 of clearance. Following a moving
 * agent past such a building put the camera INSIDE the building volume on
 * real frames (seed 31337: 3 of 400 tracked frames, deepest penetration
 * 0.093 world units).
 */

const AGENT_FOCUS_DISTANCE = 1.85;
const AGENT_FOCUS_HEIGHT = 0.85;

/** The exact volume the reproduction found the camera inside, from the live layout. */
const BLOCKING_BUILDING: CameraOccluder = {
  centerX: -2.3633333333333333,
  centerZ: 0.96,
  halfWidth: 0.4783333333333332 / 2,
  halfDepth: 0.574 / 2,
  top: 1.70,
};

describe('camera focus safety — unguarded geometry reproduces the defect', () => {
  it('the live focus offset places the camera below the tallest roof line', () => {
    const camera = focusCameraPosition({ x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 }, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE);
    expect(camera.y).toBeCloseTo(1.6893, 3);
    expect(Math.hypot(camera.x, camera.z)).toBeCloseTo(1.6486, 3);
    // This is the defect in one number: the camera flies UNDER a 1.70 roof.
    expect(camera.y).toBeLessThan(BLOCKING_BUILDING.top);
  });

  it('reproduces a real blocked frame: the unguarded camera lands inside a building volume', () => {
    // Agent world position from the reproduction (seed 31337, frame 356).
    const target = { x: -2.226 - DEFAULT_FOCUS_DIRECTION.x * AGENT_FOCUS_DISTANCE, y: AGENT_FOCUS_HEIGHT, z: 0.766 - DEFAULT_FOCUS_DIRECTION.z * AGENT_FOCUS_DISTANCE };
    const unguarded = focusCameraPosition(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE);
    expect(unguarded.x).toBeCloseTo(-2.226, 3);
    expect(unguarded.z).toBeCloseTo(0.766, 3);
    expect(isPointInsideOccluder(unguarded, BLOCKING_BUILDING)).toBe(true);
  });
});

describe('camera focus safety — the guard', () => {
  it('lifts a blocked camera clear of the roof while keeping the focus distance', () => {
    const target = { x: -2.226 - DEFAULT_FOCUS_DIRECTION.x * AGENT_FOCUS_DISTANCE, y: AGENT_FOCUS_HEIGHT, z: 0.766 - DEFAULT_FOCUS_DIRECTION.z * AGENT_FOCUS_DISTANCE };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [BLOCKING_BUILDING]);
    expect(safe).not.toBeNull();

    const guarded = focusCameraPosition(target, safe!, AGENT_FOCUS_DISTANCE);
    expect(isPointInsideOccluder(guarded, BLOCKING_BUILDING)).toBe(false);
    expect(guarded.y).toBeGreaterThan(BLOCKING_BUILDING.top);
    // Distance is preserved: the camera rises along the same approach, it does not retreat.
    expect(Math.hypot(guarded.x - target.x, guarded.y - target.y, guarded.z - target.z)).toBeCloseTo(AGENT_FOCUS_DISTANCE, 6);
    // The returned direction is a unit vector.
    expect(Math.hypot(safe!.x, safe!.y, safe!.z)).toBeCloseTo(1, 9);
  });

  it('leaves an already-safe focus completely untouched (returns null)', () => {
    const openGround = { x: 40, y: AGENT_FOCUS_HEIGHT, z: 40 };
    expect(resolveSafeFocusDirection(openGround, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [BLOCKING_BUILDING])).toBeNull();
    // Also safe when there is simply nothing in the world.
    expect(resolveSafeFocusDirection(openGround, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [])).toBeNull();
  });

  it('keeps the horizontal bearing when it lifts the camera', () => {
    const target = { x: -2.226 - DEFAULT_FOCUS_DIRECTION.x * AGENT_FOCUS_DISTANCE, y: AGENT_FOCUS_HEIGHT, z: 0.766 - DEFAULT_FOCUS_DIRECTION.z * AGENT_FOCUS_DISTANCE };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [BLOCKING_BUILDING])!;
    const baseBearing = Math.atan2(DEFAULT_FOCUS_DIRECTION.z, DEFAULT_FOCUS_DIRECTION.x);
    expect(Math.atan2(safe.z, safe.x)).toBeCloseTo(baseBearing, 9);
    expect(safe.y).toBeGreaterThan(DEFAULT_FOCUS_DIRECTION.y);
  });

  it('handles a small and a large bounding volume across the real City3D height range', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    // Only volumes reaching above ≈1.549 can block a camera sitting at 1.6893,
    // so both fixtures use the real blocking height (1.70, the tallest
    // visual-context building) and differ in FOOTPRINT — the axis that
    // actually varies between a narrow infill block and a wide one.
    const smallFootprint: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.12, halfDepth: 0.12, top: 1.70 };
    const largeFootprint: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top: 1.70 };

    for (const occluder of [smallFootprint, largeFootprint]) {
      const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [occluder]);
      expect(safe).not.toBeNull();
      const guarded = focusCameraPosition(target, safe!, AGENT_FOCUS_DISTANCE);
      expect(isPointInsideOccluder(guarded, occluder)).toBe(false);
    }

    // A taller blocking volume must push the camera higher than a shorter one.
    const shorterBlocker: CameraOccluder = { ...largeFootprint, top: 1.60 };
    const highShort = focusCameraPosition(target, resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [shorterBlocker])!, AGENT_FOCUS_DISTANCE).y;
    const highTall = focusCameraPosition(target, resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [largeFootprint])!, AGENT_FOCUS_DISTANCE).y;
    expect(highTall).toBeGreaterThan(highShort);
  });

  it('ignores volumes too short to reach the camera, so most of the city never triggers the guard', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    // Semantic buildings (home 1.06, shop 1.24, school 1.50) all sit below the
    // camera's 1.6893 flight height once the clearance band is applied, so the
    // guard must leave every one of them alone.
    for (const top of [1.06, 1.24, 1.50]) {
      const occluder: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top };
      expect(resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [occluder])).toBeNull();
    }
  });

  it('documents the honest limit: elevation alone cannot clear a volume taller than the focus distance allows', () => {
    // This guard only changes ELEVATION, never the focus distance, so a volume
    // far taller than the focus distance cannot be cleared from this range.
    // No City3D building is anywhere near this tall (max 1.70) — the test
    // exists so the limitation is stated rather than discovered later.
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const tower: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top: 3.4 };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [tower])!;
    const guarded = focusCameraPosition(target, safe, AGENT_FOCUS_DISTANCE);
    // It still raises the camera as far as the distance permits...
    expect(guarded.y).toBeGreaterThan(focusCameraPosition(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE).y);
    // ...but honestly cannot get above a 3.4 roof from 1.85 away.
    expect(guarded.y).toBeLessThan(tower.top);
  });

  it('never returns a degenerate straight-down direction, so the agent keeps context around it', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    // A volume far taller than the focus distance can possibly clear.
    const skyscraper: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 1.5, halfDepth: 1.5, top: 40 };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [skyscraper])!;
    expect(safe).not.toBeNull();
    expect(Math.hypot(safe.x, safe.z)).toBeGreaterThan(0.1);
    expect(Math.hypot(safe.x, safe.y, safe.z)).toBeCloseTo(1, 9);
  });

  it('clears the highest blocking volume when several overlap the camera', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const shorter: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.5, halfDepth: 0.5, top: 1.72 };
    const taller: CameraOccluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.5, halfDepth: 0.5, top: 2.1 };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [shorter, taller])!;
    const guarded = focusCameraPosition(target, safe, AGENT_FOCUS_DISTANCE);
    expect(guarded.y).toBeGreaterThanOrEqual(taller.top + CAMERA_ROOF_CLEARANCE - 1e-9);
    expect(isPointInsideOccluder(guarded, taller)).toBe(false);
    expect(isPointInsideOccluder(guarded, shorter)).toBe(false);
  });

  it('is a pure function: the same inputs give the same result and no input is mutated', () => {
    const target = Object.freeze({ x: -3.4, y: AGENT_FOCUS_HEIGHT, z: 0.2 });
    const occluders = Object.freeze([BLOCKING_BUILDING]);
    const first = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, occluders);
    const second = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, occluders);
    expect(second).toEqual(first);
    expect(DEFAULT_FOCUS_DIRECTION.y).toBeCloseTo(0.72 / Math.hypot(1, 0.72, 1), 12);
  });
});

describe('camera focus safety — isolation', () => {
  it('imports nothing from Scientific Core, hazards, Evidence/Replay or a second renderer', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'core', 'three', 'cityCameraSafety.ts'), 'utf8');
    const importLines = source.match(/^import .*$/gm) ?? [];
    // A pure geometry guard needs no imports at all.
    expect(importLines).toHaveLength(0);
    for (const forbidden of [
      'epidemicCity', 'resolveContacts', 'hospitalResource', 'scenarioEngine', 'discoveryEngine',
      'evidenceStore', 'recordStore', 'hazardProvenance', 'hazardReplay', 'earthquake',
      'worldEngineContract', 'roadNetwork', 'three',
    ]) {
      expect(source.toLowerCase()).not.toContain(`from '${forbidden.toLowerCase()}`);
      expect(source.toLowerCase()).not.toContain(`/${forbidden.toLowerCase()}'`);
    }
  });
});
