import { describe, expect, it } from 'vitest';
import {
  executePreregisteredHypotheses,
  generateCompetingHypotheses,
  HYPOTHESIS_LOOP_CONTRACT_VERSION,
  HYPOTHESIS_PROBLEMS,
  NEXT_EXPERIMENT_PRIORITY,
  preregisterHypotheses,
  selectNextHypothesisExperiment,
  verifyPreregistrationIntact,
  type HypothesisProblem,
} from '../core/experimentFabric/hypothesisLoop';
import { getRouterModel } from '../core/experimentFabric/router';

/**
 * AUTONOMICZNA PĘTLA HIPOTEZ.
 *
 * Testy nie sprawdzają, czy „powstały trzy hipotezy" — to byłoby sprawdzanie
 * generatora tekstu. Sprawdzają granice, na których taka pętla przestaje być
 * nauką: HARK-owanie, hipotezy nierozróżnialne, wymyślony parametr, status
 * awansowany bez powtarzalnej liczby i remis udający rozstrzygnięcie.
 */

const PROBLEM = HYPOTHESIS_PROBLEMS[0]!;
/** Mały, ale realny wariant tego samego problemu — krótszy horyzont. */
const SMALL: HypothesisProblem = {
  ...PROBLEM,
  sharedLevers: { days: 18, stepsPerDay: 2, nAgents: 120, initialInfected: 4, seed: 20260831, interventionStartDay: 0 },
};

describe('Generowanie konkurencyjnych hipotez', () => {
  it('wyprowadza po jednej hipotezie na zadeklarowanego kandydata', () => {
    const set = generateCompetingHypotheses(SMALL);

    expect(set.contractVersion).toBe(HYPOTHESIS_LOOP_CONTRACT_VERSION);
    expect(set.hypotheses).toHaveLength(SMALL.candidateValues.length);
    expect(set.discriminable).toBe(true);
  });

  it('każda hipoteza niesie komplet wymaganych pól', () => {
    for (const hypothesis of generateCompetingHypotheses(SMALL).hypotheses) {
      expect(hypothesis.hypothesisId).toMatch(/^hyp_[0-9a-f]{8}$/);
      expect(hypothesis.problemId).toBe(SMALL.problemId);
      expect(hypothesis.statement).toBeTruthy();
      expect(hypothesis.rationale).toBeTruthy();
      expect(hypothesis.assumptions.length).toBeGreaterThan(0);
      expect(hypothesis.predictedOutcome).toMatch(/Jeżeli hipoteza jest prawdziwa/);
      expect(hypothesis.falsificationCriteria.metric).toBe(SMALL.primaryMetric);
      expect(hypothesis.requiredEvidence.length).toBeGreaterThan(0);
      expect(hypothesis.candidateVariables).toEqual([SMALL.candidateVariable]);
      expect(hypothesis.expectedDiscriminator).toBeTruthy();
      expect(hypothesis.provenance).toContain('source:declared-model-surface');
      expect(hypothesis.status).toBe('HYPOTHESIS');
      expect(hypothesis.createdBeforeRun).toBe(false);
    }
  });

  it('hipotezy są REALNIE konkurencyjne — każda wskazuje innego zwycięzcę', () => {
    const set = generateCompetingHypotheses(SMALL);
    const statements = new Set(set.hypotheses.map((entry) => entry.statement));
    const predictions = new Set(set.hypotheses.map((entry) => entry.predictedOutcome));

    expect(statements.size).toBe(set.hypotheses.length);
    expect(predictions.size).toBe(set.hypotheses.length);
    // Każda przewiduje przewagę NAD pozostałymi wymienionymi z nazwy.
    for (const hypothesis of set.hypotheses) {
      const others = SMALL.candidateValues.filter((value) => !hypothesis.statement.includes(String(value)));
      expect(others.length).toBeGreaterThan(0);
    }
  });

  it('proponowany eksperyment używa WYŁĄCZNIE parametrów istniejących w schemacie', () => {
    const declared = new Set(getRouterModel(SMALL.modelId)!.parameters.map((entry) => entry.id));

    for (const hypothesis of generateCompetingHypotheses(SMALL).hypotheses) {
      expect(hypothesis.proposedExperiment).not.toBeNull();
      for (const key of Object.keys(hypothesis.proposedExperiment!.parameters)) {
        expect(declared.has(key)).toBe(true);
      }
    }
  });

  it('nieistniejąca zmienna daje BLOCKED z powodem, nie wymyślony parametr', () => {
    const broken = generateCompetingHypotheses({ ...SMALL, candidateVariable: 'nieistniejacaDzwignia' });

    expect(broken.discriminable).toBe(false);
    for (const hypothesis of broken.hypotheses) {
      expect(hypothesis.status).toBe('BLOCKED');
      expect(hypothesis.proposedExperiment).toBeNull();
      expect(hypothesis.blockedReason).toMatch(/nie istnieje w aktualnym schemacie/);
    }
  });

  it('ten sam problem daje te same identyfikatory hipotez', () => {
    const a = generateCompetingHypotheses(SMALL).hypotheses.map((entry) => entry.hypothesisId);
    const b = generateCompetingHypotheses(SMALL).hypotheses.map((entry) => entry.hypothesisId);

    expect(b).toEqual(a);
  });
});

