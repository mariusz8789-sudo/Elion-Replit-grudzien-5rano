import { describe, expect, it } from 'vitest';
import { SCENARIOS_NOT_MODELED } from '../core/simulation/scenarioEngine';
import { temporalStateAt } from '../core/simulation/temporalState';
import {
  buildSavedTemporalMultiverse,
  isSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * WIELE ŚWIATÓW.
 *
 * Jeden T0, trzy realne gałęzie. Testy pilnują, że każda gałąź jest osobnym,
 * realnym przebiegiem z mierzonym (nie zakładanym) rozjazdem od baseline, że
 * multiverse jest deterministyczny i odtwarzalny, i że jedna zdryfowana
 * gałąź psuje odtworzenie CAŁOŚCI — tak samo jak w kontrfaktyku.
 */

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'BASELINE',
  days: 20,
  stepsPerDay: 2,
  baseParams: { nAgents: 140, initialInfected: 5, seed: 20260831 },
  branches: [
    { branchId: 'A — bez interwencji', scenarioId: 'BASELINE' },
    { branchId: 'B — izolacja od dnia 0', scenarioId: 'ISOLATION' },
    { branchId: 'C — izolacja od dnia 10', scenarioId: 'ISOLATION', interventionStartDay: 10 },
  ],
};

describe('Uruchomienie multiverse', () => {
  it('odrzuca pustą listę gałęzi zamiast cichego no-opa', () => {
    expect(() => runTemporalMultiverse({ ...SPEC, branches: [] })).toThrow(/co najmniej jednej gałęzi/);
  });

  it('odrzuca powtórzone identyfikatory gałęzi', () => {
    expect(() => runTemporalMultiverse({ ...SPEC, branches: [SPEC.branches[0]!, SPEC.branches[0]!] })).toThrow(/unikalne/);
  });

  it('każda gałąź to osobny, realny przebieg z własną osią czasu', () => {
    const multiverse = runTemporalMultiverse(SPEC);

    expect(multiverse.branches).toHaveLength(3);
    for (const branch of multiverse.branches) {
      expect(branch.run.status).toBe('COMPLETED');
      expect(branch.timeline).not.toBeNull();
      expect(branch.timeline!.states).toHaveLength(branch.run.days + 1);
      expect(temporalStateAt(branch.timeline!, 5)?.sample).toEqual(branch.run.series.find((s) => s.day === 5) ?? null);
    }
  });

  it('gałąź A (identyczna z baseline) nie rozjeżdża się — B i C tak', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const byId = Object.fromEntries(multiverse.branches.map((b) => [b.branchId, b]));

    expect(byId['A — bez interwencji']!.firstDivergentDayFromBaseline).toBeNull();
    expect(byId['B — izolacja od dnia 0']!.firstDivergentDayFromBaseline).not.toBeNull();
    expect(byId['C — izolacja od dnia 10']!.firstDivergentDayFromBaseline).not.toBeNull();
    // Późniejsze wejście interwencji nie może rozjechać świata WCZEŚNIEJ niż natychmiastowe.
    expect(byId['C — izolacja od dnia 10']!.firstDivergentDayFromBaseline!).toBeGreaterThanOrEqual(byId['B — izolacja od dnia 0']!.firstDivergentDayFromBaseline!);
  });

  it('jest deterministyczny: ten sam spec daje ten sam odcisk multiverse', () => {
    const first = runTemporalMultiverse(SPEC);
    const second = runTemporalMultiverse(SPEC);
    const other = runTemporalMultiverse({ ...SPEC, baseParams: { ...SPEC.baseParams, seed: 777 } });

    expect(second.multiverseFingerprint).toBe(first.multiverseFingerprint);
    expect(other.multiverseFingerprint).not.toBe(first.multiverseFingerprint);
  });

  it('gałąź NOT_MODELED daje BLOCKED_NOT_MODELED, nie fabrykowane porównanie', () => {
    const notModeled = SCENARIOS_NOT_MODELED[0]!;
    const multiverse = runTemporalMultiverse({ ...SPEC, branches: [{ branchId: 'X', scenarioId: notModeled }] });

    expect(multiverse.branches[0]!.run.status).toBe('NOT_MODELED');
    expect(multiverse.branches[0]!.comparisonToBaseline.status).toBe('BLOCKED_NOT_MODELED');
    expect(multiverse.branches[0]!.firstDivergentDayFromBaseline).toBeNull();
    expect(multiverse.branches[0]!.timeline).toBeNull();
  });
});

