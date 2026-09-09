import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';
import {
  originOfExperimentRun,
  summariseMeasurementOrigins,
  worldGraphMeasurementOrigin,
} from '../core/measurementProvenance';

/**
 * WHERE A NUMBER CAME FROM, carried the whole way.
 *
 * The axis is new; the reason it is new is that provenance was measurably LOST
 * at the `StrategyRun` hop. `ExperimentRun.provenance` survives
 * Fabric → Run → Evidence and then stopped: `StrategyRun` had no provenance
 * field at all, so Science Memory, replay, the Matrix and narration all saw
 * findings with no record of what produced them. A real laboratory result
 * arriving later would have become indistinguishable from a simulation the
 * moment it reached that contract.
 *
 * These tests hold two lines: the axis propagates, and it does not overclaim.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

describe('measurement provenance travels with the finding', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a PARAMETER run carries the origin of the real solver runs it took', () => {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.5) });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    const provenance = outcome.run.measurementProvenance;
    expect(provenance.origin).toBe('SIMULATED');
    expect(provenance.origins).toEqual(['SIMULATED']);
    // Derived from the runs actually taken, not asserted by the adapter.
    expect(provenance.derivedFrom).toMatch(/ExperimentRun\(s\) taken by this inquiry/);
  });

  it('a MECHANISM run derives its origin from the code path that produced the numbers', () => {
    const outcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Minimise peak flood depth, at most 8 experiments.',
      catalog: GENESIS_FLOOD_CATALOG,
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    const provenance = outcome.run.measurementProvenance;
    expect(provenance.origin).toBe('SIMULATED');
    // Named path, not a bare label: a WorldGraph arm is a solver-advanced
    // trajectory and the record says which machinery advanced it.
    expect(provenance.derivedFrom).toBe('TemporalEngine.advance via SolverRouter.routeTick');
  });

  it('the SECOND run of a generation carries provenance too — the hop that used to drop it', () => {
    const parameterOutcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.5) });
    if (parameterOutcome.status !== 'RAN' || parameterOutcome.generated === null) {
      throw new Error('expected a generated continuation');
    }
    expect(parameterOutcome.generated.run.measurementProvenance.origin).toBe('SIMULATED');

    const mechanismOutcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Maximise remaining fuel, at most 12 experiments.',
      catalog: GENESIS_GENERATOR_CATALOG,
    });
    if (mechanismOutcome.status !== 'RAN' || mechanismOutcome.generated === null) {
      throw new Error('expected a composed mechanism');
    }
    expect(mechanismOutcome.generated.run.measurementProvenance.origin).toBe('SIMULATED');
  });

  it('it reaches Science Memory, because it rides on the result rather than beside it', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    vi.resetModules();
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const fixture = await import('../core/agent/proteinFoldingInquiry');
    const { listParameterInquiriesForSystem } = await import('../core/scienceMemory');

    const input = fixture.proteinFoldingInquiry(0.5);
    runInquiryAndRemember(input);

    const remembered = listParameterInquiriesForSystem(input.system);
    expect(remembered.length).toBeGreaterThan(0);
    for (const record of remembered) {
      expect(record.result.measurementProvenance.origin).toBe('SIMULATED');
    }
  }, 120_000);
});

describe('the axis does not overclaim about what Genesis can do today', () => {
  it('NO path produces REAL_EXPERIMENTAL — the boundary is stated, not implied', () => {
    // Every reading of a real ExperimentRun maps to SIMULATED, whatever its
    // resultOrigin, because resultOrigin describes whether an ENGINE ran and
    // has no value meaning "measured". This test is the boundary: it fails the
    // day a real path is added without giving that path its own origin.
    for (const resultOrigin of [
      'real-engine',
      'hypothetical-visualization',
      'knowledge-only',
      'capability-seam',
      'engine-not-available',
    ] as const) {
      const provenance = originOfExperimentRun({
        provenance: { resultOrigin },
      } as unknown as Parameters<typeof originOfExperimentRun>[0]);
      expect(provenance.origin).toBe('SIMULATED');
      expect(provenance.derivedFrom).toContain(resultOrigin);
    }

    expect(worldGraphMeasurementOrigin().origin).toBe('SIMULATED');
  });

  it('"real-engine" is explained as a statement about the ENGINE, never about the world', () => {
    const provenance = originOfExperimentRun({
      provenance: { resultOrigin: 'real-engine' },
    } as unknown as Parameters<typeof originOfExperimentRun>[0]);
    expect(provenance.why).toContain('not about the world');
    expect(provenance.why).toContain('computed, never measured');
  });

  it('a MIXED run reports no single origin rather than picking one', () => {
    // The state that matters the day real data arrives: a finding drawn across
    // a simulation and a measurement is worth what its weakest source is worth,
    // and no single label describes it.
    const mixed = summariseMeasurementOrigins(
      [
        { contractVersion: '1.0.0', origin: 'SIMULATED', derivedFrom: 'a', why: 'a' },
        { contractVersion: '1.0.0', origin: 'REAL_EXPERIMENTAL', derivedFrom: 'b', why: 'b' },
      ],
      'a hand-built mixture',
    );
    expect(mixed.origin).toBeNull();
    expect([...mixed.origins].sort()).toEqual(['REAL_EXPERIMENTAL', 'SIMULATED']);
    expect(mixed.why).toContain('MIXED');
    expect(mixed.why).toContain('weakest source');
  });

  it('an investigation that measured nothing says so instead of defaulting to SIMULATED', () => {
    const none = summariseMeasurementOrigins([], 'no runs');
    expect(none.origin).toBeNull();
    expect(none.origins).toEqual([]);
    expect(none.why).toContain('took no measurement');
  });
});
