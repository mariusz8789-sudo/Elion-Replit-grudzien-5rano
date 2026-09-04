import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  assertGovernedCatalog,
  governedCounterfactualParameters,
  GOVERNED_PREPAREDNESS_QUESTIONS,
  PREPAREDNESS_QUESTION_CONTRACT_VERSION,
  resolvePreparednessQuestion,
} from '../core/simulation/preparednessQuestions';
import {
  collectNotModeledEffects,
  describeScenarioEffects,
  SCENARIO_DISCLOSURE_CONTRACT_VERSION,
} from '../core/simulation/scenarioDisclosure';
import { runScenario, SCENARIOS } from '../core/simulation/scenarioEngine';
import { runScenarioCounterfactual, buildSavedScenarioCounterfactual, replaySavedScenarioCounterfactual } from '../core/simulation/scenarioCounterfactual';
import { buildSavedScenarioRunContext, isSavedScenarioRunContext, replaySavedScenarioRun } from '../core/simulation/scenarioMemory';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { getRouterModel } from '../core/experimentFabric/router';
import { COHORT_NOT_MODELED } from '../core/agents/cohortModel';
import { HOSPITAL_NOT_MODELED } from '../core/simulation/hospitalResource';
import { WORLD_NOT_MODELED } from '../core/simulation/worldEngineContract';

