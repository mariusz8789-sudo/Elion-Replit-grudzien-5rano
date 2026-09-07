import { describe, expect, it, beforeEach, vi } from 'vitest';
import { compareScenarios, runScenario } from '../core/simulation/scenarioEngine';
import {
  buildSavedScenarioCounterfactual,
  firstDivergentDay,
  isSavedScenarioCounterfactual,
  replaySavedScenarioCounterfactual,
  runScenarioCounterfactual,
  type ScenarioCounterfactualSpec,
} from '../core/simulation/scenarioCounterfactual';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { getRouterModel } from '../core/experimentFabric/router';

/**
 * KONTRFAKTYK.
 *
 * „A gdyby wejść z izolacją dopiero po 20 dniach?" musi być odpowiedzią z
 * DWÓCH wykonanych przebiegów, nie z jednego przebiegu i doszacowanej różnicy.
 * Te testy pilnują trzech rzeczy: że różnica pochodzi z modeli, że porównanie
 * jest blokowane, kiedy różnicy nie da się przypisać interwencji, i że całość
 * da się odtworzyć razem z różnicą.
 */

function makeFakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() { return map.size; },
  };
}

const SPEC: ScenarioCounterfactualSpec = {
  baselineScenarioId: 'ISOLATION',
  variantScenarioId: 'ISOLATION',
  days: 24,
  stepsPerDay: 2,
  baseParams: { nAgents: 140, initialInfected: 5, seed: 20260831 },
  baselineInterventionStartDay: 0,
  variantInterventionStartDay: 10,
};

describe('Bramka porównywalności', () => {
  const OPTS = { days: 20, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 4242 } };

  it('różny horyzont blokuje porównanie zamiast policzyć „mniej zgonów"', () => {
    const short = runScenario('BASELINE', { ...OPTS, days: 10 });
    const long = runScenario('ISOLATION', { ...OPTS, days: 20 });
    const comparison = compareScenarios(short, long);

    // Bez tej bramki krótszy przebieg zawsze „wygrywał" liczbą zgonów, bo
    // zegar zatrzymał się wcześniej — różnica nie miała nic wspólnego z polityką.
    expect(comparison.status).toBe('BLOCKED_NOT_COMPARABLE');
    expect(comparison.metrics).toEqual([]);
    expect(comparison.message).toMatch(/horyzont/i);
  });

  it('ta sama polityka w innym dniu jest nazwana różnicą CZASU, nie „identycznymi parametrami"', () => {
    const immediate = runScenario('ISOLATION', { ...OPTS, interventionStartDay: 0 });
    const delayed = runScenario('ISOLATION', { ...OPTS, interventionStartDay: 8 });
    const comparison = compareScenarios(immediate, delayed);

    expect(comparison.status).toBe('COMPLETED');
    expect(comparison.changedParameters).toEqual([]);
    expect(comparison.changedTiming).toEqual(['interventionStartDay']);
    expect(comparison.message).toMatch(/moment wejścia/i);
    expect(comparison.message).not.toMatch(/szpitalnej/i);
  });

  it('różnica pojemności placówki jest wskazana z nazwy pola', () => {
    const tight = { totalBeds: 2, icuBeds: 1, icuShareOfAdmissions: 0.22 };
    const base = runScenario('BASELINE', { ...OPTS, baseHospital: tight, baseParams: { ...OPTS.baseParams, severeRate: 0.5 } });
    const expanded = runScenario('HEALTHCARE_EXPANSION', { ...OPTS, baseHospital: tight, baseParams: { ...OPTS.baseParams, severeRate: 0.5, restrictions: 0, isolate: false } });
    const comparison = compareScenarios(base, expanded);

    expect(comparison.changedCapacity.length).toBeGreaterThan(0);
    expect(comparison.changedParameters).toEqual([]);
  });
});

