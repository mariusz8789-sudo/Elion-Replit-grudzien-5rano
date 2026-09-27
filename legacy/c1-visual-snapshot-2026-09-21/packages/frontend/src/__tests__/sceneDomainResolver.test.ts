import { describe, expect, it } from 'vitest';
import { resolveSceneDomain } from '../core/lookingGlass/urbanTransformation/sceneDomainResolver';

describe('resolveSceneDomain — the generic Intent/Domain Resolution layer', () => {
  it.each([
    ['Build London in 1920.', 'HISTORICAL_URBAN'],
    ['Show the same city changing from 1900 to 2026.', 'HISTORICAL_URBAN'],
    ['Build a DNA molecule in 3D.', 'MOLECULE'],
    ['Show a chemical reaction of caffeine.', 'MOLECULE'],
    ['Show me a human cell.', 'BIOLOGICAL_CELL'],
    ['Show a virus interacting with a cell.', 'BIOLOGICAL_CELL'],
    ['Build a water-treatment plant.', 'ENGINEERING'],
    ['Build an industrial factory.', 'ENGINEERING'],
    ['Show a flood propagating through a city.', 'ENVIRONMENTAL'],
    ['Build the Solar System.', 'ENVIRONMENTAL'],
  ] as const)('%s -> %s', (prompt, expected) => {
    expect(resolveSceneDomain(prompt)).toBe(expected);
  });

  it('returns null (NEEDS_INPUT) for a prompt with no recognisable domain, never a guess', () => {
    expect(resolveSceneDomain('xyzzy plugh')).toBeNull();
  });
});