describe('Zapis i odtworzenie multiverse', () => {
  it('zapisuje baseline i każdą gałąź istniejącym kontraktem SavedScenarioRunContext', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));

    expect(isSavedTemporalMultiverse(saved)).toBe(true);
    expect(saved.branches).toHaveLength(3);
    expect(saved.branches.map((b) => b.branchId)).toEqual(['A — bez interwencji', 'B — izolacja od dnia 0', 'C — izolacja od dnia 10']);
  });

  it('odtwarza niezmieniony multiverse jako MATCH z realnymi przeliczonymi gałęziami', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));
    const replay = replaySavedTemporalMultiverse(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.branches.every((b) => b.status === 'MATCH')).toBe(true);
    expect(replay.multiverse).not.toBeNull();
    expect(replay.multiverse!.branches).toHaveLength(3);
  });

  it('jedna zdryfowana gałąź psuje odtworzenie CAŁEGO multiverse', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));
    const tampered = {
      ...saved,
      branches: saved.branches.map((branch, index) =>
        index !== 1 ? branch : { ...branch, saved: { ...branch.saved, resultFingerprint: 'deadbeef' } }),
    };
    const replay = replaySavedTemporalMultiverse(tampered);

    expect(replay.status).not.toBe('MATCH');
    expect(replay.multiverse).toBeNull();
    expect(replay.branches.find((b) => b.branchId === 'B — izolacja od dnia 0')?.status).not.toBe('MATCH');
  });

  it('podmiana zapisanego rozjazdu przy nietkniętych ramionach daje DRIFT, nie ciche MATCH', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const saved = buildSavedTemporalMultiverse(multiverse);
    const tampered = {
      ...saved,
      branches: saved.branches.map((branch, index) =>
        index !== 1 ? branch : { ...branch, firstDivergentDayFromBaseline: (branch.firstDivergentDayFromBaseline ?? 0) + 5 }),
    };
    const replay = replaySavedTemporalMultiverse(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.multiverse).toBeNull();
  });

  it('uszkodzony/niekompletny zapis jest BLOCKED, nigdy CREATED po cichu', () => {
    expect(replaySavedTemporalMultiverse(undefined).status).toBe('BLOCKED');
    expect(replaySavedTemporalMultiverse({}).status).toBe('BLOCKED');
    expect(replaySavedTemporalMultiverse({ ...buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC)), branches: [] }).status).toBe('BLOCKED');
  });
});

describe('Brak duplikatu systemu', () => {
  it('moduł komponuje istniejące prymitywy zamiast liczyć fizykę sam', async () => {
    const source = ((await import('../core/simulation/temporalMultiverse?raw')) as { default: string }).default;

    expect(source).toMatch(/from '\.\/scenarioEngine'/);
    expect(source).toMatch(/from '\.\/scenarioCounterfactual'/);
    expect(source).toMatch(/from '\.\/temporalState'/);
    expect(source).toMatch(/from '\.\/scenarioMemory'/);
    // Nie liczy sam epidemii ani nie mutuje symulacji bezpośrednio.
    expect(source).not.toMatch(/new EpidemicCitySimulation/);
    expect(source).not.toMatch(/\.tick\(/);
    expect(source).not.toMatch(/localStorage|writeJSON|new Renderer/);
  });
});
