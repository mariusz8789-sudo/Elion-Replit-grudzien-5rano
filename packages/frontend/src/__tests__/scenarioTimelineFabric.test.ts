import { beforeEach, describe, expect, it } from 'vitest';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { getRouterModel } from '../core/experimentFabric/router';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { SCENARIOS } from '../core/simulation/scenarioEngine';
import { clearScenarioTimelineHandoffs, peekPendingScenarioTimeline, setPendingScenarioTimeline } from '../core/experimentFabric/worldHandoff';
import type { ExperimentValue } from '../core/experimentFabric/types';

/**
 * SCENARIO ENGINE PRZEZ WSPÓLNY KONTRAKT.
 *
 * Nazwany Scenario Engine (BASELINE i warianty interwencji) był odtwarzalny od
 * dawna, ale nie dało się go uruchomić przez Experiment Fabric — czyli przez tę
 * samą drogę, którą idą pozostałe domeny. Bez tego „jedna platforma
 * eksperymentalna" była deklaracją, a nie faktem.
 *
 * Te testy sprawdzają CAŁĄ ścieżkę: request → plan → wykonanie → ewolucja w
 * czasie → wynik → odcisk → porównanie wariantów. Nie sprawdzają, czy model
 * przewiduje prawdziwą epidemię, bo nie przewiduje i nie ma tego twierdzić.
 */

const model = () => getRouterModel('scenario-timeline')!;

function run(values: Record<string, ExperimentValue>) {
  return runExperiment(buildStructuredRequestFromModel(model(), {
    days: 72, stepsPerDay: 4, nAgents: 260, initialInfected: 5, seed: 20260828, ...values,
  }, { sourceText: 'Zasymuluj rozwój epidemii przez 72 dni.' }));
}

describe('Scenario Engine w Experiment Fabric — rejestracja modelu', () => {
  it('model jest osiągalny przez router i deklaruje realny silnik', () => {
    const entry = model();

    expect(entry).toBeDefined();
    expect(entry.engine).toBe('genesis-scenario-engine@1.0.0');
    expect(entry.route.kind).toBe('live-world');
    expect(entry.parameters.map((spec) => spec.id)).toEqual(
      expect.arrayContaining(['scenarioId', 'days', 'stepsPerDay', 'interventionStartDay']),
    );
  });
});

describe('Scenario Engine w Experiment Fabric — realne wykonanie', () => {
  it('BASELINE wykonuje się i zwraca prawdziwy przebieg, nie zaślepkę', () => {
    const experiment = run({ scenarioId: 'BASELINE' });

    expect(experiment.result.status).toBe('completed');
    expect(experiment.provenance.resultOrigin).toBe('real-engine');
    expect(Number(experiment.result.outputs.daysSimulated)).toBeGreaterThan(60);
    expect(Number(experiment.result.outputs.peakInfectious)).toBeGreaterThan(0);
  });

  it('wynik niesie punkty czasowe pochodzące z serii dobowej', () => {
    const outputs = run({ scenarioId: 'BASELINE' }).result.outputs;

    for (const day of [0, 1, 6, 12, 24, 48]) {
      expect(outputs[`T+${day}h_infectious`]).toBeTypeOf('number');
      expect(outputs[`T+${day}h_deceased`]).toBeTypeOf('number');
      expect(outputs[`T+${day}h_bedOccupancy`]).toBeTypeOf('number');
    }
    // Punkt 0 to stan początkowy: nikt jeszcze nie zdążył umrzeć.
    expect(Number(outputs['T+0h_deceased'])).toBe(0);
  });

  it('krótszy horyzont NIE dopisuje punktów, których model nie policzył', () => {
    const outputs = run({ scenarioId: 'BASELINE', days: 10 }).result.outputs;

    expect(outputs['T+6h_infectious']).toBeTypeOf('number');
    // Dzień 24 leży poza 10-dniowym przebiegiem — brak wpisu jest poprawną
    // odpowiedzią; ekstrapolacja byłaby zmyśleniem wyniku.
    expect(outputs['T+24h_infectious']).toBeUndefined();
    expect(outputs['T+72h_infectious']).toBeUndefined();
  });

  it('epidemia realnie rozwija się w czasie', () => {
    const outputs = run({ scenarioId: 'BASELINE' }).result.outputs;

    expect(Number(outputs['T+24h_deceased'])).toBeGreaterThanOrEqual(Number(outputs['T+6h_deceased']));
    expect(Number(outputs.peakInfectiousDay)).toBeGreaterThan(0);
  });

  it('deklaruje wizualizację world-3d, więc świat ma czym się zmieniać', () => {
    expect(run({ scenarioId: 'BASELINE' }).result.visualization).toContain('world-3d');
  });
});

