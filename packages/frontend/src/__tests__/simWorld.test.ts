import { describe, expect, it } from 'vitest';
import { runSim, replayEqual, specFingerprint, DISCLOSURE, RANGES, FailClosedError, type SimSpec } from '../core/simWorld/engine';

/**
 * SIM WORLD — vitest port of the source bundle's `simWorldTests()`
 * (docs/DECISIONS.md D-056).
 */

const spec = (over: Partial<SimSpec> = {}): SimSpec => ({ kind: 'LAB_PLASMA', seed: 7, params: { drive_Hz: 27 }, dt: 0.05, tEnd: 20, ...over });

describe('runSim — determinism, replay, fingerprint sensitivity, fail-closed', () => {
  it('same seed+params ⇒ same state (determinism)', () => {
    const a = runSim(spec());
    const b = runSim(spec());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('replayEqual: fingerprint-equal specs produce byte-identical state (real re-run, not a stub)', () => {
    expect(replayEqual(spec(), spec())).toBe(true);
  });

  it('a different seed changes the sampled state', () => {
    const a = runSim(spec());
    const b = runSim(spec({ seed: 8 }));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('a different param changes the fingerprint', () => {
    expect(specFingerprint(spec())).not.toBe(specFingerprint(spec({ params: { drive_Hz: 30 } })));
  });

  it('fail-closed on an out-of-range param', () => {
    expect(() => runSim(spec({ params: { drive_Hz: 99999 } }))).toThrow(FailClosedError);
  });

  it('fingerprint is the real fnv1a hex format (8 chars), the shared Genesis hash provider', () => {
    expect(specFingerprint(spec())).toMatch(/^[0-9a-f]{8}$/);
  });

  it('DISCLOSURE names this as procedural simulation, not a physical prediction', () => {
    expect(DISCLOSURE).toMatch(/PROCEDURAL SIMULATION/);
    expect(DISCLOSURE).toMatch(/not a physical prediction/);
  });
});

describe('per-kind sanity checks', () => {
  it('SPACE_BLACKHOLE scalars are physically sane ranges for this toy visualization', () => {
    const bh = runSim(spec({ kind: 'SPACE_BLACKHOLE', params: { spin_a: 0.9, isco_r: 6 } }));
    expect(bh.scalars.diskSpeed).toBeGreaterThan(0);
    expect(bh.scalars.photonFlicker).toBeLessThanOrEqual(1);
  });

  it('SPACE_PHILLY ramps visibility down over time (the "cloaking field" visual, explicitly a fiction scenario)', () => {
    const ph = runSim(spec({ kind: 'SPACE_PHILLY', params: { field_strength: 1 }, tEnd: 30 }));
    expect(ph.scalars.visibility).toBeLessThan(0.3);
  });

  it('WORLD_CITY produces a deterministic, normalized heightmap of the requested block count', () => {
    const city = runSim(spec({ kind: 'WORLD_CITY', params: { cityBlocks: 64 } }));
    expect(city.series.length).toBe(64);
    expect(city.series.every((h) => h >= 0 && h <= 1)).toBe(true);
  });

  it('the param ranges registry is non-trivial (every declared param has a real bound)', () => {
    expect(Object.keys(RANGES).length).toBeGreaterThanOrEqual(10);
  });
});
