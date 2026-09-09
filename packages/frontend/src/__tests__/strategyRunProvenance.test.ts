import { afterEach, describe, expect, it, vi } from 'vitest';

import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';
import { GENESIS_GENERATOR_CATALOG } from '../core/agent/electricalGeneratorLeverCatalog';
import { GENESIS_FLOOD_CATALOG } from '../core/agent/worldGoalIntent';

/**
 * THE HOP WHERE DATA PROVENANCE USED TO DISAPPEAR.
 *
 * `dataProvenance.ts` established the axis — SIMULATED / REFERENCE /
 * REAL_EXPERIMENTAL — and carried it
 * `ExperimentFabric → ExperimentRun → Evidence → Memory → UI/Replay`.
 * `StrategyRun` was not on that list, and it is the contract every discovery
 * consumer actually reads: the Matrix, narration, competing-models and
 * sufficiency readers, and the orchestrator's own front door all take a
 * `StrategyRun` and never an `ExperimentRun`. So a real laboratory result would
 * have become indistinguishable from a simulation the moment a finding was
 * reported through it.
 *
 * No second axis was introduced to fix that. `StrategyRunProvenance` imports
 * `DataProvenance` and projects it onto a whole investigation, which needs the
 * one thing a single value cannot express: an investigation takes MANY
 * measurements and they need not share an origin.
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

describe('every StrategyRun says where its numbers came from', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PARAMETER: read off the real ExperimentRuns, not asserted by the adapter', () => {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.5) });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    expect(outcome.run.dataProvenance.origin).toBe('SIMULATED');
    expect(outcome.run.dataProvenance.origins).toEqual(['SIMULATED']);
    expect(outcome.run.dataProvenance.derivedFrom).toMatch(/ExperimentRun\(s\) taken by this inquiry/);
  });

  it('MECHANISM: derived from the code path that produced the numbers, and it names the path', () => {
    const outcome = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Minimise peak flood depth, at most 8 experiments.',
      catalog: GENESIS_FLOOD_CATALOG,
    });
    if (outcome.status !== 'RAN') throw new Error('expected RAN');

    // A WorldGraph run takes no ExperimentRun at all, so there is no field to
    // read — the honest record names the machinery instead of asserting a label.
    expect(outcome.run.dataProvenance.origin).toBe('SIMULATED');
    expect(outcome.run.dataProvenance.derivedFrom).toBe('TemporalEngine.advance via SolverRouter.routeTick');
  });

  it('the SECOND run of a generation carries it too, on both shapes', () => {
    const parameter = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(0.5) });
    if (parameter.status !== 'RAN' || parameter.generated === null) throw new Error('expected generation');
    expect(parameter.generated.run.dataProvenance.origin).toBe('SIMULATED');

    const mechanism = runDiscovery({
      shape: 'MECHANISM',
      goal: 'Maximise remaining fuel, at most 12 experiments.',
      catalog: GENESIS_GENERATOR_CATALOG,
    });
    if (mechanism.status !== 'RAN' || mechanism.generated === null) throw new Error('expected generation');
    expect(mechanism.generated.run.dataProvenance.origin).toBe('SIMULATED');
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
      expect(record.result.dataProvenance.origin).toBe('SIMULATED');
    }
  }, 120_000);

  it('an unstated origin is left unstated, never defaulted to SIMULATED', async () => {
    // `dataProvenanceForResultOrigin` returns undefined exactly where the origin
    // is not established. Filling that in here would be the fabrication this
    // axis exists to prevent, so such a run contributes nothing and the summary
    // refuses to name a single origin for the inquiry.
    const { runAutonomousInquiryWithRuns } = await import('../core/agent/inquiryLoop');
    const execution = runAutonomousInquiryWithRuns(proteinFoldingInquiry(0.5));

    const stated = execution.measurements.filter((m) => m.provenance.dataProvenance !== undefined);
    if (stated.length === execution.measurements.length) {
      // Every run states one on this fixture — then the summary must name it.
      expect(execution.result.dataProvenance.origin).toBe('SIMULATED');
    } else {
      expect(execution.result.dataProvenance.origin).toBeNull();
      expect(execution.result.dataProvenance.why).toContain('state no data provenance');
    }
  }, 120_000);
});