describe('Silnik kontrfaktyczny', () => {
  it('wykonuje dwa realne przebiegi i liczy różnicę z ich wyników', () => {
    const counterfactual = runScenarioCounterfactual(SPEC);

    expect(counterfactual.baseline.status).toBe('COMPLETED');
    expect(counterfactual.variant.status).toBe('COMPLETED');
    expect(counterfactual.baseline.resultFingerprint).not.toBe(counterfactual.variant.resultFingerprint);
    expect(counterfactual.comparison.status).toBe('COMPLETED');
    expect(counterfactual.comparison.changedTiming).toEqual(['interventionStartDay']);

    // Każda metryka jest różnicą DWÓCH policzonych podsumowań.
    for (const metric of counterfactual.comparison.metrics) {
      expect(metric.absoluteDelta).toBeCloseTo(metric.variant - metric.baseline, 10);
    }
    const deaths = counterfactual.comparison.metrics.find((metric) => metric.key === 'totalDeaths')!;
    expect(deaths.baseline).toBe(counterfactual.baseline.summary!.totalDeaths);
    expect(deaths.variant).toBe(counterfactual.variant.summary!.totalDeaths);
  });

  it('dzień rozjazdu jest MIERZONY na seriach, nie równy dniowi wejścia interwencji', () => {
    const counterfactual = runScenarioCounterfactual(SPEC);
    const measured = firstDivergentDay(counterfactual.baseline.series, counterfactual.variant.series);

    expect(counterfactual.firstDivergentDay).toBe(measured);
    // Ramię natychmiastowe różni się od opóźnionego od samego początku, więc
    // rozjazd MUSI wypaść przed dniem wejścia opóźnionej interwencji.
    expect(counterfactual.firstDivergentDay).not.toBeNull();
    expect(counterfactual.firstDivergentDay!).toBeLessThan(SPEC.variantInterventionStartDay!);
  });

  it('identyczne ramiona nie rozjeżdżają się i nie udają różnicy', () => {
    const identical = runScenarioCounterfactual({ ...SPEC, variantInterventionStartDay: 0 });

    expect(identical.firstDivergentDay).toBeNull();
    expect(identical.comparison.changedTiming).toEqual([]);
    for (const metric of identical.comparison.metrics) expect(metric.absoluteDelta).toBe(0);
  });

  it('ten sam wsad daje ten sam odcisk kontrfaktyku, inny wsad inny', () => {
    expect(runScenarioCounterfactual(SPEC).counterfactualFingerprint)
      .toBe(runScenarioCounterfactual(SPEC).counterfactualFingerprint);
    expect(runScenarioCounterfactual({ ...SPEC, variantInterventionStartDay: 12 }).counterfactualFingerprint)
      .not.toBe(runScenarioCounterfactual(SPEC).counterfactualFingerprint);
  });

  it('nieporównywalnego kontrfaktyku nie da się zapisać', () => {
    const notModeled = runScenarioCounterfactual({ ...SPEC, variantScenarioId: 'VACCINATION' });
    expect(notModeled.comparison.status).toBe('BLOCKED_NOT_MODELED');
    expect(() => buildSavedScenarioCounterfactual(notModeled)).toThrow(/nie jest porównywalny/i);
  });
});

describe('Odtworzenie kontrfaktyku', () => {
  it('MATCH wymaga odtworzenia OBU ramion i przeliczenia różnicy', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(SPEC));
    const replay = replaySavedScenarioCounterfactual(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.baselineStatus).toBe('MATCH');
    expect(replay.variantStatus).toBe('MATCH');
    expect(replay.counterfactual).not.toBeNull();
    expect(replay.counterfactual!.comparison.metrics).toHaveLength(saved.metrics.length);
  });

  it('podmieniona różnica przy nietkniętych ramionach kończy się DRIFT', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(SPEC));
    const tampered = {
      ...saved,
      metrics: saved.metrics.map((metric, index) => index === 0 ? { ...metric, absoluteDelta: metric.absoluteDelta + 1 } : metric),
    };
    const replay = replaySavedScenarioCounterfactual(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.counterfactual).toBeNull();
    expect(replay.differences.some((entry) => entry.field.endsWith('.absoluteDelta'))).toBe(true);
  });

  it('podmieniony dzień rozjazdu kończy się DRIFT', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(SPEC));
    const replay = replaySavedScenarioCounterfactual({ ...saved, firstDivergentDay: (saved.firstDivergentDay ?? 0) + 5 });

    expect(replay.status).toBe('DRIFT');
    expect(replay.differences.map((entry) => entry.field)).toContain('firstDivergentDay');
  });

  it('uszkodzone albo obce ramię kończy się BLOCKED, nigdy MATCH', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(SPEC));
    expect(replaySavedScenarioCounterfactual(undefined).status).toBe('BLOCKED');
    expect(replaySavedScenarioCounterfactual({}).status).toBe('BLOCKED');

    const { cohort: _cohort, ...brokenVariant } = saved.variant;
    expect(isSavedScenarioCounterfactual({ ...saved, variant: brokenVariant })).toBe(false);
    expect(replaySavedScenarioCounterfactual({ ...saved, variant: brokenVariant }).status).toBe('BLOCKED');
  });

  it('podmieniony odcisk ramienia kończy się DRIFT z nazwą ramienia', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(SPEC));
    const replay = replaySavedScenarioCounterfactual({
      ...saved,
      variant: { ...saved.variant, resultFingerprint: 'deadbeef' },
    });

    expect(replay.status).toBe('DRIFT');
    expect(replay.differences.map((entry) => entry.field)).toContain('variant.resultFingerprint');
  });
});

