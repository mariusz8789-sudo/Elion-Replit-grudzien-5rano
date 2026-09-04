import { describe, expect, it, vi, beforeEach } from 'vitest';

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

/**
 * FIRST-PERSON LAB SESSION — proves the thin glue over the EXISTING Scenario
 * Engine/Counterfactual/Scientific Memory produces real, non-fabricated
 * numbers: changing the one exposed valid parameter (intervention day)
 * genuinely changes the real model's output, replay is a real
 * recomputation-and-compare (not a stored answer), and the vessel reading is
 * a verbatim passthrough of the real HospitalState — never invented.
 */
describe('labSession — first-person vertical slice glue over real Scenario Engine', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });

  it('1. runLabScenario executes the real ISOLATION scenario deterministically', async () => {
    const { runLabScenario } = await import('../core/experimentFabric/labSession');
    const runA = runLabScenario(0);
    const runB = runLabScenario(0);
    expect(runA.status).toBe('COMPLETED');
    expect(runA.resultFingerprint).toBe(runB.resultFingerprint); // same input -> identical real output
    expect(runA.series.length).toBe(60);
  });

  it('2. changing the intervention day is a real, valid lever that changes real outcomes', async () => {
    const { runLabScenario } = await import('../core/experimentFabric/labSession');
    const early = runLabScenario(0);
    const late = runLabScenario(30);
    expect(early.resultFingerprint).not.toBe(late.resultFingerprint);
    expect(early.summary!.totalDeaths).not.toBe(late.summary!.totalDeaths);
  });

  it('3. the intervention day is clamped to the declared valid range, never silently accepting an unmodeled value', async () => {
    const { runLabScenario, LAB_INTERVENTION_DAY_RANGE } = await import('../core/experimentFabric/labSession');
    const tooLate = runLabScenario(999);
    const atMax = runLabScenario(LAB_INTERVENTION_DAY_RANGE.max);
    expect(tooLate.interventionStartDay).toBe(LAB_INTERVENTION_DAY_RANGE.max);
    expect(tooLate.resultFingerprint).toBe(atMax.resultFingerprint);
  });

  it('4. compareLabRuns reuses the real comparator and reports genuine metric deltas', async () => {
    const { runLabScenario, compareLabRuns } = await import('../core/experimentFabric/labSession');
    const baseline = runLabScenario(0);
    const variant = runLabScenario(25);
    const comparison = compareLabRuns(baseline, variant);
    expect(comparison.status).toBe('COMPLETED');
    expect(comparison.changedTiming).toEqual(['interventionStartDay']);
    expect(comparison.metrics.length).toBeGreaterThan(0);
  });

  it('5. replayLabRun genuinely recomputes and reports MATCH, not a stored verdict', async () => {
    const { runLabScenario, replayLabRun } = await import('../core/experimentFabric/labSession');
    const run = runLabScenario(15);
    const replay = replayLabRun(run);
    expect(replay.status).toBe('MATCH');
    expect(replay.actualResultFingerprint).toBe(run.resultFingerprint);
  });

  it('6. a tampered fingerprint is caught as DRIFT, never silently accepted as MATCH', async () => {
    const { runLabScenario, replayLabRun } = await import('../core/experimentFabric/labSession');
    const run = runLabScenario(10);
    const tampered = { ...run, resultFingerprint: `${run.resultFingerprint}-tampered` };
    const replay = replayLabRun(tampered);
    expect(replay.status).toBe('DRIFT');
  });

  it('7. vesselReadingForSample is a verbatim passthrough of the real HospitalState — nothing invented', async () => {
    const { runLabScenario, vesselReadingForSample } = await import('../core/experimentFabric/labSession');
    const run = runLabScenario(0);
    const sample = run.series[30]!;
    const reading = vesselReadingForSample(sample);
    expect(reading.day).toBe(sample.day);
    expect(reading.status).toBe(sample.hospital.status);
    expect(reading.bedFraction).toBeCloseTo(sample.hospital.bedOccupancy, 10);
    expect(reading.icuFraction).toBeCloseTo(sample.hospital.icuOccupancy, 10);
    expect(reading.unmetCare).toBe(sample.hospital.unmetCare);
  });

  it('8. firstCriticalDayInSeries finds the real first CRITICAL day, or honestly reports null if none occurred', async () => {
    const { runLabScenario, firstCriticalDayInSeries } = await import('../core/experimentFabric/labSession');
    const run = runLabScenario(0);
    const found = firstCriticalDayInSeries(run.series);
    const manualFirst = run.series.find((s) => s.hospital.status === 'CRITICAL')?.day ?? null;
    expect(found).toBe(manualFirst); // never fabricated — must match a real scan of the real series
  });

  it('9. buildLabCounterfactual runs both real arms sharing the same starting conditions', async () => {
    const { buildLabCounterfactual } = await import('../core/experimentFabric/labSession');
    const cf = buildLabCounterfactual(0, 20);
    expect(cf.baseline.params.seed).toBe(cf.variant.params.seed);
    expect(cf.baseline.interventionStartDay).toBe(0);
    expect(cf.variant.interventionStartDay).toBe(20);
    expect(cf.comparison.status).toBe('COMPLETED');
    expect(cf.counterfactualFingerprint).toMatch(/^[0-9a-f]+$/);
  });

  it('10. saveLabCounterfactualToMemory persists via the EXISTING Scientific Memory, not a second store', async () => {
    const { buildLabCounterfactual, saveLabCounterfactualToMemory } = await import('../core/experimentFabric/labSession');
    const { listExperiments } = await import('../core/scienceMemory');
    const cf = buildLabCounterfactual(0, 20);
    const saved = saveLabCounterfactualToMemory(cf);
    expect(saved.counterfactual?.counterfactualFingerprint).toBe(cf.counterfactualFingerprint);
    expect(listExperiments().some((entry) => entry.id === saved.id)).toBe(true);
  });

  it('11. identical two arms produce a comparison with no changed timing/parameters (honest "nothing changed" case)', async () => {
    const { buildLabCounterfactual } = await import('../core/experimentFabric/labSession');
    const cf = buildLabCounterfactual(5, 5);
    expect(cf.comparison.changedTiming).toEqual([]);
    expect(cf.comparison.changedParameters).toEqual([]);
  });
});
