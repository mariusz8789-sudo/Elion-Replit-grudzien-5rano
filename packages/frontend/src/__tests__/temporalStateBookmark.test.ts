import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { buildSavedScenarioRunContext } from '../core/simulation/scenarioMemory';
import { buildSavedScenarioCounterfactual, runScenarioCounterfactual } from '../core/simulation/scenarioCounterfactual';
import { buildSavedTemporalMultiverse, runTemporalMultiverse, type TemporalMultiverseSpec } from '../core/simulation/temporalMultiverse';
import { createTemporalStateBookmark, resolveTemporalStateBookmark } from '../core/simulation/temporalStateBookmark';

/**
 * ZAKŁADKA STANU CZASOWEGO.
 *
 * Jedyne, czego te testy pilnują: zakładka nigdy nie prowadzi do stanu bez
 * przejścia przez realny replay źródła, ten sam adres zawsze rozwiązuje się
 * w ten sam stan, a zepsuty/nieistniejący cel kończy się jawnym powodem, nie
 * zmyślonym envelope.
 */

const RUN_OPTS = { days: 16, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260901 } };

const MULTIVERSE_SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'BASELINE',
  days: 16,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260901 },
  branches: [
    { branchId: 'A', scenarioId: 'ISOLATION' },
    { branchId: 'B', scenarioId: 'ISOLATION', interventionStartDay: 8 },
  ],
};

describe('Adresowanie pojedynczego przebiegu', () => {
  it('rozwiązuje się w MATCH z envelope zgodnym z realną serią', () => {
    const run = runScenario('BASELINE', RUN_OPTS);
    const saved = buildSavedScenarioRunContext(run);
    const bookmark = createTemporalStateBookmark({ kind: 'run', saved }, 5);
    const resolution = resolveTemporalStateBookmark(bookmark);

    expect(resolution.status).toBe('MATCH');
    if (resolution.status === 'MATCH') {
      expect(resolution.envelope.logicalDay).toBe(5);
      expect(resolution.envelope.sample).toEqual(run.series.find((s) => s.day === 5));
      expect(resolution.envelope.observationStatus).toBe('SIMULATED');
    }
  });

  it('dzień spoza osi jest BLOCKED, nie obcięty do najbliższego', () => {
    const saved = buildSavedScenarioRunContext(runScenario('BASELINE', RUN_OPTS));
    const resolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'run', saved }, 999));

    expect(resolution.status).toBe('BLOCKED');
  });

  it('uszkodzony zapis nie rozwiązuje się w MATCH', () => {
    const saved = buildSavedScenarioRunContext(runScenario('BASELINE', RUN_OPTS));
    const tampered = { ...saved, resultFingerprint: 'deadbeef' };
    const resolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'run', saved: tampered }, 5));

    expect(resolution.status).not.toBe('MATCH');
  });

  it('odrzuca dzień ujemny albo niecałkowity przy tworzeniu, zamiast cichego zaokrąglenia', () => {
    const saved = buildSavedScenarioRunContext(runScenario('BASELINE', RUN_OPTS));
    expect(() => createTemporalStateBookmark({ kind: 'run', saved }, -1)).toThrow();
    expect(() => createTemporalStateBookmark({ kind: 'run', saved }, 3.5)).toThrow();
  });
});

describe('Adresowanie ramienia kontrfaktyku', () => {
  const spec = { baselineScenarioId: 'BASELINE', variantScenarioId: 'ISOLATION', days: 16, stepsPerDay: 2, baseParams: RUN_OPTS.baseParams } as const;

  it('baseline i variant rozwiązują się w różne, poprawne stany', () => {
    const saved = buildSavedScenarioCounterfactual(runScenarioCounterfactual(spec));
    const baselineResolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'counterfactual-baseline', saved }, 6));
    const variantResolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'counterfactual-variant', saved }, 6));

    expect(baselineResolution.status).toBe('MATCH');
    expect(variantResolution.status).toBe('MATCH');
    if (baselineResolution.status === 'MATCH' && variantResolution.status === 'MATCH') {
      expect(baselineResolution.envelope.branchRole).toBe('BASELINE');
      expect(variantResolution.envelope.branchRole).toBe('VARIANT');
      expect(baselineResolution.envelope.observationStatus).toBe('SIMULATED');
      expect(variantResolution.envelope.observationStatus).toBe('COUNTERFACTUAL');
    }
  });
});

describe('Adresowanie multiverse', () => {
  it('baseline i nazwana gałąź rozwiązują się poprawnie', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(MULTIVERSE_SPEC));
    const baselineResolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'multiverse-baseline', saved }, 4));
    const branchResolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'B' }, 4));

    expect(baselineResolution.status).toBe('MATCH');
    expect(branchResolution.status).toBe('MATCH');
    if (branchResolution.status === 'MATCH') expect(branchResolution.envelope.branchRole).toBe('VARIANT');
  });

  it('nieistniejąca gałąź jest BLOCKED, nie ciche MATCH na czymś innym', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(MULTIVERSE_SPEC));
    const resolution = resolveTemporalStateBookmark(createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'Z-nie-istnieje' }, 4));

    expect(resolution.status).toBe('BLOCKED');
  });

  it('multiverse z gałęzią NOT_MODELED nie da się w ogóle zapisać — nie ma czego adresować', () => {
    // buildSavedTemporalMultiverse dziedziczy tę bramkę z buildSavedScenarioRunContext:
    // niewykonany przebieg nie ma czego zapisać w pamięci, więc zakładka nigdy nie
    // powstaje nad czymś, co nie istnieje jako realny wynik.
    const specWithNotModeled: TemporalMultiverseSpec = { ...MULTIVERSE_SPEC, branches: [{ branchId: 'X', scenarioId: 'VACCINATION' }] };
    expect(() => buildSavedTemporalMultiverse(runTemporalMultiverse(specWithNotModeled))).toThrow(/nie został wykonany/);
  });
});

describe('Determinizm adresu', () => {
  it('ten sam zapis i dzień dają ten sam bookmarkId; inny dzień albo inna gałąź — inny', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(MULTIVERSE_SPEC));
    const a1 = createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'A' }, 4);
    const a2 = createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'A' }, 4);
    const aOtherDay = createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'A' }, 5);
    const bSameDay = createTemporalStateBookmark({ kind: 'multiverse-branch', saved, branchId: 'B' }, 4);

    expect(a2.bookmarkId).toBe(a1.bookmarkId);
    expect(aOtherDay.bookmarkId).not.toBe(a1.bookmarkId);
    expect(bSameDay.bookmarkId).not.toBe(a1.bookmarkId);
  });
});

describe('Brak duplikatu systemu', () => {
  it('moduł jest wyłącznie adresem nad istniejącymi replay-ami, nie liczy sam i nie zapisuje sam', async () => {
    const source = ((await import('../core/simulation/temporalStateBookmark?raw')) as { default: string }).default;

    expect(source).toMatch(/from '\.\/scenarioMemory'/);
    expect(source).toMatch(/from '\.\/scenarioCounterfactual'/);
    expect(source).toMatch(/from '\.\/temporalMultiverse'/);
    expect(source).toMatch(/from '\.\/temporalState'/);
    expect(source).not.toMatch(/runScenario\(|runScenarioCounterfactual\(|runTemporalMultiverse\(/);
    expect(source).not.toMatch(/localStorage|writeJSON|new Renderer/);
  });
});