describe('Kontrfaktyk przez wspólny kontrakt Experiment Fabric', () => {
  it('pytanie „a gdyby izolacja dopiero po 20 dniach" trafia do kontrfaktyku', () => {
    const request = parseScienceChatMessage('A gdyby izolacja objawowych weszła dopiero po 20 dniach, 40 dni symulacji?');

    expect(request.modelId).toBe('scenario-counterfactual');
    expect(request.parameters.baselineScenarioId).toBe('ISOLATION');
    expect(request.parameters.variantScenarioId).toBe('ISOLATION');
    expect(request.parameters.baselineInterventionStartDay).toBe(0);
    expect(request.parameters.variantInterventionStartDay).toBe(20);
  });

  it('pytanie o jeden scenariusz bez kontrfaktycznego sformułowania zostaje przy osi czasu', () => {
    expect(parseScienceChatMessage('Pokaż izolację objawowych przez 40 dni').modelId).toBe('scenario-timeline');
  });

  it('wykonuje REALNY kontrfaktyk i zwraca różnicę obu ramion', () => {
    const request = buildStructuredRequestFromModel(getRouterModel('scenario-counterfactual')!, {
      baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
      days: 24, stepsPerDay: 2, nAgents: 140, initialInfected: 5, seed: 20260831,
      baselineInterventionStartDay: 0, variantInterventionStartDay: 10,
    });
    const run = runExperiment(request);

    expect(run.result.status).toBe('completed');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.plan.engine).toBe('genesis-scenario-engine@1.0.0');

    const direct = runScenarioCounterfactual(SPEC);
    // Wynik przez kontrakt musi być TYM SAMYM wynikiem, co wywołanie silnika.
    expect(run.result.outputs.counterfactualFingerprint).toBe(direct.counterfactualFingerprint);
    expect(run.result.outputs.baseline_totalDeaths).toBe(direct.baseline.summary!.totalDeaths);
    expect(run.result.outputs.variant_totalDeaths).toBe(direct.variant.summary!.totalDeaths);
    expect(run.result.outputs.changedTiming).toBe('interventionStartDay');
    expect(run.result.warnings.join(' ')).toMatch(/nie jest skalibrowany/i);
  });

  it('nieporównywalny kontrfaktyk zwraca jawną blokadę, nie liczbę', () => {
    const request = buildStructuredRequestFromModel(getRouterModel('scenario-counterfactual')!, {
      baselineScenarioId: 'BASELINE', variantScenarioId: 'VACCINATION',
      days: 20, stepsPerDay: 2, nAgents: 120, initialInfected: 4, seed: 4242,
    });
    const run = runExperiment(request);

    expect(run.result.status).not.toBe('completed');
    expect(run.result.summary).toMatch(/zablokowany/i);
    expect(Object.keys(run.result.outputs)).toHaveLength(0);
  });
});

describe('Kontrfaktyk w Pamięci Naukowej', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('zapisuje oba ramiona i różnicę, a odtworzenie po przeładowaniu daje MATCH', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    const record = memory.saveScenarioCounterfactualToMemory(runScenarioCounterfactual(SPEC));

    expect(record.counterfactual?.baseline.scenarioId).toBe('ISOLATION');
    expect(record.counterfactual?.changedTiming).toEqual(['interventionStartDay']);
    expect(record.epistemicStatus).toBe('SIMULATION');

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/scienceMemory');
    const rows = reloaded.listExperiments();
    expect(rows).toHaveLength(1);

    const { replaySavedScenarioCounterfactual: replayAfterReload } = await import('../core/simulation/scenarioCounterfactual');
    expect(replayAfterReload(rows[0]!.counterfactual).status).toBe('MATCH');
  });

  it('przechodzi z WHAT IF przez Memory do World handoff wyłącznie przy MATCH', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    const saved = memory.saveScenarioCounterfactualToMemory(runScenarioCounterfactual(SPEC));
    const { openSavedCounterfactualInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const result = openSavedCounterfactualInWorld(saved.counterfactual, { recordId: saved.contentHash });
    const { peekPendingScenarioTimeline, clearScenarioTimelineHandoffs } = await import('../core/experimentFabric/worldHandoff');

    expect(result.replay.status).toBe('MATCH');
    expect(result.opened).toBe(true);
    expect(result.handoffRunId).toBe(`replay:counterfactual:${saved.contentHash}`);
    expect(peekPendingScenarioTimeline()?.origin).toBe('memory-replay');
    expect(peekPendingScenarioTimeline()?.replayVerdict).toBe('MATCH');
    clearScenarioTimelineHandoffs();
  });

  it('rekord z uszkodzonym ramieniem nie jest wczytywany z pamięci', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    memory.saveScenarioCounterfactualToMemory(runScenarioCounterfactual(SPEC));

    const key = 'genesis-os:science-memory/v1';
    const raw = JSON.parse(storage.getItem(key)!) as Record<string, Record<string, Record<string, unknown>>>[];
    delete raw[0]!.counterfactual!.variant!.cohort;
    storage.setItem(key, JSON.stringify(raw));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/scienceMemory');
    expect(reloaded.listExperiments()).toHaveLength(0);
  });
});
