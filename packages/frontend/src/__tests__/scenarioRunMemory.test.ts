import { describe, expect, it, beforeEach, vi } from 'vitest';
import { runScenario, type ScenarioRun } from '../core/simulation/scenarioEngine';
import {
  buildSavedScenarioRunContext,
  isSavedScenarioRunContext,
  replaySavedScenarioRun,
  SCENARIO_MEMORY_CONTRACT_VERSION,
  type SavedScenarioRunContext,
} from '../core/simulation/scenarioMemory';

/**
 * TRWAŁA PAMIĘĆ PRZEBIEGU SCENARIUSZA.
 *
 * Przebieg był ulotny: seria żyła w pamięci procesu, więc przeładowanie karty
 * kasowało wynik. Te testy pilnują nie tego, że „coś się zapisuje", tylko tego,
 * co czyni zapis wart zaufania: że odtworzenie PRZELICZA model, że zmiana
 * parametru daje DRIFT z nazwanym polem, że podmieniona treść w localStorage
 * nie przechodzi jako MATCH i że niezweryfikowany przebieg nie ma drogi do
 * świata 3D.
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

const RUN_OPTIONS = {
  days: 18,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
} as const;

function baselineRun(): ScenarioRun {
  return runScenario('BASELINE', { ...RUN_OPTIONS });
}

function context(): SavedScenarioRunContext {
  return buildSavedScenarioRunContext(baselineRun());
}

describe('Kontrakt zapisu przebiegu scenariusza', () => {
  it('zapisuje komplet wejść potrzebnych do przeliczenia od nowa', () => {
    const run = baselineRun();
    const saved = buildSavedScenarioRunContext(run);

    expect(saved.scenarioId).toBe('BASELINE');
    expect(saved.days).toBe(run.days);
    expect(saved.stepsPerDay).toBe(run.stepsPerDay);
    expect(saved.params).toEqual(run.params);
    expect(saved.preInterventionParams).toEqual(run.preInterventionParams);
    expect(saved.hospitalCapacity).toEqual(run.hospitalCapacity);
    expect(saved.preInterventionHospital).toEqual(run.preInterventionHospital);
    expect(saved.cohort).toEqual(run.cohort);
    expect(saved.resultFingerprint).toBe(run.resultFingerprint);
    expect(saved.seriesLength).toBe(run.series.length);
    expect(saved.epistemicStatus).toBe('SIMULATION');
  });

  it('nie zapisuje przebiegu, którego nie da się później odtworzyć', () => {
    const notModeled = runScenario('VACCINATION', { ...RUN_OPTIONS });
    expect(notModeled.status).toBe('NOT_MODELED');
    expect(() => buildSavedScenarioRunContext(notModeled)).toThrow(/nie ma czego zapisać/i);

    // Przebieg wykonany, ale bez odcisku wyniku, też jest niezapisywalny —
    // zapis bez odcisku nie dałby się później zweryfikować.
    expect(() => buildSavedScenarioRunContext({ ...baselineRun(), resultFingerprint: null })).toThrow(/odcisku/i);
  });

  it('walidator odrzuca rekord z brakującym wejściem, a nie podstawia domyślne', () => {
    const saved = context();
    expect(isSavedScenarioRunContext(saved)).toBe(true);

    const { cohort: _cohort, ...withoutCohort } = saved;
    expect(isSavedScenarioRunContext(withoutCohort)).toBe(false);

    const { preInterventionParams: _pre, ...withoutPre } = saved;
    expect(isSavedScenarioRunContext(withoutPre)).toBe(false);

    expect(isSavedScenarioRunContext({ ...saved, params: { ...saved.params, seed: Number.NaN } })).toBe(false);
    expect(isSavedScenarioRunContext({ ...saved, scenarioId: 'NOT_A_SCENARIO' })).toBe(false);
    expect(isSavedScenarioRunContext({ ...saved, epistemicStatus: 'OBSERVED' })).toBe(false);
    expect(isSavedScenarioRunContext(null)).toBe(false);
    expect(isSavedScenarioRunContext('BASELINE')).toBe(false);
  });
});

describe('Odtworzenie zapisanego przebiegu', () => {
  it('MATCH pochodzi z ponownego PRZELICZENIA, a nie z odczytu zapisu', () => {
    const run = baselineRun();
    const replay = replaySavedScenarioRun(buildSavedScenarioRunContext(run));

    expect(replay.status).toBe('MATCH');
    expect(replay.run).not.toBeNull();
    // Zwrócony przebieg to nowy obiekt, a nie ta sama instancja co zapisany.
    expect(replay.run).not.toBe(run);
    expect(replay.run!.series).toHaveLength(run.series.length);
    for (let day = 0; day < run.series.length; day++) {
      expect(replay.run!.series[day]).toEqual(run.series[day]);
    }
  });

  it('zmiana parametru daje DRIFT z nazwanymi polami i nie wydaje przebiegu', () => {
    const saved = context();
    const replay = replaySavedScenarioRun(saved, { overrideParams: { r0: saved.params.r0 + 1.5 } });

    expect(replay.status).toBe('DRIFT');
    expect(replay.run).toBeNull();
    expect(replay.differences.map((entry) => entry.field)).toContain('resultFingerprint');
    expect(replay.differences.map((entry) => entry.field)).toContain('inputFingerprint');
    expect(replay.expectedResultFingerprint).toBe(saved.resultFingerprint);
    expect(replay.actualResultFingerprint).not.toBe(saved.resultFingerprint);
  });

  it('podmieniona liczba w zapisie przechodzi jako DRIFT, mimo nietkniętego odcisku wyniku', () => {
    const saved = context();
    const tampered: SavedScenarioRunContext = {
      ...saved,
      summaryDigest: { ...saved.summaryDigest, totalDeaths: saved.summaryDigest.totalDeaths + 7 },
    };
    const replay = replaySavedScenarioRun(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.run).toBeNull();
    expect(replay.differences.map((entry) => entry.field)).toContain('summary.totalDeaths');
  });

  it('podmieniony odcisk wyniku nie przechodzi jako MATCH', () => {
    const saved = context();
    const replay = replaySavedScenarioRun({ ...saved, resultFingerprint: 'deadbeef' });

    expect(replay.status).toBe('DRIFT');
    expect(replay.differences.map((entry) => entry.field)).toContain('resultFingerprint');
  });

  it('niekompletny albo obcy rekord kończy się BLOCKED, nigdy MATCH', () => {
    expect(replaySavedScenarioRun(undefined).status).toBe('BLOCKED');
    expect(replaySavedScenarioRun({}).status).toBe('BLOCKED');
    const { params: _params, ...broken } = context();
    const replay = replaySavedScenarioRun(broken);
    expect(replay.status).toBe('BLOCKED');
    expect(replay.run).toBeNull();
  });

  it('inna wersja silnika albo kontraktu blokuje porównanie zamiast ogłaszać DRIFT', () => {
    const saved = context();
    expect(replaySavedScenarioRun({ ...saved, engineVersion: '0.0.1-old' }).status).toBe('BLOCKED');
    expect(replaySavedScenarioRun({ ...saved, contractVersion: '0.9.0' }).status).toBe('BLOCKED');
    expect(SCENARIO_MEMORY_CONTRACT_VERSION).toBe('1.0.0');
  });

  it('opóźniona interwencja odtwarza się jako opóźniona, nie natychmiastowa', () => {
    const delayed = runScenario('ISOLATION', { ...RUN_OPTIONS, interventionStartDay: 8 });
    const immediate = runScenario('ISOLATION', { ...RUN_OPTIONS, interventionStartDay: 0 });
    expect(delayed.resultFingerprint).not.toBe(immediate.resultFingerprint);

    const replay = replaySavedScenarioRun(buildSavedScenarioRunContext(delayed));
    expect(replay.status).toBe('MATCH');
    expect(replay.actualResultFingerprint).toBe(delayed.resultFingerprint);
  });
});

describe('Pamięć Naukowa: przebieg przeżywa przeładowanie', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('zapisuje przebieg jako rekord pamięci z pełnym kontekstem scenariusza', async () => {
    const { saveScenarioRunToMemory, listExperiments } = await import('../core/scienceMemory');
    const run = baselineRun();
    const record = saveScenarioRunToMemory(run);

    expect(record.scenario?.scenarioId).toBe('BASELINE');
    expect(record.epistemicStatus).toBe('SIMULATION');
    expect(record.params.seed).toBe(run.params.seed);
    expect(record.stats.daysSimulated).toBe(run.series.length);

    const listed = listExperiments();
    expect(listed).toHaveLength(1);
    expect(listed[0]!.scenario?.resultFingerprint).toBe(run.resultFingerprint);
  });

  it('pełny łańcuch: zapis → nowa sesja modułów → odtworzenie → MATCH', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/scienceMemory');
    const run = baselineRun();
    first.saveScenarioRunToMemory(run);

    // Nowa „sesja": moduły od zera, ten sam localStorage. Tak wygląda F5.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/scienceMemory');
    const reloaded = second.listExperiments();
    expect(reloaded).toHaveLength(1);

    const { replaySavedScenarioRun: replayAfterReload } = await import('../core/simulation/scenarioMemory');
    const replay = replayAfterReload(reloaded[0]!.scenario);
    expect(replay.status).toBe('MATCH');
    expect(replay.run!.series).toHaveLength(run.series.length);
  });

  it('rekord z uszkodzonym kontekstem scenariusza nie jest wczytywany', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    memory.saveScenarioRunToMemory(baselineRun());

    const key = 'genesis-os:science-memory/v1';
    const raw = JSON.parse(storage.getItem(key)!) as Record<string, unknown>[];
    delete (raw[0]!.scenario as Record<string, unknown>).cohort;
    storage.setItem(key, JSON.stringify(raw));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/scienceMemory');
    expect(reloaded.listExperiments()).toHaveLength(0);
  });

  it('zmiana dźwigni tworzy osobny rekord, a nie nadpisuje poprzedniego', async () => {
    const { saveScenarioRunToMemory, listExperiments } = await import('../core/scienceMemory');
    saveScenarioRunToMemory(runScenario('ISOLATION', { ...RUN_OPTIONS, interventionStartDay: 0 }));
    saveScenarioRunToMemory(runScenario('ISOLATION', { ...RUN_OPTIONS, interventionStartDay: 8 }));

    const records = listExperiments();
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.contentHash)).size).toBe(2);
  });
});

describe('Most Pamięć → świat 3D', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('MATCH przekazuje do świata serię z PRZELICZENIA, oznaczoną jako odtworzenie', async () => {
    const { openSavedScenarioInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const run = baselineRun();
    const result = openSavedScenarioInWorld(buildSavedScenarioRunContext(run), { recordId: 'rec-1' });

    expect(result.replay.status).toBe('MATCH');
    expect(result.opened).toBe(true);

    const handoff = consumePendingScenarioTimeline();
    expect(handoff).not.toBeNull();
    expect(handoff!.origin).toBe('memory-replay');
    expect(handoff!.replayVerdict).toBe('MATCH');
    expect(handoff!.epistemicStatus).toBe('SIMULATION');
    expect(handoff!.series).toHaveLength(run.series.length);
    expect(handoff!.series[run.series.length - 1]).toEqual(run.series[run.series.length - 1]);
  });

  it('DRIFT nie ma czego przekazać — świat pozostaje pusty', async () => {
    const { openSavedScenarioInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const saved = context();
    const result = openSavedScenarioInWorld(saved, { recordId: 'rec-2', overrideParams: { r0: saved.params.r0 + 1.5 } });

    expect(result.replay.status).toBe('DRIFT');
    expect(result.opened).toBe(false);
    expect(result.handoffRunId).toBeNull();
    expect(consumePendingScenarioTimeline()).toBeNull();
  });

  it('BLOCKED nie ma czego przekazać — świat pozostaje pusty', async () => {
    const { openSavedScenarioInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const result = openSavedScenarioInWorld({ scenarioId: 'BASELINE' }, { recordId: 'rec-3' });

    expect(result.replay.status).toBe('BLOCKED');
    expect(result.opened).toBe(false);
    expect(consumePendingScenarioTimeline()).toBeNull();
  });
});
