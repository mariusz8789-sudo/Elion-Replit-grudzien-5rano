import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRST_PERSON_CONFIG,
  FirstPersonController,
  FlatGroundBoundary,
} from '../core/world/firstPersonFoundation';
import {
  DirectWorldCameraEventBridge,
  WorldCameraController,
  type WorldCameraPose,
} from '../core/world/cameraFoundation';

const pose = (z: number): WorldCameraPose => ({
  position: { x: 2, y: 2, z },
  target: { x: 2, y: 2, z: z + 1 },
  up: { x: 0, y: 1, z: 0 },
  fovDegrees: 70,
});

describe('first-person experience foundation', () => {
  it('uses metric-scale movement, grounding and acceleration without owning world physics', () => {
    const controller = new FirstPersonController({ position: { x: 0, y: 0, z: 0 } });
    const boundary = new FlatGroundBoundary();
    const first = controller.update({ moveForward: 1, moveRight: 0, lookDeltaX: 0, lookDeltaY: 0, jump: false }, 0.1, boundary);
    expect(first.position.z).toBeGreaterThan(0);
    expect(first.position.y).toBe(0);
    expect(first.grounded).toBe(true);
    expect(first.velocity.z).toBeGreaterThan(0);
    expect(DEFAULT_FIRST_PERSON_CONFIG.eyeHeightMeters).toBe(1.7);
    expect(DEFAULT_FIRST_PERSON_CONFIG.walkSpeedMetersPerSecond).toBe(1.4);
  });

  it('clamps human look, exposes an interaction ray and supports jump only from ground', () => {
    const controller = new FirstPersonController({ position: { x: 0, y: 0, z: 0 }, yawRadians: 0 });
    const boundary = new FlatGroundBoundary();
    controller.update({ moveForward: 0, moveRight: 0, lookDeltaX: 40, lookDeltaY: -10000, jump: false }, 0.1, boundary);
    const ray = controller.interactionRay();
    expect(ray.origin.y).toBeCloseTo(1.7);
    expect(ray.maxDistanceMeters).toBe(3);
    expect(Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z)).toBeCloseTo(1);
    expect(controller.state.pitchRadians).toBe(-DEFAULT_FIRST_PERSON_CONFIG.maxLookPitchRadians);
    const jumped = controller.update({ moveForward: 0, moveRight: 0, lookDeltaX: 0, lookDeltaY: 0, jump: true }, 0.1, boundary);
    expect(jumped.velocity.y).toBeGreaterThan(0);
  });

  it('rejects an occupied teleport and accepts a valid respawn', () => {
    const controller = new FirstPersonController({ position: { x: 0, y: 0, z: 0 } });
    const boundary = new FlatGroundBoundary();
    const rejectingBoundary = { resolve: boundary.resolve.bind(boundary), canOccupy: () => false };
    expect(controller.teleport({ position: { x: 5, y: 0, z: 5 } }, rejectingBoundary)).toBe(false);
    expect(controller.state.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(controller.teleport({ position: { x: 5, y: 0, z: 5 }, yawRadians: 1 }, boundary)).toBe(true);
    expect(controller.state.position).toEqual({ x: 5, y: 0, z: 5 });
    expect(controller.state.yawRadians).toBe(1);
  });
});

describe('world camera foundation', () => {
  it('transitions from human eye to a scientific camera and returns without rebuilding the scene', () => {
    const cameras = new WorldCameraController();
    const requested = cameras.request({
      cameraId: 'MACRO',
      pose: pose(9),
      targetRef: { kind: 'facility', id: 'hospital' },
      reason: 'Observe the selected scientific entity.',
      triggerEventId: 'event-9',
    }, { durationSeconds: 1 });
    expect(requested.cameraId).toBe('MACRO');
    expect(requested.status).toBe('TRANSITIONING');
    expect(requested.targetRef).toEqual({ kind: 'facility', id: 'hospital' });
    const halfway = cameras.update(0.5);
    expect(halfway.pose.position.z).toBeCloseTo(4.5);
    expect(halfway.status).toBe('TRANSITIONING');
    const finished = cameras.update(0.5);
    expect(finished.pose.position.z).toBe(9);
    expect(finished.status).toBe('IDLE');
    cameras.setHumanEyePose(pose(1), { durationSeconds: 0 });
    expect(cameras.state.cameraId).toBe('HUMAN_EYE');
    expect(cameras.state.pose.position.z).toBe(1);
  });

  it('preserves event provenance when an existing scientific event requests a camera', () => {
    const cameras = new WorldCameraController();
    const bridge = new DirectWorldCameraEventBridge(cameras);
    const state = bridge.requestFromEvent({
      eventId: 'genesis-event-42',
      camera: {
        cameraId: 'SCIENTIFIC',
        pose: pose(4),
        targetRef: null,
        reason: 'Existing event requests an observation frame.',
        triggerEventId: null,
      },
    });
    expect(state.cameraId).toBe('SCIENTIFIC');
    expect(state.triggerEventId).toBe('genesis-event-42');
    expect(state.reason).toContain('Existing event');
  });
});
