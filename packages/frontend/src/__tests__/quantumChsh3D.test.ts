import { describe, expect, it } from 'vitest';
import { lerpColor, outcomeColor } from '../labs/experiments/quantum-chsh';

describe('outcomeColor — reveals the real ±1 outcome, never a fabricated shade', () => {
  it('maps a positive outcome to the green accent', () => {
    expect(outcomeColor(1)).toBe(0x6ee7a0);
  });
  it('maps a negative outcome to the red accent', () => {
    expect(outcomeColor(-1)).toBe(0xf47c7c);
  });
});

describe('lerpColor — pure RGB interpolation backing the entanglement beam', () => {
  it('returns the start color at t=0 and end color at t=1', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });
  it('interpolates each channel independently at the midpoint', () => {
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
  });
  it('clamps t outside [0,1] instead of extrapolating past the endpoints', () => {
    expect(lerpColor(0x000000, 0xffffff, -1)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 2)).toBe(0xffffff);
  });
});
