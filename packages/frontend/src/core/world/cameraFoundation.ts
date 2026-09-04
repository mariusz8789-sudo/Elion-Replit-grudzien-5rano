import type { EntityRef } from '../events/genesisEvent';
import type { WorldPosition } from './experienceFoundation';

export const WORLD_CAMERA_CONTRACT_VERSION = '0.1.0';

export type WorldCameraId = 'HUMAN_EYE' | 'WIDE' | 'MACRO' | 'UNDERWATER' | 'INSTRUMENT' | 'SCIENTIFIC' | 'CINEMATIC';
export type CameraTransitionStatus = 'IDLE' | 'TRANSITIONING';

export interface WorldCameraPose {
  position: WorldPosition;
  target: WorldPosition;
  up: WorldPosition;
  fovDegrees: number;
}

export interface WorldCameraRequest {
  cameraId: WorldCameraId;
  pose: WorldCameraPose;
  targetRef: EntityRef | null;
  reason: string;
  triggerEventId: string | null;
}

export interface WorldCameraTransition {
  from: WorldCameraPose;
  to: WorldCameraPose;
  durationSeconds: number;
  elapsedSeconds: number;
}

export interface WorldCameraState {
  cameraId: WorldCameraId;
  pose: WorldCameraPose;
  targetRef: EntityRef | null;
  status: CameraTransitionStatus;
  reason: string;
  triggerEventId: string | null;
}

export interface CameraTransitionOptions {
  durationSeconds?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clonePosition(value: WorldPosition): WorldPosition {
  return { x: value.x, y: value.y, z: value.z };
}

function clonePose(pose: WorldCameraPose): WorldCameraPose {
  return {
    position: clonePosition(pose.position),
    target: clonePosition(pose.target),
    up: clonePosition(pose.up),
    fovDegrees: pose.fovDegrees,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPosition(a: WorldPosition, b: WorldPosition, t: number): WorldPosition {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function lerpPose(a: WorldCameraPose, b: WorldCameraPose, t: number): WorldCameraPose {
  return {
    position: lerpPosition(a.position, b.position, t),
    target: lerpPosition(a.target, b.target, t),
    up: lerpPosition(a.up, b.up, t),
    fovDegrees: lerp(a.fovDegrees, b.fovDegrees, t),
  };
}

/** A small human-eye default pose; callers should replace it with the player pose. */
export const DEFAULT_HUMAN_EYE_POSE: WorldCameraPose = {
  position: { x: 0, y: 1.7, z: 0 },
  target: { x: 0, y: 1.7, z: 1 },
  up: { x: 0, y: 1, z: 0 },
  fovDegrees: 75,
};

/**
 * Renderer-independent camera state machine. Camera requests are inputs from
 * the experience or a scientific event; this class never invents events,
 * observations, targets or scientific camera decisions.
 */
export class WorldCameraController {
  private currentState: WorldCameraState;
  private transition: WorldCameraTransition | null = null;

  constructor(initialPose: WorldCameraPose = DEFAULT_HUMAN_EYE_POSE) {
    this.currentState = {
      cameraId: 'HUMAN_EYE',
      pose: clonePose(initialPose),
      targetRef: null,
      status: 'IDLE',
      reason: 'Initial human-eye camera.',
      triggerEventId: null,
    };
  }

  get state(): WorldCameraState {
    return {
      ...this.currentState,
      pose: clonePose(this.currentState.pose),
    };
  }

  get isTransitioning(): boolean {
    return this.transition !== null;
  }

  request(request: WorldCameraRequest, options: CameraTransitionOptions = {}): WorldCameraState {
    const durationSeconds = clamp(finite(options.durationSeconds ?? 0.35, 0.35), 0, 30);
    const targetPose = this.sanitizePose(request.pose);
    this.currentState = {
      cameraId: request.cameraId,
      pose: clonePose(this.currentState.pose),
      targetRef: request.targetRef,
      status: durationSeconds === 0 ? 'IDLE' : 'TRANSITIONING',
      reason: request.reason,
      triggerEventId: request.triggerEventId,
    };
    this.transition = durationSeconds === 0
      ? null
      : { from: clonePose(this.currentState.pose), to: targetPose, durationSeconds, elapsedSeconds: 0 };
    if (durationSeconds === 0) this.currentState.pose = targetPose;
    return this.state;
  }

  update(deltaSeconds: number): WorldCameraState {
    if (this.transition === null || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.state;
    this.transition.elapsedSeconds = Math.min(this.transition.durationSeconds, this.transition.elapsedSeconds + deltaSeconds);
    const progress = this.transition.durationSeconds === 0 ? 1 : this.transition.elapsedSeconds / this.transition.durationSeconds;
    this.currentState.pose = lerpPose(this.transition.from, this.transition.to, progress);
    if (progress >= 1) {
      this.transition = null;
      this.currentState.status = 'IDLE';
    }
    return this.state;
  }

  setHumanEyePose(pose: WorldCameraPose, options: CameraTransitionOptions = {}): WorldCameraState {
    return this.request({ cameraId: 'HUMAN_EYE', pose, targetRef: null, reason: 'Return to the replaceable first-person camera.', triggerEventId: null }, options);
  }

  cancelTransition(): WorldCameraState {
    this.transition = null;
    this.currentState.status = 'IDLE';
    return this.state;
  }

  reset(pose: WorldCameraPose = DEFAULT_HUMAN_EYE_POSE): void {
    this.transition = null;
    this.currentState = {
      cameraId: 'HUMAN_EYE',
      pose: clonePose(pose),
      targetRef: null,
      status: 'IDLE',
      reason: 'Camera reset.',
      triggerEventId: null,
    };
  }

  private sanitizePose(pose: WorldCameraPose): WorldCameraPose {
    return {
      position: { x: finite(pose.position.x, 0), y: finite(pose.position.y, 0), z: finite(pose.position.z, 0) },
      target: { x: finite(pose.target.x, 0), y: finite(pose.target.y, 0), z: finite(pose.target.z, 0) },
      up: { x: finite(pose.up.x, 0), y: finite(pose.up.y, 1), z: finite(pose.up.z, 0) },
      fovDegrees: clamp(finite(pose.fovDegrees, 75), 20, 120),
    };
  }
}

export interface CameraEventRequest {
  eventId: string;
  camera: WorldCameraRequest;
}

/** Explicit event-to-camera input boundary for a future ScienceDirector. */
export interface WorldCameraEventBridge {
  requestFromEvent(request: CameraEventRequest): WorldCameraState;
}

export class DirectWorldCameraEventBridge implements WorldCameraEventBridge {
  constructor(private readonly controller: WorldCameraController) {}

  requestFromEvent(request: CameraEventRequest): WorldCameraState {
    return this.controller.request({ ...request.camera, triggerEventId: request.eventId });
  }
}
