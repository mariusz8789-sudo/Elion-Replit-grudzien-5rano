import { describe, expect, it } from 'vitest';
import {
  runScenario,
  replayScenario,
  compareScenarios,
  SCENARIOS,
  SCENARIOS_NOT_MODELED,
  SCENARIO_ENGINE_VERSION,
  type ScenarioId,
} from '../core/simulation/scenarioEngine';

const OPTS = { days: 40, stepsPerDay: 4, baseParams: { nAgents: 160, initialInfected: 5, seed: 777 } };

describe('Scenario Engine — named scenarios over the real model', () => {
  it('runs a baseline and reports a real, non-degenerate epidemic', () => {
    const run = runScenario('BASELINE', OPTS);
    expect(run.status).toBe('COMPLETED');
    expect(run.contractVersion).toBe(SCENARIO_ENGINE_VERSION);
    expect(run.series.length).toBe(40);
    expect(run.summary!.peakInfectious).toBeGreaterThan(0);
    expect(run.summary!.attackRate).toBeGreaterThan(0);
  });

  it('records the fully resolved parameters — nothing left implicit', () => {
    const run = runScenario('CONTACT_REDUCTION', OPTS);
    expect(run.params.restrictions).toBe(0.6);
    expect(run.params.seed).toBe(777);
    expect(run.params.nAgents).toBe(160);
    expect(run.params.r0).toBeGreaterThan(0); // domyślna wartość jest zapisana wprost
  });

  it('every day of the series keeps the population accounted for', () => {
    const run = runScenario('BASELINE', OPTS);
    const n = run.summary!.population;
    for (const d of run.series) {
      expect(d.susceptible + d.exposed + d.infectious + d.recovered + d.deceased).toBe(n);
      expect(d.hospital.requiredCare).toBe(d.hospitalized);
    }
  });

  it('the day series advances monotonically', () => {
    const days = runScenario('BASELINE', OPTS).series.map((d) => d.day);
    for (let i = 1; i < days.length; i++) expect(days[i]).toBeGreaterThanOrEqual(days[i - 1]);
  });

  it('deaths never decrease — the model has no resurrection', () => {
    const run = runScenario('BASELINE', OPTS);
    for (let i = 1; i < run.series.length; i++) {
      expect(run.series[i].deceased).toBeGreaterThanOrEqual(run.series[i - 1].deceased);
    }
  });
});

describe('Scenario Engine — reproducibility', () => {
  it('the same scenario and seed produce an identical result fingerprint', () => {
    const a = runScenario('ISOLATION', OPTS);
    const b = runScenario('ISOLATION', OPTS);
    expect(b.inputFingerprint).toBe(a.inputFingerprint);
    expect(b.resultFingerprint).toBe(a.resultFingerprint);
    expect(b.series).toEqual(a.series);
  });

  it('replay actually recomputes the model and reports MATCH', () => {
    const run = runScenario('CONTACT_REDUCTION', OPTS);
    const replay = replayScenario(run);
    expect(replay.status).toBe('MATCH');
    expect(replay.actualResultFingerprint).toBe(run.resultFingerprint);
  });

  it('a tampered result fingerprint is caught as DRIFT, not waved through', () => {
    const run = runScenario('BASELINE', OPTS);
    const tampered = { ...run, resultFingerprint: 'deadbeef' };
    expect(replayScenario(tampered).status).toBe('DRIFT');
  });

  it('a different seed is a different world and a different fingerprint', () => {
    const a = runScenario('BASELINE', OPTS);
    const b = runScenario('BASELINE', { ...OPTS, baseParams: { ...OPTS.baseParams, seed: 778 } });
    expect(b.inputFingerprint).not.toBe(a.inputFingerprint);
    expect(b.resultFingerprint).not.toBe(a.resultFingerprint);
  });

  it('the fingerprints depend on the run, not on the scenario name', () => {
    // BASELINE i HEALTHCARE_EXPANSION nie różnią się parametrami epidemii, więc
    // przebieg epidemii MUSI być ten sam mimo innej nazwy.
    const tight = { totalBeds: 4, icuBeds: 1, icuShareOfAdmissions: 0.22 };
    const base = runScenario('BASELINE', { ...OPTS, baseHospital: tight });
    const expansion = runScenario('HEALTHCARE_EXPANSION', {
      ...OPTS,
      baseParams: { ...OPTS.baseParams, restrictions: 0, isolate: false },
      baseHospital: tight,
    });
    expect(expansion.epidemicFingerprint).toBe(base.epidemicFingerprint);
    // Ale obciążenie szpitala jest inne, więc to NIE jest ten sam wynik.
    expect(expansion.summary!.totalUnmetCareDays).not.toBe(base.summary!.totalUnmetCareDays);
    expect(expansion.resultFingerprint).not.toBe(base.resultFingerprint);
  });

  it('a pure capacity change leaves the epidemic fingerprint untouched', () => {
    const few = runScenario('BASELINE', { ...OPTS, baseHospital: { totalBeds: 2, icuBeds: 0, icuShareOfAdmissions: 0.2 } });
    const many = runScenario('BASELINE', { ...OPTS, baseHospital: { totalBeds: 200, icuBeds: 50, icuShareOfAdmissions: 0.2 } });
    expect(many.epidemicFingerprint).toBe(few.epidemicFingerprint);
    expect(many.resultFingerprint).not.toBe(few.resultFingerprint);
  });
});

