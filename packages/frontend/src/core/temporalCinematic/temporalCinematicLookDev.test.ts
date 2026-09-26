import { describe, expect, it } from 'vitest';
import { spacetimePresentationProfile } from './temporalCinematicSim3D';

describe('temporal cinematic scene-specific look development', () => {
  it('keeps planetary establishing shots deep and restrained', () => {
    const mars = spacetimePresentationProfile('MARS_STATION');
    const alien = spacetimePresentationProfile('ALIEN_DESERT');

    expect(mars.ambientOcclusion.intensity).toBeGreaterThan(0.9);
    expect(alien.depthOfField.maxBlur).toBeLessThanOrEqual(0.002);
    expect(mars.reflectionStrength).toBe(0);
    expect(alien.reflectionStrength).toBe(0);
  });

  it('uses depth haze and a restrained reflection pass underwater', () => {
    const underwater = spacetimePresentationProfile('UNDERWATER_CITY');

    expect(underwater.fogDensity).toBeGreaterThan(0.01);
    expect(underwater.depthOfField.maxBlur).toBeGreaterThan(0.004);
    expect(underwater.reflectionStrength).toBeGreaterThan(0);
    expect(underwater.reflectionStrength).toBeLessThan(0.4);
  });

  it('keeps analytical deep-space scenes dark without costly reflections', () => {
    const wormhole = spacetimePresentationProfile('WORMHOLE_RINGS');

    expect(wormhole.environmentMode).toBe('INDOOR');
    expect(wormhole.exposure).toBeLessThan(0.8);
    expect(wormhole.reflectionStrength).toBe(0);
    expect(wormhole.ambientOcclusion.intensity).toBeLessThan(0.8);
  });
});