/**
 * EVIDENCE-GATED COUNTERFACTUAL PREPAREDNESS TWIN — dwa konektory.
 *
 * Te testy nie sprawdzają fizyki (ta jest sprawdzona osobno). Sprawdzają
 * granice, na których łatwo byłoby oszukać: że pytanie spoza katalogu NICZEGO
 * nie uruchamia, że lista „czego model nie liczy" pochodzi z istniejących
 * rejestrów, a nie z nowego katalogu, i że jedno i drugie przeżywa zapis oraz
 * podlega temu samemu rygorowi odtworzenia co liczby.
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

const SMALL = { days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 } } as const;

describe('Konektor 1 — rządzone pytanie o gotowość', () => {
  it('katalog wskazuje wyłącznie istniejące, MODELOWANE scenariusze', () => {
    expect(PREPAREDNESS_QUESTION_CONTRACT_VERSION).toBe('1.0.0');
    expect(() => assertGovernedCatalog()).not.toThrow();
    for (const entry of GOVERNED_PREPAREDNESS_QUESTIONS) {
      expect(SCENARIOS[entry.baselineScenarioId]).toBeDefined();
      expect(SCENARIOS[entry.variantScenarioId]).toBeDefined();
      expect(SCENARIOS[entry.variantScenarioId].notModeledReason).toBeUndefined();
    }
  });

  it('odrzuca katalog wskazujący scenariusz niemodelowany', () => {
    const broken = [{ ...GOVERNED_PREPAREDNESS_QUESTIONS[0]!, variantScenarioId: 'VACCINATION' as const }];
    expect(() => assertGovernedCatalog(broken)).toThrow(/niemodelowany/i);
  });

  it('mapuje pytanie kanoniczne i zadeklarowaną frazę na ten sam kontrakt', () => {
    const canonical = resolvePreparednessQuestion(GOVERNED_PREPAREDNESS_QUESTIONS[0]!.question);
    const phrased = resolvePreparednessQuestion('Zastanawiam się nad opóźnieniem izolacji w tym mieście');

    expect(canonical.status).toBe('GOVERNED');
    expect(phrased.status).toBe('GOVERNED');
    expect(phrased.question?.questionId).toBe(canonical.question?.questionId);
    // Zapisujemy DOSŁOWNIE to, co napisał użytkownik, nie parafrazę.
    expect(phrased.askedText).toBe('Zastanawiam się nad opóźnieniem izolacji w tym mieście');
  });

  it('pytanie spoza katalogu jest NOT_AVAILABLE i NIE dostaje scenariusza', () => {
    const resolution = resolvePreparednessQuestion('Ile budynków runie po trzęsieniu ziemi o magnitudzie 7 w moim mieście?');

    expect(resolution.status).toBe('NOT_AVAILABLE');
    expect(resolution.question).toBeNull();
    expect(resolution.reason).toMatch(/nie uruchamia|nie jest związane/i);
    // Użytkownik ma zobaczyć, co ISTNIEJE, zamiast dostać podstawiony scenariusz.
    expect(resolution.available.length).toBe(GOVERNED_PREPAREDNESS_QUESTIONS.length);
  });

  it('nie podstawia „prawie pasującego" scenariusza', () => {
    for (const text of ['powódź w mieście', 'atak chemiczny', 'przerwa w dostawie prądu', '']) {
      expect(resolvePreparednessQuestion(text).status).toBe('NOT_AVAILABLE');
    }
  });

  it('parametry przebiegu pochodzą WYŁĄCZNIE z zadeklarowanych dźwigni', () => {
    const question = GOVERNED_PREPAREDNESS_QUESTIONS[0]!;
    const parameters = governedCounterfactualParameters(question);

    expect(parameters.baselineScenarioId).toBe(question.baselineScenarioId);
    expect(parameters.variantScenarioId).toBe(question.variantScenarioId);
    expect(parameters.seed).toBe(question.levers.seed);
    expect(parameters.variantInterventionStartDay).toBe(question.levers.variantInterventionStartDay);
    // Żadnego pola spoza rządzonego zestawu.
    expect(Object.keys(parameters).sort()).toEqual([
      'baselineInterventionStartDay', 'baselineScenarioId', 'days', 'initialInfected',
      'nAgents', 'seed', 'stepsPerDay', 'variantInterventionStartDay', 'variantScenarioId',
    ]);
  });

  it('to samo pytanie daje ten sam odcisk rozstrzygnięcia, inne pytanie inny', () => {
    const a = resolvePreparednessQuestion(GOVERNED_PREPAREDNESS_QUESTIONS[0]!.question);
    const b = resolvePreparednessQuestion(GOVERNED_PREPAREDNESS_QUESTIONS[0]!.question);
    const c = resolvePreparednessQuestion(GOVERNED_PREPAREDNESS_QUESTIONS[1]!.question);

    expect(b.resolutionFingerprint).toBe(a.resolutionFingerprint);
    expect(c.resolutionFingerprint).not.toBe(a.resolutionFingerprint);
  });

  it('rządzone pytanie wykonuje REALNY kontrfaktyk przez istniejący kontrakt', () => {
    const question = GOVERNED_PREPAREDNESS_QUESTIONS[0]!;
    const resolution = resolvePreparednessQuestion(question.question);
    const request = buildStructuredRequestFromModel(getRouterModel('scenario-counterfactual')!, {
      ...governedCounterfactualParameters(question),
      preparednessQuestionId: question.questionId,
      preparednessAskedText: resolution.askedText,
    }, { sourceText: resolution.askedText, seed: question.levers.seed });
    const run = runExperiment(request);

    expect(run.result.status).toBe('completed');
    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.parameterSnapshot.preparednessQuestionId).toBe(question.questionId);
    expect(run.result.outputs.delta_totalDeaths).toBeDefined();
  });
});

describe('Konektor 2 — modelowane vs NOT_MODELED', () => {
  it('lista NOT_MODELED pochodzi z ISTNIEJĄCYCH rejestrów, nie z nowego katalogu', () => {
    const effects = collectNotModeledEffects().map((entry) => entry.effect);

    for (const declared of [...COHORT_NOT_MODELED, ...HOSPITAL_NOT_MODELED, ...WORLD_NOT_MODELED]) {
      expect(effects).toContain(declared);
    }
    // Każdy wpis wskazuje rejestr, który go zadeklarował.
    for (const entry of collectNotModeledEffects()) expect(entry.declaredBy).toMatch(/\./);
    // Bez duplikatów mimo nakładających się rejestrów.
    expect(new Set(effects).size).toBe(effects.length);
  });

  it('efekt trafia na listę MODELOWANE tylko z realnie obecnym polem wyniku', () => {
    const run = runScenario('ISOLATION', { ...SMALL, interventionStartDay: 6 });
    const disclosure = describeScenarioEffects(run);

    expect(disclosure.contractVersion).toBe(SCENARIO_DISCLOSURE_CONTRACT_VERSION);
    for (const entry of disclosure.modeled) {
      expect(entry.evidenceField).toMatch(/^Scenario(Run|Summary)\./);
      expect(entry.value === 0 || Boolean(entry.value)).toBe(true);
    }
    const deaths = disclosure.modeled.find((entry) => entry.evidenceField.includes('totalDeaths'))!;
    expect(deaths.value).toBe(run.summary!.totalDeaths);
    // Dzień wejścia interwencji jest modelowany tylko wtedy, gdy realnie użyty.
    expect(disclosure.modeled.some((entry) => entry.evidenceField.includes('interventionStartDay'))).toBe(true);
    expect(describeScenarioEffects(runScenario('ISOLATION', SMALL)).modeled
      .some((entry) => entry.evidenceField.includes('interventionStartDay'))).toBe(false);
  });

  it('granica mówi wprost, że to nie jest prognoza ani wskazówka operacyjna', () => {
    const boundary = describeScenarioEffects(runScenario('BASELINE', SMALL)).boundary;

    expect(boundary).toMatch(/nie jest skalibrowany/i);
    expect(boundary).toMatch(/NON_OPERATIONAL/);
    expect(boundary).toMatch(/nie wolno ich odczytywać jako zera/i);
  });

  it('przebieg NOT_MODELED nie dostaje ani jednego efektu modelowanego', () => {
    const run = runScenario('VACCINATION', SMALL);
    const disclosure = describeScenarioEffects(run);

    expect(run.status).toBe('NOT_MODELED');
    expect(disclosure.modeled).toEqual([]);
    expect(disclosure.boundary).toMatch(/nie jest modelowany/i);
  });
});

describe('Ujawnienie i pytanie przeżywają zapis i podlegają odtworzeniu', () => {
  it('kontekst zapisu niesie pytanie i ujawnienie', () => {
    const run = runScenario('ISOLATION', SMALL);
    const preparedness = { questionId: 'prep:isolation-timing', askedText: 'ile kosztuje opóźnienie?', resolutionFingerprint: 'abc12345' };
    const saved = buildSavedScenarioRunContext(run, preparedness);

    expect(isSavedScenarioRunContext(saved)).toBe(true);
    expect(saved.preparedness).toEqual(preparedness);
    expect(saved.disclosure?.notModeled.length).toBeGreaterThan(0);
    expect(replaySavedScenarioRun(saved).status).toBe('MATCH');
  });

  it('podmienione ujawnienie kończy się DRIFT — nie wolno przepisać, czego model nie liczy', () => {
    const saved = buildSavedScenarioRunContext(runScenario('ISOLATION', SMALL));
    const tampered = { ...saved, disclosure: { ...saved.disclosure!, notModeled: [] } };
    const replay = replaySavedScenarioRun(tampered);

    expect(replay.status).toBe('DRIFT');
    expect(replay.run).toBeNull();
    expect(replay.differences.map((entry) => entry.field)).toContain('disclosure.notModeledCount');
  });

  it('kontrfaktyk niesie pytanie w obu ramionach i nadal odtwarza się jako MATCH', () => {
    const counterfactual = runScenarioCounterfactual({
      baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
      days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
      baselineInterventionStartDay: 0, variantInterventionStartDay: 8,
    });
    const preparedness = { questionId: 'prep:isolation-timing', askedText: 'a gdyby później?', resolutionFingerprint: 'fp999999' };
    const saved = buildSavedScenarioCounterfactual(counterfactual, preparedness);

    expect(saved.preparedness).toEqual(preparedness);
    expect(saved.baseline.preparedness).toEqual(preparedness);
    expect(saved.variant.disclosure?.notModeled.length).toBeGreaterThan(0);
    expect(replaySavedScenarioCounterfactual(saved).status).toBe('MATCH');
  });

  it('pełny łańcuch: zapis → przeładowanie → odtworzenie MATCH, z pytaniem i ujawnieniem', async () => {
    const storage = makeFakeStorage();
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const memory = await import('../core/scienceMemory');
    const preparedness = { questionId: 'prep:isolation-timing', askedText: 'ile kosztuje opóźnienie izolacji?', resolutionFingerprint: 'fp000001' };
    memory.saveScenarioRunToMemory(runScenario('ISOLATION', { ...SMALL, interventionStartDay: 6 }), undefined, preparedness);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const reloaded = await import('../core/scienceMemory');
    const record = reloaded.listExperiments()[0]!;

    expect(record.scenario?.preparedness?.questionId).toBe('prep:isolation-timing');
    expect(record.scenario?.disclosure?.notModeled.length).toBeGreaterThan(0);
    const { replaySavedScenarioRun: replayAfterReload } = await import('../core/simulation/scenarioMemory');
    expect(replayAfterReload(record.scenario).status).toBe('MATCH');
  });
});

describe('Brak duplikatów silników i magazynów', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('konektory nie importują silnika, magazynu ani renderera', async () => {
    // Izolacja sprawdzana na ŹRÓDLE, nie na deklaracji: konektor, który
    // zaimportowałby solver albo store, byłby początkiem drugiego systemu.
    const sources = await Promise.all([
      import('../core/simulation/preparednessQuestions?raw'),
      import('../core/simulation/scenarioDisclosure?raw'),
    ]);
    for (const module of sources) {
      const source = (module as { default: string }).default;
      expect(source).not.toMatch(/from '.*epidemicCity'/);
      expect(source).not.toMatch(/from '.*scienceMemory'/);
      expect(source).not.toMatch(/from '.*storage'/);
      expect(source).not.toMatch(/from '.*three\//);
      expect(source).not.toMatch(/writeJSON|localStorage|new Renderer/);
    }
    // Konektor pytania niczego nie wykonuje — nie wystawia funkcji uruchamiającej model.
    const preparednessModule = await import('../core/simulation/preparednessQuestions');
    expect(Object.keys(preparednessModule).some((key) => /^run[A-Z]/.test(key))).toBe(false);
  });
});

describe('Konektor 3 — odtworzony kontrfaktyk trafia do świata 3D', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  const counterfactual = () => runScenarioCounterfactual({
    baselineScenarioId: 'ISOLATION', variantScenarioId: 'ISOLATION',
    days: 18, stepsPerDay: 2, baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
    baselineInterventionStartDay: 0, variantInterventionStartDay: 8,
  });

  it('MATCH przekazuje do świata ramię WARIANTU z PRZELICZENIA', async () => {
    const { openSavedCounterfactualInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const source = counterfactual();
    const preparedness = { questionId: 'prep:isolation-timing', askedText: 'a gdyby później?', resolutionFingerprint: 'fp123456' };
    const result = openSavedCounterfactualInWorld(buildSavedScenarioCounterfactual(source, preparedness), { recordId: 'rec-cf' });

    expect(result.replay.status).toBe('MATCH');
    expect(result.opened).toBe(true);

    const handoff = consumePendingScenarioTimeline();
    expect(handoff!.origin).toBe('memory-replay');
    expect(handoff!.replayVerdict).toBe('MATCH');
    expect(handoff!.preparedness).toEqual(preparedness);
    // Do świata idzie WARIANT, nie odniesienie.
    expect(handoff!.series[handoff!.series.length - 1]).toEqual(source.variant.series[source.variant.series.length - 1]);
    expect(handoff!.counterfactual?.baseline.resultFingerprint).toBe(source.baseline.resultFingerprint);
  });

  it('zweryfikowany wariant przy zepsutym odniesieniu NIE otwiera świata', async () => {
    const { openSavedCounterfactualInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const saved = buildSavedScenarioCounterfactual(counterfactual());
    const result = openSavedCounterfactualInWorld({
      ...saved,
      baseline: { ...saved.baseline, resultFingerprint: 'deadbeef' },
    }, { recordId: 'rec-broken' });

    expect(result.replay.status).toBe('DRIFT');
    expect(result.opened).toBe(false);
    expect(consumePendingScenarioTimeline()).toBeNull();
  });

  it('uszkodzony zapis kończy się BLOCKED i pustym światem', async () => {
    const { openSavedCounterfactualInWorld } = await import('../core/simulation/scenarioWorldReplay');
    const { consumePendingScenarioTimeline } = await import('../core/experimentFabric/worldHandoff');
    const result = openSavedCounterfactualInWorld({ contractVersion: '1.0.0' }, { recordId: 'rec-bad' });

    expect(result.replay.status).toBe('BLOCKED');
    expect(result.opened).toBe(false);
    expect(consumePendingScenarioTimeline()).toBeNull();
  });
});