describe('Scenario Engine — policies the model cannot express', () => {
  it.each(['SCHOOL_CLOSURE_ONLY', 'TRANSPORT_REDUCTION', 'VACCINATION'] as ScenarioId[])(
    '%s returns NOT_MODELED with a reason and an empty series',
    (id) => {
      const run = runScenario(id, OPTS);
      expect(run.status).toBe('NOT_MODELED');
      expect(run.series).toEqual([]);
      expect(run.summary).toBeNull();
      expect(run.resultFingerprint).toBeNull();
      expect(run.notModeledReason).toBeTruthy();
      expect(run.notModeledReason!.length).toBeGreaterThan(30);
    },
  );

  it('lists exactly the scenarios that carry a NOT_MODELED reason', () => {
    expect([...SCENARIOS_NOT_MODELED].sort()).toEqual(['SCHOOL_CLOSURE_ONLY', 'TRANSPORT_REDUCTION', 'VACCINATION']);
    for (const id of SCENARIOS_NOT_MODELED) expect(SCENARIOS[id].notModeledReason).toBeTruthy();
  });

  it('a NOT_MODELED run cannot be replayed or compared into a fake difference', () => {
    const missing = runScenario('VACCINATION', OPTS);
    const base = runScenario('BASELINE', OPTS);
    expect(replayScenario(missing).status).toBe('NOT_COMPARABLE');
    expect(compareScenarios(base, missing).status).toBe('BLOCKED_NOT_MODELED');
    expect(compareScenarios(base, missing).metrics).toEqual([]);
  });

  it('every modelled scenario only touches levers that exist in the model', () => {
    const legal = new Set(Object.keys(runScenario('BASELINE', OPTS).params));
    for (const def of Object.values(SCENARIOS)) {
      for (const key of Object.keys(def.epidemicOverrides)) expect(legal.has(key)).toBe(true);
    }
  });
});

describe('Scenario Engine — comparison', () => {
  it('names the parameters that actually differ between two policies', () => {
    const cmp = compareScenarios(runScenario('BASELINE', OPTS), runScenario('CONTACT_REDUCTION', OPTS));
    expect(cmp.status).toBe('COMPLETED');
    expect(cmp.changedParameters).toEqual(['restrictions']);
    expect(cmp.metrics.map((m) => m.key)).toContain('peakInfectious');
  });

  it('contact reduction lowers the epidemic peak against the same seed', () => {
    const base = runScenario('BASELINE', OPTS);
    const reduced = runScenario('CONTACT_REDUCTION', OPTS);
    expect(reduced.summary!.peakInfectious).toBeLessThan(base.summary!.peakInfectious);
  });

  it('blocks a comparison whose runs differ by more than the policy', () => {
    const base = runScenario('BASELINE', OPTS);
    const otherSeed = runScenario('ISOLATION', { ...OPTS, baseParams: { ...OPTS.baseParams, seed: 999 } });
    const cmp = compareScenarios(base, otherSeed);
    expect(cmp.status).toBe('BLOCKED_NOT_COMPARABLE');
    expect(cmp.metrics).toEqual([]);
  });

  it('reports a relative delta of null instead of dividing by a zero baseline', () => {
    // Brak przeciążenia w bazie => totalUnmetCareDays = 0.
    const opts = { ...OPTS, baseHospital: { totalBeds: 500, icuBeds: 200, icuShareOfAdmissions: 0.22 } };
    const cmp = compareScenarios(runScenario('BASELINE', opts), runScenario('ISOLATION', opts));
    const unmet = cmp.metrics.find((m) => m.key === 'totalUnmetCareDays')!;
    expect(unmet.baseline).toBe(0);
    expect(unmet.relativeDeltaPercent).toBeNull();
  });

  it('healthcare expansion relieves pressure without altering the epidemic — and says so', () => {
    const tight = { totalBeds: 4, icuBeds: 1, icuShareOfAdmissions: 0.22 };
    const base = runScenario('BASELINE', { ...OPTS, baseHospital: tight });
    const expanded = runScenario('HEALTHCARE_EXPANSION', {
      ...OPTS,
      baseParams: { ...OPTS.baseParams, restrictions: 0, isolate: false },
      baseHospital: tight,
    });
    // Realny efekt: mniej dni bez opieki.
    expect(base.summary!.totalUnmetCareDays).toBeGreaterThan(0);
    expect(expanded.summary!.totalUnmetCareDays).toBeLessThan(base.summary!.totalUnmetCareDays);
    // Brak udawanego efektu epidemicznego: sprzężenie śmiertelności jest wyłączone.
    expect(expanded.summary!.totalDeaths).toBe(base.summary!.totalDeaths);
    expect(expanded.summary!.peakInfectious).toBe(base.summary!.peakInfectious);
    const cmp = compareScenarios(base, expanded);
    expect(cmp.changedParameters).toEqual([]);
    expect(cmp.message).toContain('szpitalnej');
    expect(SCENARIOS.HEALTHCARE_EXPANSION.rationale).toContain('nie zmienia przebiegu epidemii');
  });
});
