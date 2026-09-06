import { describe, expect, it } from 'vitest';
import { tierAtLeast, recommendedShadowMapSize, maxShadowCasterBudget, tierAllowsAO, tierAllowsBloom } from '../core/three/quality';

describe('tierAtLeast', () => {
  it('orders low < medium < high', () => {
    expect(tierAtLeast('low', 'low')).toBe(true);
    expect(tierAtLeast('low', 'medium')).toBe(false);
    expect(tierAtLeast('medium', 'low')).toBe(true);
    expect(tierAtLeast('high', 'medium')).toBe(true);
    expect(tierAtLeast('medium', 'high')).toBe(false);
  });
});

describe('recommendedShadowMapSize', () => {
  it('recommends 0 (no shadows) at low tier, growing with tier', () => {
    expect(recommendedShadowMapSize('low')).toBe(0);
    expect(recommendedShadowMapSize('medium')).toBeGreaterThan(0);
    expect(recommendedShadowMapSize('high')).toBeGreaterThan(recommendedShadowMapSize('medium'));
  });
});

describe('maxShadowCasterBudget', () => {
  it('is monotonically non-decreasing with tier, and 0 at low', () => {
    expect(maxShadowCasterBudget('low')).toBe(0);
    expect(maxShadowCasterBudget('medium')).toBeGreaterThanOrEqual(maxShadowCasterBudget('low'));
    expect(maxShadowCasterBudget('high')).toBeGreaterThanOrEqual(maxShadowCasterBudget('medium'));
  });
});

describe('existing tier gates stay consistent with the new tierAtLeast helper', () => {
  it('tierAllowsAO matches tierAtLeast(tier, "high")', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(tierAllowsAO(tier)).toBe(tierAtLeast(tier, 'high'));
    }
  });

  it('tierAllowsBloom matches tierAtLeast(tier, "medium")', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(tierAllowsBloom(tier)).toBe(tierAtLeast(tier, 'medium'));
    }
  });
});
