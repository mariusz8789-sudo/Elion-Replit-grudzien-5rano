import { describe, expect, it } from 'vitest';
import { collisionSeedFor, createCollisionInitialState } from '../labs/experiments/universe-collision';

describe('universe collision reproducibility seam', () => {
  it('creates identical restricted three-body initial conditions for the same scenario', () => {
    const scenario = { width: 1280, height: 720, ratio: 1.25, retro: false };
    const first = createCollisionInitialState(scenario);
    const second = createCollisionInitialState(scenario);

    expect(first.seed).toBe(collisionSeedFor({ ratio: 1.25, retro: false }));
    expect(second).toEqual(first);
    expect(first.stars).toHaveLength(900 + Math.round(900 * 1.25));
    expect(first.cores[0].m * first.cores[0].vx + first.cores[1].m * first.cores[1].vx).toBeCloseTo(0, 12);
    expect(first.cores[0].m * first.cores[0].vy + first.cores[1].m * first.cores[1].vy).toBeCloseTo(0, 12);
  });

  it('changes the deterministic initial state when a physical scenario parameter changes', () => {
    const prograde = createCollisionInitialState({ width: 1280, height: 720, ratio: 1, retro: false });
    const retrograde = createCollisionInitialState({ width: 1280, height: 720, ratio: 1, retro: true });

    expect(prograde.seed).not.toBe(retrograde.seed);
    expect(prograde.stars[900]).not.toEqual(retrograde.stars[900]);
  });

  it('rejects invalid viewport, mass ratio and provenance seed before generating particles', () => {
    expect(() => createCollisionInitialState({ width: 0, height: 720, ratio: 1, retro: false })).toThrow('width i height');
    expect(() => createCollisionInitialState({ width: 1280, height: 720, ratio: 3, retro: false })).toThrow('ratio');
    expect(() => createCollisionInitialState({ width: 1280, height: 720, ratio: 1, retro: false, seed: -1 })).toThrow('seed');
  });
});
