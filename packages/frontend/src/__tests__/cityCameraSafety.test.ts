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

const AGENT_FOCUS_DISTANCE = 1.85;
const AGENT_FOCUS_HEIGHT = 0.85;
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
    expect(camera.y).toBeLessThan(BLOCKING_BUILDING.top);
  });

  it('reproduces a blocked frame: the unguarded camera lands inside a building volume', () => {
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
    expect(Math.hypot(guarded.x - target.x, guarded.y - target.y, guarded.z - target.z)).toBeCloseTo(AGENT_FOCUS_DISTANCE, 6);
    expect(Math.hypot(safe!.x, safe!.y, safe!.z)).toBeCloseTo(1, 9);
  });

  it('leaves an already-safe focus completely untouched', () => {
    const openGround = { x: 40, y: AGENT_FOCUS_HEIGHT, z: 40 };
    expect(resolveSafeFocusDirection(openGround, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [BLOCKING_BUILDING])).toBeNull();
    expect(resolveSafeFocusDirection(openGround, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [])).toBeNull();
  });

  it('keeps the horizontal bearing when it lifts the camera', () => {
    const target = { x: -2.226 - DEFAULT_FOCUS_DIRECTION.x * AGENT_FOCUS_DISTANCE, y: AGENT_FOCUS_HEIGHT, z: 0.766 - DEFAULT_FOCUS_DIRECTION.z * AGENT_FOCUS_DISTANCE };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [BLOCKING_BUILDING])!;
    expect(Math.atan2(safe.z, safe.x)).toBeCloseTo(Math.atan2(DEFAULT_FOCUS_DIRECTION.z, DEFAULT_FOCUS_DIRECTION.x), 9);
    expect(safe.y).toBeGreaterThan(DEFAULT_FOCUS_DIRECTION.y);
  });

  it('handles real City3D footprint and height ranges', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const small = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.12, halfDepth: 0.12, top: 1.70 } satisfies CameraOccluder;
    const large = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top: 1.70 } satisfies CameraOccluder;
    for (const occluder of [small, large]) {
      const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [occluder]);
      expect(safe).not.toBeNull();
      expect(isPointInsideOccluder(focusCameraPosition(target, safe!, AGENT_FOCUS_DISTANCE), occluder)).toBe(false);
    }
    const shorter = { ...large, top: 1.60 };
    const highShort = focusCameraPosition(target, resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [shorter])!, AGENT_FOCUS_DISTANCE).y;
    const highTall = focusCameraPosition(target, resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [large])!, AGENT_FOCUS_DISTANCE).y;
    expect(highTall).toBeGreaterThan(highShort);
  });

  it('ignores volumes too short to reach the camera', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    for (const top of [1.06, 1.24, 1.50]) {
      const occluder = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top } satisfies CameraOccluder;
      expect(resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [occluder])).toBeNull();
    }
  });

  it('documents the honest limit for a volume taller than the focus distance allows', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const tower = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.9, halfDepth: 0.9, top: 3.4 } satisfies CameraOccluder;
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [tower])!;
    const guarded = focusCameraPosition(target, safe, AGENT_FOCUS_DISTANCE);
    expect(guarded.y).toBeGreaterThan(focusCameraPosition(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE).y);
    expect(guarded.y).toBeLessThan(tower.top);
  });

  it('never returns a degenerate straight-down direction', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const skyscraper = { centerX: 1.166, centerZ: 1.166, halfWidth: 1.5, halfDepth: 1.5, top: 40 } satisfies CameraOccluder;
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [skyscraper])!;
    expect(Math.hypot(safe.x, safe.z)).toBeGreaterThan(0.1);
    expect(Math.hypot(safe.x, safe.y, safe.z)).toBeCloseTo(1, 9);
  });

  it('clears the highest blocking volume when several overlap', () => {
    const target = { x: 0, y: AGENT_FOCUS_HEIGHT, z: 0 };
    const shorter = { centerX: 1.166, centerZ: 1.166, halfWidth: 0.5, halfDepth: 0.5, top: 1.72 } satisfies CameraOccluder;
    const taller = { ...shorter, top: 2.1 };
    const safe = resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, [shorter, taller])!;
    const guarded = focusCameraPosition(target, safe, AGENT_FOCUS_DISTANCE);
    expect(guarded.y).toBeGreaterThanOrEqual(taller.top + CAMERA_ROOF_CLEARANCE - 1e-9);
    expect(isPointInsideOccluder(guarded, taller)).toBe(false);
  });

  it('is pure and deterministic', () => {
    const target = Object.freeze({ x: -3.4, y: AGENT_FOCUS_HEIGHT, z: 0.2 });
    const occluders = Object.freeze([BLOCKING_BUILDING]);
    expect(resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, occluders)).toEqual(resolveSafeFocusDirection(target, DEFAULT_FOCUS_DIRECTION, AGENT_FOCUS_DISTANCE, occluders));
  });
});

describe('camera focus safety — isolation', () => {
  it('imports nothing from scientific/hazard systems or a second renderer', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '..', 'core', 'three', 'cityCameraSafety.ts'), 'utf8');
    expect(source.match(/^import .*$/gm) ?? []).toHaveLength(0);
    for (const forbidden of ['epidemicCity', 'hazardReplay', 'earthquake', 'evidenceStore', 'recordStore', 'worldEngineContract', 'roadNetwork', 'three']) {
      expect(source.toLowerCase()).not.toContain(`from '${forbidden}'`);
      expect(source.toLowerCase()).not.toContain(`/${forbidden}'`);
    }
  });
});
