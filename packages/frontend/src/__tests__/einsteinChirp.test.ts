import { describe, expect, it } from 'vitest';
import { runChirpInspiralScenario } from '../labs/experiments/einstein-chirp';

describe('bounded early-inspiral chirp runner', () => {
  it('delegates observables to the existing quadrupole and ISCO functions deterministically', () => {
    const first = runChirpInspiralScenario({ m1Solar: 36, m2Solar: 29 });
    const repeated = runChirpInspiralScenario({ m1Solar: 36, m2Solar: 29 });

    expect(first).toEqual(repeated);
    expect(first.startsBeforeIsco).toBe(true);
    if (!first.startsBeforeIsco) throw new Error('Expected a valid early-inspiral test case.');
    expect(first.chirpMassSolar).toBeGreaterThan(0);
    expect(first.timeToIscoSeconds).toBeGreaterThan(0);
    expect(first.midInspiralFrequencyHz).toBeGreaterThan(first.startFrequencyHz);
    expect(first.midInspiralFrequencyHz).toBeLessThan(first.iscoFrequencyHz);
    expect(first.iscoSeparationMeters).toBeLessThan(first.startSeparationMeters);
  });

  it('reports when the fixed 20 Hz visual start is already outside the early-inspiral domain', () => {
    const outside = runChirpInspiralScenario({ m1Solar: 1000, m2Solar: 1000 });

    expect(outside.startsBeforeIsco).toBe(false);
    expect('timeToIscoSeconds' in outside).toBe(false);
  });
});
