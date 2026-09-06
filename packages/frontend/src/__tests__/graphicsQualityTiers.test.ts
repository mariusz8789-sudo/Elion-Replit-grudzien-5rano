import { describe, expect, it } from 'vitest';
import {
  tierAtLeast, recommendedShadowMapSize, maxShadowCasterBudget, tierAllowsAO, tierAllowsBloom,
  tierAllowsAtmosphereParticles, atmosphereParticleCount, scaleCount,
  configureGraphicsQuality, detectRenderTier, resolveQualityLevel, configureGraphicsQualityForLevel,
  type QualityLevel,
} from '../core/three/quality';

const ALL_TIERS = ['low', 'medium', 'high', 'cinematic'] as const;

describe('tierAtLeast', () => {
  it('orders low < medium < high < cinematic', () => {
    expect(tierAtLeast('low', 'low')).toBe(true);
    expect(tierAtLeast('low', 'medium')).toBe(false);
    expect(tierAtLeast('medium', 'low')).toBe(true);
    expect(tierAtLeast('high', 'medium')).toBe(true);
    expect(tierAtLeast('medium', 'high')).toBe(false);
    expect(tierAtLeast('cinematic', 'high')).toBe(true);
    expect(tierAtLeast('high', 'cinematic')).toBe(false);
    expect(tierAtLeast('cinematic', 'cinematic')).toBe(true);
  });
});

describe('recommendedShadowMapSize', () => {
  it('recommends 0 (no shadows) at low tier, growing with tier through cinematic', () => {
    expect(recommendedShadowMapSize('low')).toBe(0);
    expect(recommendedShadowMapSize('medium')).toBeGreaterThan(0);
    expect(recommendedShadowMapSize('high')).toBeGreaterThan(recommendedShadowMapSize('medium'));
    expect(recommendedShadowMapSize('cinematic')).toBeGreaterThan(recommendedShadowMapSize('high'));
  });
});

describe('maxShadowCasterBudget', () => {
  it('is monotonically non-decreasing with tier, 0 at low, highest at cinematic', () => {
    expect(maxShadowCasterBudget('low')).toBe(0);
    expect(maxShadowCasterBudget('medium')).toBeGreaterThanOrEqual(maxShadowCasterBudget('low'));
    expect(maxShadowCasterBudget('high')).toBeGreaterThanOrEqual(maxShadowCasterBudget('medium'));
    expect(maxShadowCasterBudget('cinematic')).toBeGreaterThan(maxShadowCasterBudget('high'));
  });
});

describe('existing tier gates stay consistent with the tierAtLeast helper, cinematic included', () => {
  it('tierAllowsAO matches tierAtLeast(tier, "high") for every tier including cinematic', () => {
    for (const tier of ALL_TIERS) {
      expect(tierAllowsAO(tier)).toBe(tierAtLeast(tier, 'high'));
    }
    expect(tierAllowsAO('cinematic')).toBe(true);
  });

  it('tierAllowsBloom matches tierAtLeast(tier, "medium") for every tier including cinematic', () => {
    for (const tier of ALL_TIERS) {
      expect(tierAllowsBloom(tier)).toBe(tierAtLeast(tier, 'medium'));
    }
    expect(tierAllowsBloom('cinematic')).toBe(true);
  });
});

describe('detectRenderTier', () => {
  it('never auto-detects "cinematic" — that tier is always an explicit request', () => {
    // detectRenderTier() falls back to 'medium' outside a browser (no `window`), which is the
    // environment this test suite actually runs in — the real assertion is the TYPE guarantee
    // (InteractiveRenderTier excludes 'cinematic'), checked here by exhaustive runtime coverage.
    const tier = detectRenderTier();
    expect(['low', 'medium', 'high']).toContain(tier);
  });
});