describe('Prerejestracja i ochrona przed HARK-owaniem', () => {
  it('zamraża zbiór i oznacza go jako utworzony przed przebiegiem', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));

    expect(prereg.preregistrationId).toMatch(/^prereg_[0-9a-f]{8}$/);
    expect(prereg.createdAt).toBeTruthy();
    for (const hypothesis of prereg.hypotheses) {
      expect(hypothesis.status).toBe('PRE_REGISTERED');
      expect(hypothesis.createdBeforeRun).toBe(true);
    }
    expect(verifyPreregistrationIntact(prereg).intact).toBe(true);
  });

  it('zmiana twierdzenia po zamrożeniu jest WYKRYWANA', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));
    const tampered = prereg.hypotheses.map((entry, index) => index !== 0 ? entry : { ...entry, statement: 'przepisane po zobaczeniu wyniku' });
    const verdict = verifyPreregistrationIntact(prereg, tampered);

    expect(verdict.intact).toBe(false);
    expect(verdict.reason).toMatch(/naruszona/i);
  });

  it('podmiana kryterium falsyfikacji jest WYKRYWANA', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));
    const tampered = prereg.hypotheses.map((entry, index) => index !== 0 ? entry : {
      ...entry,
      falsificationCriteria: { ...entry.falsificationCriteria, relation: 'greater-than' as const },
    });

    expect(verifyPreregistrationIntact(prereg, tampered).intact).toBe(false);
  });

  it('dopisanie hipotezy po zamrożeniu jest WYKRYWANE', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));
    const added = [...prereg.hypotheses, { ...prereg.hypotheses[0]!, hypothesisId: 'hyp_dopisana' }];

    expect(verifyPreregistrationIntact(prereg, added).intact).toBe(false);
  });

  it('zmiana parametrów zaproponowanego eksperymentu jest WYKRYWANA', () => {
    const prereg = preregisterHypotheses(generateCompetingHypotheses(SMALL));
    const tampered = prereg.hypotheses.map((entry, index) => index !== 0 || entry.proposedExperiment === null ? entry : {
      ...entry,
      proposedExperiment: { ...entry.proposedExperiment, parameters: { ...entry.proposedExperiment.parameters, seed: 1 } },
    });

    expect(verifyPreregistrationIntact(prereg, tampered).intact).toBe(false);
  });
});

