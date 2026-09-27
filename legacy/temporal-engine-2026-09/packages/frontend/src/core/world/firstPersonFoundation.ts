import type { EntityRef } from '../events/genesisEvent';
import type { WorldPosition } from './experienceFoundation';

export const FIRST_PERSON_CONTRACT_VERSION = '0.1.0';

export interface FirstPersonConfig {
  eyeHeightMeters: number;
  capsuleRadiusMeters: number;
  walkSpeedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
  decelerationMetersPerSecondSquared: number;
  gravityMetersPerSecondSquared: number;
  maxLookPitchRadians: number;
  lookSensitivityRadiansPerPixel: number;
  interactionDistanceMeters: number;
}

export const DEFAULT_FIRST_PERSON_CONFIG: FirstPersonConfig = {
  eyeHeightMeters: 1.7,
  capsuleRadiusMeters: 0.3,
  walkSpeedMetersPerSecond: 1.4,
  accelerationMetersPerSecondSquared: 8,
  decelerationMetersPerSecondSquared: 10,
  gravityMetersPerSecondSquared: 9.81,
  maxLookPitchRadians: Math.PI * 0.49,
  lookSensitivityRadiansPerPixel: 0.0025,
  interactionDistanceMeters: 3,
};

export interface FirstPersonInput {
  moveForward: number;
  moveRight: number;
  lookDeltaX: number;
  lookDeltaY: number;
  jump: boolean;
}

export interface FirstPersonState {
  position: WorldPosition;
  velocity: WorldPosition;
  yawRadians: number;
  pitchRadians: number;
  grounded: boolean;
}

export interface CollisionResolution {
  position: WorldPosition;
  velocity: WorldPosition;
  grounded: boolean;
}

/** Replaceable collision/gravity boundary. The controller owns no world geometry. */
export interface FirstPersonCollisionBoundary {
  resolve(previous: FirstPersonState, desired: FirstPersonState, radiusMeters: number): CollisionResolution;
  groundHeightAt?(position: WorldPosition): number | null;
  canOccupy?(position: WorldPosition, radiusMeters: number): boolean;
}

export interface FirstPersonEyePose {
  position: WorldPosition;
  forward: WorldPosition;
  yawRadians: number;
  pitchRadians: number;
}

export interface InteractionRay {
  origin: WorldPosition;
  direction: WorldPosition;
  maxDistanceMeters: number;
}

export interface FirstPersonInteractionIntent {
  kind: 'LOOK_AT' | 'INSPECT' | 'SELECT' | 'APPROACH' | 'OPEN' | 'CLOSE' | 'ACTIVATE' | 'MEASURE' | 'OBSERVE';
  target: EntityRef | null;
  ray: InteractionRay;
  tick: number;
}