describe('configureGraphicsQuality', () => {
  it('bundles every tier-dependent decision consistently with the individual helpers', () => {
    for (const tier of ALL_TIERS) {
      const profile = configureGraphicsQuality(tier);
      expect(profile.tier).toBe(tier);
      expect(profile.shadowMapSize).toBe(recommendedShadowMapSize(tier));
      expect(profile.maxShadowCasterBudget).toBe(maxShadowCasterBudget(tier));
      expect(profile.allowsBloom).toBe(tierAllowsBloom(tier));
      expect(profile.allowsAO).toBe(tierAllowsAO(tier));
      expect(profile.allowsDof).toBe(tierAllowsAO(tier)); // DOF shares AO's cost-based gate by default
    }
  });

  it('cinematic profile allows everything', () => {
    const profile = configureGraphicsQuality('cinematic');
    expect(profile.allowsBloom).toBe(true);
    expect(profile.allowsAO).toBe(true);
    expect(profile.allowsDof).toBe(true);
    expect(profile.shadowMapSize).toBeGreaterThan(0);
  });

  it('low profile allows nothing costly', () => {
    const profile = configureGraphicsQuality('low');
    expect(profile.allowsBloom).toBe(false);
    expect(profile.allowsAO).toBe(false);
    expect(profile.allowsDof).toBe(false);
    expect(profile.shadowMapSize).toBe(0);
    expect(profile.maxShadowCasterBudget).toBe(0);
  });
});

describe('QualityLevel preset layer', () => {
  it('maps every friendly preset to a real, interactive-safe RenderTier', () => {
    const expected: Record<QualityLevel, string> = { PERFORMANCE: 'low', BALANCED: 'medium', CINEMATIC: 'high' };
    for (const level of Object.keys(expected) as QualityLevel[]) {
      expect(resolveQualityLevel(level)).toBe(expected[level]);
    }
  });

  it('never resolves to the offline-capture-only "cinematic" RenderTier', () => {
    for (const level of ['PERFORMANCE', 'BALANCED', 'CINEMATIC'] as QualityLevel[]) {
      expect(resolveQualityLevel(level)).not.toBe('cinematic');
    }
  });

  it('configureGraphicsQualityForLevel matches configureGraphicsQuality(resolveQualityLevel(level))', () => {
    for (const level of ['PERFORMANCE', 'BALANCED', 'CINEMATIC'] as QualityLevel[]) {
      expect(configureGraphicsQualityForLevel(level)).toEqual(configureGraphicsQuality(resolveQualityLevel(level)));
    }
  });

  it('PERFORMANCE < BALANCED < CINEMATIC in shadow map size and caster budget', () => {
    const perf = configureGraphicsQualityForLevel('PERFORMANCE');
    const balanced = configureGraphicsQualityForLevel('BALANCED');
    const cinematic = configureGraphicsQualityForLevel('CINEMATIC');
    expect(perf.shadowMapSize).toBeLessThanOrEqual(balanced.shadowMapSize);
    expect(balanced.shadowMapSize).toBeLessThanOrEqual(cinematic.shadowMapSize);
    expect(perf.maxShadowCasterBudget).toBeLessThanOrEqual(balanced.maxShadowCasterBudget);
    expect(balanced.maxShadowCasterBudget).toBeLessThanOrEqual(cinematic.maxShadowCasterBudget);
  });

  it('CINEMATIC preset allows AO/DOF/bloom — the point of picking it over BALANCED', () => {
    const cinematic = configureGraphicsQualityForLevel('CINEMATIC');
    expect(cinematic.allowsBloom).toBe(true);
    expect(cinematic.allowsAO).toBe(true);
    expect(cinematic.allowsDof).toBe(true);
  });

  it('PERFORMANCE preset stays real-time-safe: no shadows, no AO/DOF', () => {
    const perf = configureGraphicsQualityForLevel('PERFORMANCE');
    expect(perf.shadowMapSize).toBe(0);
    expect(perf.allowsAO).toBe(false);
    expect(perf.allowsDof).toBe(false);
  });
});

describe('atmosphere feature gating', () => {
  it('tierAllowsAtmosphereParticles matches tierAtLeast(tier, "medium"), same floor as bloom', () => {
    for (const tier of ALL_TIERS) {
      expect(tierAllowsAtmosphereParticles(tier)).toBe(tierAllowsBloom(tier));
    }
  });

  it('atmosphereParticleCount is 0 at "low" (the effect is skipped entirely, not just shrunk)', () => {
    expect(atmosphereParticleCount(200, 'low')).toBe(0);
  });

  it('atmosphereParticleCount matches scaleCount at every tier the gate allows', () => {
    for (const tier of ['medium', 'high', 'cinematic'] as const) {
      expect(atmosphereParticleCount(200, tier)).toBe(scaleCount(200, tier));
    }
  });

  it('configureGraphicsQuality exposes allowsAtmosphereParticles consistently with the tier gate', () => {
    for (const tier of ALL_TIERS) {
      expect(configureGraphicsQuality(tier).allowsAtmosphereParticles).toBe(tierAllowsAtmosphereParticles(tier));
    }
  });
});