describe('Scenario Engine w Experiment Fabric — porównanie wariantów', () => {
  it('BASELINE i ISOLATION dają różne wyniki i różne odciski', () => {
    const baseline = run({ scenarioId: 'BASELINE' });
    const isolation = run({ scenarioId: 'ISOLATION' });

    expect(isolation.result.status).toBe('completed');
    expect(isolation.provenance.runFingerprint).not.toBe(baseline.provenance.runFingerprint);
    expect(isolation.result.outputs.peakInfectious).not.toBe(baseline.result.outputs.peakInfectious);
  });

  it('ten sam wariant uruchomiony ponownie daje IDENTYCZNY odcisk — MATCH', () => {
    const first = run({ scenarioId: 'ISOLATION' });
    const second = run({ scenarioId: 'ISOLATION' });

    expect(second.provenance.runFingerprint).toBe(first.provenance.runFingerprint);
    expect(second.result.outputs).toEqual(first.result.outputs);
  });

  it('zmiana parametru daje INNY odcisk — DRIFT', () => {
    const early = run({ scenarioId: 'ISOLATION', interventionStartDay: 0 });
    const late = run({ scenarioId: 'ISOLATION', interventionStartDay: 20 });

    // Ta sama polityka wprowadzona później to realnie inny świat, nie inna etykieta.
    expect(late.provenance.runFingerprint).not.toBe(early.provenance.runFingerprint);
  });
});

describe('Scenario Engine w Experiment Fabric — uczciwość', () => {
  it('mówi wprost, że to nie jest prognoza', () => {
    const result = run({ scenarioId: 'BASELINE' }).result;

    expect(result.warnings.join(' ')).toMatch(/nie jest skalibrowany|nie prognoza/i);
    expect(result.validity).toContain('Scenario Engine');
  });

  it('scenariusz niemodelowany jest odrzucany, a nie wykonywany po cichu', () => {
    const notModeled = Object.values(SCENARIOS).find((scenario) => scenario.notModeledReason !== undefined);
    if (!notModeled) return;

    const experiment = run({ scenarioId: notModeled.id });

    expect(experiment.result.status).toBe('engine_not_available');
    expect(experiment.provenance.resultOrigin).not.toBe('real-engine');
  });

  it('nieznany scenariusz nie udaje wykonania', () => {
    const experiment = run({ scenarioId: 'NIE_ISTNIEJE' });

    expect(experiment.result.status).toBe('engine_not_available');
    expect(experiment.result.summary).toMatch(/Nieznany scenariusz/i);
  });
});

describe('Pytanie w języku naturalnym → Scenario Engine', () => {
  it('pytanie o nazwany scenariusz trafia do Scenario Engine, nie w próżnię', () => {
    const parsed = parseScienceChatMessage('Pokaż scenariusz izolacji objawowych w mieście przez 72 dni.');

    expect(parsed.modelId).toBe('scenario-timeline');
    expect(parsed.parameters.scenarioId).toBe('ISOLATION');
    expect(parsed.parameters.days).toBe(72);
  });

  it('pytanie o moment wejścia interwencji wyciąga dzień z treści', () => {
    const parsed = parseScienceChatMessage('Co się stanie, jeśli wprowadzimy izolację dopiero po 20 dniach?');

    expect(parsed.modelId).toBe('scenario-timeline');
    expect(parsed.parameters.interventionStartDay).toBe(20);
  });

  it('zwykłe pytanie o epidemię nadal idzie do agentowego epidemic-city', () => {
    const parsed = parseScienceChatMessage('Zasymuluj rozwój epidemii przez 72 dni.');

    expect(parsed.modelId).toBe('epidemic-city');
  });

  it('sparsowane pytanie wykonuje się od razu, bez ręcznego przepisywania parametrów', () => {
    const parsed = parseScienceChatMessage('Pokaż scenariusz izolacji objawowych przez 72 dni.');
    const experiment = runExperiment(parsed);

    expect(experiment.result.status).toBe('completed');
    expect(experiment.provenance.resultOrigin).toBe('real-engine');
    expect(Number(experiment.result.outputs.daysSimulated)).toBeGreaterThan(60);
  });

  it('rozpoznaje pozostałe nazwane scenariusze', () => {
    expect(parseScienceChatMessage('Symulacja z zamknięciem szkół.').parameters.scenarioId).toBe('SCHOOL_CLOSURE');
    expect(parseScienceChatMessage('Co da ograniczenie kontaktów?').parameters.scenarioId).toBe('CONTACT_REDUCTION');
    expect(parseScienceChatMessage('Scenariusz bazowy epidemii.').parameters.scenarioId).toBe('BASELINE');
  });
});

