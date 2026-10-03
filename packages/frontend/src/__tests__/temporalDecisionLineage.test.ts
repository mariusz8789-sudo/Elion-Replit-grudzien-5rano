import { describe, expect, it } from 'vitest';
import {
  buildSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  temporalDecisionLineage,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * DECYZYJNE POCHODZENIE GAŁĘZI.
 *
 * Cel jednego zdania: dla każdej gałęzi Genesis ma umieć wskazać, Z JAKIEGO
 * stanu baseline i Z JAKIEJ deklarowanej decyzji powstała, i nie pomylić tego
 * z dniem, w którym światy faktycznie zaczęły się różnić.
 */

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'BASELINE',
  days: 20,
  stepsPerDay: 2,
  baseParams: { nAgents: 140, initialInfected: 5, seed: 20260901 },
  branches: [
    { branchId: 'B — natychmiast', scenarioId: 'ISOLATION' },
    { branchId: 'C — decyzja dzień 10', scenarioId: 'ISOLATION', interventionStartDay: 10 },
  ],
};

describe('Pochodzenie decyzji — baseline → gałąź', () => {
  it('każda gałąź wskazuje realny stan baseline w dniu SWOJEJ deklarowanej decyzji', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const lineage = temporalDecisionLineage(multiverse);
    const byId = Object.fromEntries(lineage.map((entry) => [entry.branchId, entry]));

    expect(byId['B — natychmiast']!.declaredInterventionStartDay).toBe(0);
    expect(byId['C — decyzja dzień 10']!.declaredInterventionStartDay).toBe(10);
    expect(byId['B — natychmiast']!.decisionState?.logicalDay).toBe(0);
    expect(byId['C — decyzja dzień 10']!.decisionState?.logicalDay).toBe(10);
    expect(byId['C — decyzja dzień 10']!.decisionState?.timelineId).toBe(multiverse.baselineTimeline.timelineId);
  });

  it('dzień decyzji jest DEKLAROWANY, dzień gałęzi jest ZMIERZONY — nie są tym samym polem', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const entry = temporalDecisionLineage(multiverse).find((e) => e.branchId === 'C — decyzja dzień 10')!;

    // Dzień decyzji jest ustalony przez spec i nigdy się nie przelicza.
    expect(entry.decisionState?.logicalDay).toBe(10);
    // Dzień gałęzi pochodzi z osobnego, zmierzonego pola — może wypaść tego
    // samego dnia co decyzja, ale nie dlatego, że to jedno pole udaje dwa.
    expect(entry.firstDivergentDayFromBaseline).not.toBeNull();
    expect(entry.branchState?.logicalDay).toBe(entry.firstDivergentDayFromBaseline);
  });

  it('dwie różne gałęzie mają różną tożsamość stanu decyzji i stanu gałęzi', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const [b, c] = temporalDecisionLineage(multiverse);

    expect(b!.decisionState?.stateFingerprint).not.toBe(c!.decisionState?.stateFingerprint);
    expect(b!.branchState?.temporalStateId).not.toBe(c!.branchState?.temporalStateId);
  });

  it('jest deterministyczne: ten sam spec daje identyczne pochodzenie', () => {
    const first = temporalDecisionLineage(runTemporalMultiverse(SPEC));
    const second = temporalDecisionLineage(runTemporalMultiverse(SPEC));

    expect(second).toEqual(first);
  });

  it('inna deklarowana decyzja daje inny stan decyzji — kontrolowany parametr nie może dać fałszywego dopasowania', () => {
    const moved: TemporalMultiverseSpec = { ...SPEC, branches: [{ branchId: 'C', scenarioId: 'ISOLATION', interventionStartDay: 10 }] };
    const movedAgain: TemporalMultiverseSpec = { ...SPEC, branches: [{ branchId: 'C', scenarioId: 'ISOLATION', interventionStartDay: 11 }] };

    const lineageMoved = temporalDecisionLineage(runTemporalMultiverse(moved))[0]!;
    const lineageMovedAgain = temporalDecisionLineage(runTemporalMultiverse(movedAgain))[0]!;

    expect(lineageMoved.decisionState?.stateFingerprint).not.toBe(lineageMovedAgain.decisionState?.stateFingerprint);
  });

  it('deklarowana decyzja poza osią baseline daje NOT_AVAILABLE (null), nie zgadnięty stan', () => {
    const beyond: TemporalMultiverseSpec = { ...SPEC, branches: [{ branchId: 'C', scenarioId: 'ISOLATION', interventionStartDay: 9999 }] };
    const entry = temporalDecisionLineage(runTemporalMultiverse(beyond))[0]!;

    expect(entry.decisionState).toBeNull();
  });

  it('replay zachowuje pochodzenie: odtworzony multiverse daje to samo lineage co oryginał', () => {
    const original = runTemporalMultiverse(SPEC);
    const saved = buildSavedTemporalMultiverse(original);
    const replay = replaySavedTemporalMultiverse(saved);

    expect(replay.status).toBe('MATCH');
    expect(temporalDecisionLineage(replay.multiverse!)).toEqual(temporalDecisionLineage(original));
  });

  it('nie mutuje przekazanego multiverse', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const snapshot = JSON.parse(JSON.stringify(multiverse));
    temporalDecisionLineage(multiverse);

    expect(JSON.parse(JSON.stringify(multiverse))).toEqual(snapshot);
  });

  it('typ TemporalMultiverse jest osiągalny wyłącznie przez realny run albo zweryfikowany MATCH replay — nieodtworzona gałąź nie ma tu wstępu', () => {
    const original = runTemporalMultiverse(SPEC);
    const saved = buildSavedTemporalMultiverse(original);
    const tampered = { ...saved, branches: saved.branches.map((b, i) => (i === 0 ? { ...b, saved: { ...b.saved, resultFingerprint: 'deadbeef' } } : b)) };
    const replay = replaySavedTemporalMultiverse(tampered);

    expect(replay.status).not.toBe('MATCH');
    expect(replay.multiverse).toBeNull();
    // Bez `multiverse` nie ma jak zawołać temporalDecisionLineage — sfałszowana
    // gałąź nigdy nie dostaje typu, który ta funkcja przyjmuje.
  });
});
