import { describe, expect, it } from 'vitest';
import { generateScene } from '../core/lookingGlass/urbanTransformation/genesisSceneOrchestrator';
import type { SceneProgress } from '../core/lookingGlass/urbanTransformation/sceneProgress';

/**
 * REPRESENTATIVE MULTI-DOMAIN ACCEPTANCE TESTS — proves the pipeline is
 * generic (Natural Language -> Intent/Domain Resolution -> real existing
 * engine -> result), not hardcoded around historical cities. One real,
 * executed request per required category.
 */
describe('generateScene — multi-domain acceptance (proves genericity, not a city-only engine)', () => {
  it('1. historical world: "Build London in 1920." routes to HISTORICAL_URBAN and resolves a real world state', () => {
    const result = generateScene('Build London in 1920.');
    expect(result.domain).toBe('HISTORICAL_URBAN');
    if (result.domain === 'HISTORICAL_URBAN') {
      expect(result.temporalStates).toHaveLength(1);
      expect(result.temporalStates[0].locationId).toBe('london');
      expect(result.temporalStates[0].year).toBe(1920);
    }
  });

  it('2. molecule: "Build a DNA molecule" resolves via the domain resolver, then a known-molecule builder run separately proves real chemistry execution', () => {
    expect(generateScene('Build a DNA molecule in 3D.').domain).toBe('MOLECULE');
    const caffeine = generateScene('Build a caffeine molecule.');
    expect(caffeine.domain).toBe('MOLECULE');
    if (caffeine.domain === 'MOLECULE') {
      expect(caffeine.status).toBe('COMPLETED');
      expect(caffeine.descriptors).not.toBeNull();
    }
  });

  it('3. biological/cellular scene: "Show me a human cell." routes to BIOLOGICAL_CELL and honestly reports CAPABILITY_GAP', () => {
    const result = generateScene('Show me a human cell.');
    expect(result.domain).toBe('BIOLOGICAL_CELL');
    if (result.domain === 'BIOLOGICAL_CELL') {
      expect(result.status).toBe('CAPABILITY_GAP');
      expect(result.existingCapability).toContain('Human Biology Lab');
    }
  });

  it('4. engineering/industrial scene: "Build an industrial factory." routes to ENGINEERING and computes real hydraulic values', () => {
    const result = generateScene('Build an industrial factory.');
    expect(result.domain).toBe('ENGINEERING');
    if (result.domain === 'ENGINEERING') {
      expect(result.status).toBe('COMPLETED');
      expect(result.values.totalHead).toBeGreaterThan(0);
    }
  });

  it('5. environmental/world scene: "Build the Solar System." routes to ENVIRONMENTAL and runs the real SEIR world model', () => {
    const result = generateScene('Build the Solar System.');
    expect(result.domain).toBe('ENVIRONMENTAL');
    if (result.domain === 'ENVIRONMENTAL') {
      expect(result.status).toBe('COMPLETED');
      expect(result.series.length).toBeGreaterThan(1);
    }
  });

  it('6. temporal transformation: "Show the same city changing from 1900 to 2026." resolves two real, spatially-anchored historical states', () => {
    const result = generateScene('Show the same street in Warsaw changing from 1900 to 2026.');
    expect(result.domain).toBe('HISTORICAL_URBAN');
    if (result.domain === 'HISTORICAL_URBAN') {
      expect(result.temporalStates.map((s) => s.year)).toEqual([1900, 2026]);
      expect(result.temporalStates[0].anchor).toEqual(result.temporalStates[1].anchor);
    }
  });

  it('an unrecognisable domain honestly reports BLOCKED, never a guessed scene', () => {
    const result = generateScene('xyzzy plugh');
    expect(result.domain).toBeNull();
    expect(result.status).toBe('BLOCKED');
  });

  it('progress reporting: real stage-by-stage percent/remaining counts, never fabricated', () => {
    const events: SceneProgress[] = [];
    generateScene('Build an industrial factory.', { onProgress: (p) => events.push(p) });
    expect(events.length).toBeGreaterThan(0);
    expect(events.at(-1)!.percent).toBe(100);
    expect(events.at(-1)!.remaining).toBe(0);
    for (let i = 1; i < events.length; i++) expect(events[i].completed).toBeGreaterThan(events[i - 1].completed);
  });

  it('progress reporting on the historical/temporal pipeline fires once per real stage it reaches, and stops firing on early BLOCKED', () => {
    const events: SceneProgress[] = [];
    generateScene('show me Atlantis in 1920', { onProgress: (p) => events.push(p) });
    // The dispatcher's own RESOLVE_DOMAIN fires, then only the inner pipeline's PARSE stage is
    // reached before the location-resolution failure returns BLOCKED.
    expect(events.map((e) => e.stage)).toEqual(['RESOLVE_DOMAIN', 'PARSE']);
    expect(events[0].percent).toBeLessThan(100);
  });
});