export interface FirstPersonSpawnPoint {
  position: WorldPosition;
  yawRadians?: number;
  pitchRadians?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function length2(x: number, z: number): number {
  return Math.hypot(x, z);
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(current + amount, target);
  if (current > target) return Math.max(current - amount, target);
  return current;
}

function normalize(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clonePosition(position: WorldPosition): WorldPosition {
  return { x: position.x, y: position.y, z: position.z };
}

/**
 * Deterministic first-person movement state. It is intentionally renderer- and
 * physics-library-independent so a WebGL, WebGPU or native adapter can own
 * the actual collision implementation later.
 */
export class FirstPersonController {
  readonly config: FirstPersonConfig;
  readonly spawn: FirstPersonSpawnPoint;
  private current: FirstPersonState;

  constructor(spawn: FirstPersonSpawnPoint, config: Partial<FirstPersonConfig> = {}) {
    this.spawn = { ...spawn };
    this.config = { ...DEFAULT_FIRST_PERSON_CONFIG, ...config };
    this.current = {
      position: clonePosition(spawn.position),
      velocity: { x: 0, y: 0, z: 0 },
      yawRadians: spawn.yawRadians ?? 0,
      pitchRadians: clamp(spawn.pitchRadians ?? 0, -this.config.maxLookPitchRadians, this.config.maxLookPitchRadians),
      grounded: false,
    };
  }

  get state(): FirstPersonState {
    return {
      position: clonePosition(this.current.position),
      velocity: clonePosition(this.current.velocity),
      yawRadians: this.current.yawRadians,
      pitchRadians: this.current.pitchRadians,
      grounded: this.current.grounded,
    };
  }

  get eyePose(): FirstPersonEyePose {
    const forward = this.forwardVector();
    return {
      position: { ...this.current.position, y: this.current.position.y + this.config.eyeHeightMeters },
      forward,
      yawRadians: this.current.yawRadians,
      pitchRadians: this.current.pitchRadians,
    };
  }

  reset(spawn: FirstPersonSpawnPoint = this.spawn): void {
    this.current = {
      position: clonePosition(spawn.position),
      velocity: { x: 0, y: 0, z: 0 },
      yawRadians: spawn.yawRadians ?? 0,
      pitchRadians: clamp(spawn.pitchRadians ?? 0, -this.config.maxLookPitchRadians, this.config.maxLookPitchRadians),
      grounded: false,
    };
  }

  teleport(spawn: FirstPersonSpawnPoint, boundary?: FirstPersonCollisionBoundary): boolean {
    const position = clonePosition(spawn.position);
    if (boundary?.canOccupy && !boundary.canOccupy(position, this.config.capsuleRadiusMeters)) return false;
    this.reset(spawn);
    return true;
  }

  update(input: FirstPersonInput, deltaSeconds: number, boundary: FirstPersonCollisionBoundary): FirstPersonState {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.state;
    const dt = Math.min(deltaSeconds, 0.1);
    const moveForward = clamp(normalize(input.moveForward), -1, 1);
    const moveRight = clamp(normalize(input.moveRight), -1, 1);
    const inputLength = length2(moveRight, moveForward);
    const inputScale = inputLength > 1 ? 1 / inputLength : 1;
    const forward = { x: Math.sin(this.current.yawRadians), z: Math.cos(this.current.yawRadians) };
    const right = { x: Math.cos(this.current.yawRadians), z: -Math.sin(this.current.yawRadians) };
    const targetX = (forward.x * moveForward + right.x * moveRight) * inputScale * this.config.walkSpeedMetersPerSecond;
    const targetZ = (forward.z * moveForward + right.z * moveRight) * inputScale * this.config.walkSpeedMetersPerSecond;
    const horizontalRate = inputLength > 0 ? this.config.accelerationMetersPerSecondSquared : this.config.decelerationMetersPerSecondSquared;

    this.current.yawRadians += normalize(input.lookDeltaX) * this.config.lookSensitivityRadiansPerPixel;
    this.current.pitchRadians = clamp(
      this.current.pitchRadians + normalize(input.lookDeltaY) * this.config.lookSensitivityRadiansPerPixel,
      -this.config.maxLookPitchRadians,
      this.config.maxLookPitchRadians,
    );
    const jumpVelocity = input.jump && this.current.grounded ? 4.43 : 0;
    const desired: FirstPersonState = {
      ...this.current,
      position: {
        x: this.current.position.x + approach(this.current.velocity.x, targetX, horizontalRate * dt) * dt,
        y: this.current.position.y + (jumpVelocity === 0 ? this.current.velocity.y : jumpVelocity) * dt,
        z: this.current.position.z + approach(this.current.velocity.z, targetZ, horizontalRate * dt) * dt,
      },
      velocity: {
        x: approach(this.current.velocity.x, targetX, horizontalRate * dt),
        y: jumpVelocity === 0 ? this.current.velocity.y - this.config.gravityMetersPerSecondSquared * dt : jumpVelocity,
        z: approach(this.current.velocity.z, targetZ, horizontalRate * dt),
      },
      grounded: false,
    };
    const resolved = boundary.resolve(this.current, desired, this.config.capsuleRadiusMeters);
    this.current = {
      ...desired,
      position: clonePosition(resolved.position),
      velocity: clonePosition(resolved.velocity),
      grounded: resolved.grounded,
    };
    return this.state;
  }

  interactionRay(): InteractionRay {
    const eye = this.eyePose;
    return { origin: eye.position, direction: eye.forward, maxDistanceMeters: this.config.interactionDistanceMeters };
  }

  buildInteractionIntent(kind: FirstPersonInteractionIntent['kind'], tick: number, target: EntityRef | null = null): FirstPersonInteractionIntent {
    return { kind, target, ray: this.interactionRay(), tick };
  }

  private forwardVector(): WorldPosition {
    const cosPitch = Math.cos(this.current.pitchRadians);
    return {
      x: Math.sin(this.current.yawRadians) * cosPitch,
      y: Math.sin(this.current.pitchRadians),
      z: Math.cos(this.current.yawRadians) * cosPitch,
    };
  }
}

/** Flat floor boundary useful for demos and tests; it does not simulate a world. */
export class FlatGroundBoundary implements FirstPersonCollisionBoundary {
  constructor(readonly groundY = 0) {}

  resolve(_previous: FirstPersonState, desired: FirstPersonState, _radiusMeters: number): CollisionResolution {
    if (desired.position.y <= this.groundY) {
      return {
        position: { ...desired.position, y: this.groundY },
        velocity: { ...desired.velocity, y: 0 },
        grounded: true,
      };
    }
    return { position: desired.position, velocity: desired.velocity, grounded: false };
  }

  groundHeightAt(_position: WorldPosition): number {
    return this.groundY;
  }
}
