import { describe, expect, it } from 'vitest';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { getRouterModel } from '../core/experimentFabric/router';
import { SCENARIOS } from '../core/simulation/scenarioEngine';
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