describe('Przekazanie przebiegu do World/3D', () => {
  beforeEach(() => clearScenarioTimelineHandoffs());

  it('zakończony przebieg rejestruje serię, którą World/3D może przewijać', () => {
    const experiment = run({ scenarioId: 'ISOLATION' });

    expect(setPendingScenarioTimeline(experiment.runId)).toBe(true);
    const handoff = peekPendingScenarioTimeline()!;

    expect(handoff.runId).toBe(experiment.runId);
    expect(handoff.runFingerprint).toBe(experiment.provenance.runFingerprint);
    expect(handoff.scenarioId).toBe('ISOLATION');
    expect(handoff.resultOrigin).toBe('real-engine');
    expect(handoff.epistemicStatus).toBe('SIMULATION');
  });

  it('przekazana seria to DOKŁADNIE seria przebiegu, dzień po dniu', () => {
    const experiment = run({ scenarioId: 'BASELINE' });
    setPendingScenarioTimeline(experiment.runId);
    const handoff = peekPendingScenarioTimeline()!;

    expect(handoff.series.length).toBe(Number(experiment.result.outputs.daysSimulated));
    // Punkty czasowe w wyniku muszą zgadzać się z serią, po której przewija się świat.
    for (const day of [0, 6, 24, 48]) {
      expect(handoff.series[day]!.infectious).toBe(Number(experiment.result.outputs[`T+${day}h_infectious`]));
      expect(handoff.series[day]!.deceased).toBe(Number(experiment.result.outputs[`T+${day}h_deceased`]));
    }
  });

  it('świat nie ma dnia spoza horyzontu — brak ekstrapolacji', () => {
    const experiment = run({ scenarioId: 'BASELINE', days: 10 });
    setPendingScenarioTimeline(experiment.runId);
    const handoff = peekPendingScenarioTimeline()!;

    expect(handoff.series[handoff.series.length - 1]).toBeDefined();
    expect(handoff.series[handoff.series.length]).toBeUndefined();
  });

  it('różne warianty przekazują różne serie pod różnymi runId', () => {
    const baseline = run({ scenarioId: 'BASELINE' });
    const isolation = run({ scenarioId: 'ISOLATION' });

    setPendingScenarioTimeline(baseline.runId);
    const baselineSeries = peekPendingScenarioTimeline()!.series;
    setPendingScenarioTimeline(isolation.runId);
    const isolationSeries = peekPendingScenarioTimeline()!.series;

    expect(isolation.runId).not.toBe(baseline.runId);
    expect(isolationSeries.map((s) => s.infectious)).not.toEqual(baselineSeries.map((s) => s.infectious));
  });

  it('nieznany runId nie uzbraja przekazania — świat nie dostaje cudzych danych', () => {
    expect(setPendingScenarioTimeline('run_nie_istnieje')).toBe(false);
    expect(peekPendingScenarioTimeline()).toBeNull();
  });

  it('odrzucony przebieg nie rejestruje żadnej serii', () => {
    const experiment = run({ scenarioId: 'NIE_ISTNIEJE' });

    expect(experiment.result.status).toBe('engine_not_available');
    expect(setPendingScenarioTimeline(experiment.runId)).toBe(false);
  });
});
