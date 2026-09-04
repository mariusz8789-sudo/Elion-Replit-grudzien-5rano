export interface FirstPersonConfig {
  eyeHeight: number;
  walkingSpeed: number;
  acceleration: number;
  deceleration: number;
  lookSensitivity: number;
  gravity: number;
  collisionRadius: number;
  interactionDistance: number;
}

export const DEFAULT_FIRST_PERSON_CONFIG: Readonly<FirstPersonConfig> = {
  eyeHeight: 1.7, walkingSpeed: 2.2, acceleration: 12, deceleration: 16,
  lookSensitivity: 0.002, gravity: 9.81, collisionRadius: 0.3, interactionDistance: 3,
};

export interface MovementInput { forward: number; strafe: number; lookX: number; lookY: number; }
export interface MovementState { x: number; y: number; z: number; velocityX: number; velocityY: number; velocityZ: number; yaw: number; pitch: number; grounded: boolean; }
export interface PlayerBody { state: MovementState; eyeHeight: number; }
export interface CollisionWorld { move(position: { x: number; y: number; z: number }, delta: { x: number; y: number; z: number }, radius: number): { position: { x: number; y: number; z: number }; grounded: boolean }; }
export interface InteractionTarget<T = string> { id: T; distance: number; }
export interface InteractionRay<T = string> { cast(origin: PlayerBody, direction: { x: number; y: number; z: number }, maxDistance: number): InteractionTarget<T> | null; }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const approach = (current: number, target: number, amount: number) => current < target ? Math.min(current + amount, target) : Math.max(current - amount, target);

/** Deterministic human-scale controller; collision is delegated to the existing world. */
export class FirstPersonController {
  readonly body: PlayerBody;
  constructor(readonly config: FirstPersonConfig = DEFAULT_FIRST_PERSON_CONFIG, initial: Partial<MovementState> = {}) {
    this.body = { eyeHeight: config.eyeHeight, state: {
      x: initial.x ?? 0, y: initial.y ?? 0, z: initial.z ?? 0, velocityX: 0, velocityY: 0, velocityZ: 0,
      yaw: initial.yaw ?? 0, pitch: initial.pitch ?? 0, grounded: initial.grounded ?? true,
    }};
  }

  update(input: MovementInput, dt: number, collision: CollisionWorld): MovementState {
    const s = this.body.state;
    const safeDt = clamp(dt, 0, 0.1);
    const length = Math.hypot(input.forward, input.strafe) || 1;
    const forward = clamp(input.forward / length, -1, 1);
    const strafe = clamp(input.strafe / length, -1, 1);
    const targetX = (Math.sin(s.yaw) * forward + Math.cos(s.yaw) * strafe) * this.config.walkingSpeed;
    const targetZ = (Math.cos(s.yaw) * forward - Math.sin(s.yaw) * strafe) * this.config.walkingSpeed;
    const active = Math.abs(forward) + Math.abs(strafe) > 0;
    const rate = (active ? this.config.acceleration : this.config.deceleration) * safeDt;
    s.velocityX = approach(s.velocityX, targetX, rate);
    s.velocityZ = approach(s.velocityZ, targetZ, rate);
    s.velocityY = s.grounded ? 0 : s.velocityY - this.config.gravity * safeDt;
    const moved = collision.move({ x: s.x, y: s.y, z: s.z }, { x: s.velocityX * safeDt, y: s.velocityY * safeDt, z: s.velocityZ * safeDt }, this.config.collisionRadius);
    s.x = moved.position.x; s.y = moved.position.y; s.z = moved.position.z; s.grounded = moved.grounded;
    if (s.grounded && s.velocityY < 0) s.velocityY = 0;
    s.yaw += input.lookX * this.config.lookSensitivity;
    s.pitch = clamp(s.pitch + input.lookY * this.config.lookSensitivity, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
    return { ...s };
  }

  eyePosition(): { x: number; y: number; z: number } { return { x: this.body.state.x, y: this.body.state.y + this.config.eyeHeight, z: this.body.state.z }; }
  lookDirection(): { x: number; y: number; z: number } {
    const { yaw, pitch } = this.body.state;
    return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  }
  reset(state: Partial<MovementState> = {}): void {
    Object.assign(this.body.state, { x: 0, y: 0, z: 0, velocityX: 0, velocityY: 0, velocityZ: 0, yaw: 0, pitch: 0, grounded: true, ...state });
  }
}

export function selectInteractionTarget<T>(controller: FirstPersonController, ray: InteractionRay<T>): InteractionTarget<T> | null {
  return ray.cast(controller.body, controller.lookDirection(), controller.config.interactionDistance);
}
