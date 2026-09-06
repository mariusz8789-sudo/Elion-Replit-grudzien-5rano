import { describe, expect, it } from 'vitest';
import { runScenario, SCENARIOS_NOT_MODELED } from '../core/simulation/scenarioEngine';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import {
  buildTemporalTimeline,
  claimsObservedReality,
  temporalStateAt,
  TEMPORAL_STATUS_UNREACHABLE_IN_PHASE_1,
} from '../core/simulation/temporalState';

/**
 * OŚ CZASU — FAZA 1.
 *
 * Cały sens tych testów jest jeden: oś czasu ma pokazywać, CZYM JEST każdy
 * stan, i nie ma mieć drogi do udawania, że model coś zaobserwował. Dlatego
 * sprawdzamy nie tylko kształt danych, ale też czego zbudować SIĘ NIE DA.
 */

const OPTS = { days: 12, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 } };

describe('Koperta stanu czasowego', () => {
  it('pokrywa dni 0..N i bierze próbki z realnego przebiegu', () => {
    const run = runScenario('BASELINE', OPTS);
    const timeline = buildTemporalTimeline(run, 'BASELINE');

    expect(timeline.states).toHaveLength(run.days + 1);
    for (const sample of run.series) {
      const state = temporalStateAt(timeline, sample.day);
      expect(state?.sample).toEqual(sample);
    }
  });

  it('dzień 0 jest NOT_AVAILABLE zamiast dorobionej próbki', () => {
    const run = runScenario('BASELINE', OPTS);
    const day0 = temporalStateAt(buildTemporalTimeline(run, 'BASELINE'), 0);

    // Scenario Engine liczy od dnia 1. Gdyby oś czasu „wypełniła" dzień 0
    // czymkolwiek, byłaby to liczba, której model nigdy nie policzył.
    expect(day0?.sample).toBeNull();
    expect(day0?.observationStatus).toBe('NOT_AVAILABLE');
  });

  it('ramię bazowe jest SIMULATED, ramię z interwencją COUNTERFACTUAL', () => {
    const baseline = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');
    const variant = buildTemporalTimeline(runScenario('ISOLATION', OPTS), 'VARIANT');

    expect(baseline.states.filter((state) => state.sample !== null).every((state) => state.observationStatus === 'SIMULATED')).toBe(true);
    expect(variant.states.filter((state) => state.sample !== null).every((state) => state.observationStatus === 'COUNTERFACTUAL')).toBe(true);
  });

  it('żadna ścieżka fazy 1 nie produkuje OBSERVED / RECONSTRUCTED / INFERRED', () => {
    const timelines = [
      buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE'),
      buildTemporalTimeline(runScenario('ISOLATION', OPTS), 'VARIANT'),
      buildTemporalTimeline(runScenario('ISOLATION', { ...OPTS, interventionStartDay: 6 }), 'VARIANT'),
    ];

    for (const timeline of timelines) {
      expect(claimsObservedReality(timeline)).toBe(false);
      for (const state of timeline.states) {
        expect(TEMPORAL_STATUS_UNREACHABLE_IN_PHASE_1).not.toContain(state.observationStatus);
      }
    }
  });

  it('nie przypisuje stanom żadnej daty rzeczywistej', () => {
    const timeline = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');

    // Genesis nie ma dziś źródła danych historycznych. Rok przy stanie byłby
    // zmyśleniem, więc kalendarz jest jawnie niedostępny, a nie pusty.
    expect(timeline.states.every((state) => state.calendarTime === 'NOT_AVAILABLE')).toBe(true);
  });

  it('łańcuch rodziców prowadzi od dnia N do dnia N-1', () => {
    const timeline = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');

    expect(timeline.states[0]!.parentStateId).toBeNull();
    for (let day = 1; day <= timeline.days; day++) {
      expect(temporalStateAt(timeline, day)!.parentStateId).toBe(temporalStateAt(timeline, day - 1)!.temporalStateId);
    }
  });

  it('ten sam przebieg daje ten sam odcisk osi, inny seed inny', () => {
    const sameA = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');
    const sameB = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');
    const other = buildTemporalTimeline(runScenario('BASELINE', { ...OPTS, baseParams: { ...OPTS.baseParams, seed: 777 } }), 'BASELINE');

    expect(sameB.timelineFingerprint).toBe(sameA.timelineFingerprint);
    expect(other.timelineFingerprint).not.toBe(sameA.timelineFingerprint);
  });

  it('odcisk stanu obejmuje próbkę, więc podmiana liczby go rozjeżdża', () => {
    const run = runScenario('BASELINE', OPTS);
    const timeline = buildTemporalTimeline(run, 'BASELINE');
    const original = temporalStateAt(timeline, 5)!;

    const tampered = runScenario('BASELINE', OPTS);
    tampered.series[4]!.infectious += 1;
    const tamperedState = temporalStateAt(buildTemporalTimeline(tampered, 'BASELINE'), 5)!;

    expect(tamperedState.stateFingerprint).not.toBe(original.stateFingerprint);
  });

  it('przebieg NOT_MODELED nie ma osi czasu', () => {
    expect(SCENARIOS_NOT_MODELED.length).toBeGreaterThan(0);
    const run = runScenario(SCENARIOS_NOT_MODELED[0]!, OPTS);

    // Oś czasu bez odtwarzalnego źródła byłaby wykresem bez pokrycia.
    expect(() => buildTemporalTimeline(run, 'BASELINE')).toThrow(/nie został wykonany/);
  });

  it('dzień spoza osi zwraca null zamiast najbliższego stanu', () => {
    const timeline = buildTemporalTimeline(runScenario('BASELINE', OPTS), 'BASELINE');

    expect(temporalStateAt(timeline, timeline.days + 1)).toBeNull();
    expect(temporalStateAt(timeline, -1)).toBeNull();
  });

  it('replays the existing agent world to a selected scenario day', () => {
    const run = runScenario('ISOLATION', { ...OPTS, interventionStartDay: 6 });
    const sim = new EpidemicCitySimulation();
    const renderedDay = sim.replayToDay({
      preInterventionParams: run.preInterventionParams,
      params: run.params,
      cohort: run.cohort,
      stepsPerDay: run.stepsPerDay,
      interventionStartDay: run.interventionStartDay,
    }, 7);
    const expected = run.series.find((sample) => sample.day === renderedDay)!;
    expect(renderedDay).toBe(7);
    expect(sim.stats()).toMatchObject({
      dzien: expected.day,
      S: expected.susceptible,
      E: expected.exposed,
      I: expected.infectious,
      R: expected.recovered,
      D: expected.deceased,
      izolowani: expected.isolated,
      hospitalizowani: expected.hospitalized,
    });
  });
});
