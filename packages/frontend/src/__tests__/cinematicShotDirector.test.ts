import { describe, expect, it } from 'vitest';
import { applyCinematicDrift, resolveCinematicShot } from '../core/temporalCinematic/cinematicShotDirector';

describe('V6.1 cinematic shot director', () => {
  it('uses wide establishing shots before tighter hero/detail shots', () => {
    const streetStart = resolveCinematicShot(0, 10, 'street');
    const streetEnd = resolveCinematicShot(9.5, 10, 'street');
    expect(streetStart.name).toBe('ESTABLISH');
    expect(streetStart.dofEnabled).toBe(false);
    expect(streetEnd.name).toBe('HERO');
    expect(streetEnd.fov).toBeLessThan(streetStart.fov);
    expect(streetEnd.dofEnabled).toBe(true);
  });

  it('applies deterministic micro-drift without mutating the source keyframe', () => {
    const base = { t: 2, position: { x: 1, y: 1.7, z: 2 }, lookAt: { x: 5, y: 1.7, z: 2 } };
    const shot = resolveCinematicShot(2, 10, 'street');
    const a = applyCinematicDrift(base, 2, shot);
    const b = applyCinematicDrift(base, 2, shot);
    expect(a).toEqual(b);
    expect(base.position).toEqual({ x: 1, y: 1.7, z: 2 });
    expect(a.position).not.toEqual(base.position);
  });
});
