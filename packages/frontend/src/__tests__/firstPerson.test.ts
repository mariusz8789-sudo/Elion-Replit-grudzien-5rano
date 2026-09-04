import { describe, expect, it } from 'vitest';
import { FirstPersonController, selectInteractionTarget, type CollisionWorld, type InteractionRay } from '../core/world/firstPerson';

const floor: CollisionWorld = { move: (p, d) => ({ position: { x: p.x + d.x, y: Math.max(0, p.y + d.y), z: p.z + d.z }, grounded: p.y + d.y <= 0 }) };

describe('FirstPersonController', () => {
  it('moves at human scale and clamps look pitch', () => {
    const controller = new FirstPersonController({ eyeHeight: 1.7, walkingSpeed: 2, acceleration: 100, deceleration: 100, lookSensitivity: 1, gravity: 9.81, collisionRadius: .3, interactionDistance: 3 });
    const state = controller.update({ forward: 1, strafe: 0, lookX: 0, lookY: 99 }, .1, floor);
    expect(state.z).toBeGreaterThan(0); expect(state.pitch).toBeLessThan(Math.PI / 2); expect(controller.eyePosition().y).toBe(1.7);
  });
  it('delegates collision and returns to grounded state', () => {
    const controller = new FirstPersonController();
    controller.update({ forward: 0, strafe: 0, lookX: 0, lookY: 0 }, .1, floor);
    expect(controller.body.state.grounded).toBe(true);
  });
  it('selects only the target returned by the interaction ray', () => {
    const controller = new FirstPersonController();
    const ray: InteractionRay<string> = { cast: (_body, direction, maxDistance) => direction.x === 0 && maxDistance === 3 ? { id: 'station', distance: 2 } : null };
    expect(selectInteractionTarget(controller, ray)).toEqual({ id: 'station', distance: 2 });
  });
});