describe('Wykonanie, status i rozstrzygnięcie', () => {
  const run = () => executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(SMALL)));

  it('wykonuje REALNE przebiegi przez istniejący silnik', () => {
    const result = run();

    expect(result.allRuns.length).toBeGreaterThan(0);
    for (const experimentRun of result.allRuns) {
      expect(experimentRun.result.status).toBe('completed');
      expect(experimentRun.provenance.resultOrigin).toBe('real-engine');
      expect(experimentRun.provenance.modelId).toBe('scenario-timeline');
    }
    expect(result.preregistrationIntact.intact).toBe(true);
  });

  it('status każdej hipotezy pochodzi z prerejestrowanego kryterium, nie z tej warstwy', () => {
    const result = run();

    for (const outcome of result.outcomes) {
      expect(['SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED', 'UNKNOWN']).toContain(outcome.status);
      if (outcome.status === 'SUPPORTED' || outcome.status === 'FALSIFIED') {
        expect(outcome.criterionAssessment).toMatch(/_WITHIN_PROTOCOL$/);
        expect(outcome.observedMetric).not.toBeNull();
        expect(outcome.baselineMetric).not.toBeNull();
        expect(outcome.runIds.length).toBeGreaterThan(0);
      }
    }
  });

  it('każda wykonana hipoteza jest połączona z Evidence Pack i provenance', () => {
    const result = run();

    expect(result.packs.length).toBe(result.chains.length);
    for (const outcome of result.outcomes.filter((entry) => entry.status !== 'BLOCKED')) {
      expect(outcome.evidencePackId).toMatch(/^pack_[0-9a-f]{8}$/);
      expect(outcome.evidenceChainId).toMatch(/^evidence_[0-9a-f]{8}$/);
      expect(outcome.runFingerprints.every((entry) => entry.startsWith('run_'))).toBe(true);
    }
  });

  it('rozstrzygnięcie opiera się na REALNYM uporządkowaniu metryki', () => {
    const result = run();

    expect(result.discrimination.ranking.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.discrimination.ranking.length; i++) {
      expect(result.discrimination.ranking[i]!.metric).toBeGreaterThanOrEqual(result.discrimination.ranking[i - 1]!.metric);
    }
    if (result.discrimination.decisive) {
      expect(result.discrimination.winnerHypothesisId).toBe(result.discrimination.ranking[0]!.hypothesisId);
    } else {
      expect(result.discrimination.winnerHypothesisId).toBeNull();
    }
  });

  it('remis NIE wyłania zwycięzcy', () => {
    // Wszyscy kandydaci to ten sam scenariusz — wyniki są identyczne z definicji.
    const tie = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses({
      ...SMALL, candidateValues: ['ISOLATION', 'ISOLATION'],
    })));

    expect(tie.discrimination.decisive).toBe(false);
    expect(tie.discrimination.winnerHypothesisId).toBeNull();
    expect(tie.discrimination.reason).toMatch(/[Rr]emis/);
  });

  it('nie twierdzi odkrycia — deklaruje dokładnie to, co zrobił', () => {
    const result = run();

    expect(result.claim).toMatch(/prerejestrowane hipotezy/i);
    expect(result.claim).toMatch(/nie jest odkrycie naukowe/i);
    expect(result.claim.toLowerCase()).not.toContain('odkrył');
  });
});

describe('Następny eksperyment', () => {
  it('po rozstrzygnięciu kieruje na kontrolę pojedynczego ziarna, ze zmianą jednego pola', () => {
    const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(SMALL)));
    const next = selectNextHypothesisExperiment(result);

    expect(NEXT_EXPERIMENT_PRIORITY[0]).toBe('PREREGISTRATION_VIOLATED');
    expect(['READY_TO_RUN', 'VALIDATION_REQUIRED', 'RESOLVED']).toContain(next.status);
    if (next.status === 'READY_TO_RUN') {
      expect(next.request).not.toBeNull();
      const winner = result.preregistration.hypotheses.find((entry) => entry.hypothesisId === next.aboutHypothesisIds[0]);
      const before = winner!.proposedExperiment!.parameters;
      const after = next.request!.parameters;
      const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);
      expect(changed).toEqual(['seed']);
      expect(next.resolves).toMatch(/[Rr]ozstrzygnie/);
    }
  });

  it('naruszona prerejestracja blokuje kolejny krok zamiast go proponować', () => {
    const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(SMALL)));
    const violated = { ...result, preregistrationIntact: { intact: false, reason: 'test: odcisk się nie zgadza' } };
    const next = selectNextHypothesisExperiment(violated);

    expect(next.status).toBe('BLOCKED');
    expect(next.request).toBeNull();
    expect(next.rule).toMatch(/nie naprawia/i);
  });

  it('niewykonana hipoteza daje VALIDATION_REQUIRED, a nie kolejny przebieg', () => {
    const blockedSet = preregisterHypotheses(generateCompetingHypotheses({ ...SMALL, candidateVariable: 'nieistniejacaDzwignia' }));
    const next = selectNextHypothesisExperiment(executePreregisteredHypotheses(blockedSet));

    expect(next.status).toBe('VALIDATION_REQUIRED');
    expect(next.request).toBeNull();
    expect(next.why).toMatch(/nie zostało wykonanych|nie została wykonana/);
  });
});

describe('Brak duplikatów systemów', () => {
  it('pętla nie tworzy drugiego silnika, magazynu ani systemu dowodowego', async () => {
    const source = ((await import('../core/experimentFabric/hypothesisLoop?raw')) as { default: string }).default;

    expect(source).not.toMatch(/from '.*storage'/);
    expect(source).not.toMatch(/from '.*scienceMemory'/);
    expect(source).not.toMatch(/from '.*three\//);
    expect(source).not.toMatch(/localStorage|writeJSON|new Renderer/);
    expect(source).not.toMatch(/runScenario\(/);
    // Protokół, wykonanie i paczka pochodzą z istniejących modułów.
    expect(source).toMatch(/from '\.\/scientificPlanner'/);
    expect(source).toMatch(/from '\.\/scientificExecutor'/);
    expect(source).toMatch(/from '\.\/evidencePack'/);
  });
});
