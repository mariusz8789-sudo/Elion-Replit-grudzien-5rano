import { describe, expect, it } from 'vitest';
import { anchorIsStableAcrossYears, buildHistoricalWorldState, interpolateEntityState, resolveEntityAtYear } from '../core/lookingGlass/urbanTransformation/historicalWorldState';

describe('buildHistoricalWorldState — resolvers, temporal entity history, stable location identity', () => {
  it('a horse-drawn cart exists in 1910 Warsaw but a modern car does not', () => {
    const state1910 = buildHistoricalWorldState('warsaw', 1910)!;
    expect(state1910.entities.some((e) => e.label === 'horse-drawn cart')).toBe(true);
    expect(state1910.entities.some((e) => e.label === 'modern car')).toBe(false);
  });

  it('the same query is INVALID_TEMPORAL_ENTITY territory (Tesla-class car absent) in 1910', () => {
    const state1910 = buildHistoricalWorldState('london', 1910)!;
    const carLike = state1910.entities.filter((e) => e.kind === 'VEHICLE' && e.label.includes('modern'));
    expect(carLike).toHaveLength(0);
  });

  it('a modern car exists in 2026 but a horse-drawn cart does not', () => {
    const state2026 = buildHistoricalWorldState('warsaw', 2026)!;
    expect(state2026.entities.some((e) => e.label === 'modern car')).toBe(true);
    expect(state2026.entities.some((e) => e.label === 'horse-drawn cart')).toBe(false);
  });

  it('every entity carries an honest, non-fabricated confidence and knowledgeStatus', () => {
    const state = buildHistoricalWorldState('krakow', 1950)!;
    for (const e of state.entities) {
      expect(e.provenance.knowledgeStatus).toBe('ESTIMATED');
      expect([0.4, 0.6, 0.8]).toContain(e.provenance.confidence);
    }
  });

  it('an unknown location returns null rather than a fabricated world', () => {
    expect(buildHistoricalWorldState('atlantis', 1950)).toBeNull();
  });

  it('is deterministic — same (location, year) yields byte-identical snapshot fingerprint twice', () => {
    const a = buildHistoricalWorldState('london', 1935)!;
    const b = buildHistoricalWorldState('london', 1935)!;
    expect(a.worldGraphSnapshotId).toBe(b.worldGraphSnapshotId);
    expect(a.entities).toEqual(b.entities);
  });

  it('resolveEntityAtYear finds the same entity id across two different years it is valid in', () => {
    const at1910 = resolveEntityAtYear('warsaw', 'warsaw:vehicle:electric-tram', 1910);
    const at2000 = resolveEntityAtYear('warsaw', 'warsaw:vehicle:electric-tram', 2000);
    expect(at1910).not.toBeNull();
    expect(at2000).not.toBeNull();
    expect(at1910!.id).toBe(at2000!.id);
  });

  it('resolveEntityAtYear returns null when the entity did not exist that year', () => {
    expect(resolveEntityAtYear('warsaw', 'warsaw:vehicle:modern-car', 1910)).toBeNull();
  });

  it('interpolateEntityState blends between two REAL resolved states, never fabricating a third', () => {
    const result = interpolateEntityState('warsaw', 'warsaw:vehicle:electric-tram', 1900, 2000, 1950);
    expect(result.from).not.toBeNull();
    expect(result.to).not.toBeNull();
    expect(result.blend).toBeCloseTo(0.5, 5);
  });

  it('the same camera-relevant anchor is retained across every requested year for one location', () => {
    const check = anchorIsStableAcrossYears('warsaw', [1900, 1950, 2000, 2026]);
    expect(check.stable).toBe(true);
    const s1900 = buildHistoricalWorldState('warsaw', 1900)!;
    const s2026 = buildHistoricalWorldState('warsaw', 2026)!;
    expect(s1900.anchor).toEqual(s2026.anchor);
    expect(s1900.anchor).toEqual(check.anchor);
  });
});
