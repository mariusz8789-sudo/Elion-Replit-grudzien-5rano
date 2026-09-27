import { describe, expect, it } from 'vitest';
import {
  buildMultiverseBranchEvidencePack,
  proposeNextMultiverseExperiment,
} from '../core/experimentFabric/multiverseEvidence';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import {
  buildSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * PĘTLA: RESULT → PROPOSE NEXT → CONSTRUCT NEXT SPEC → PRE-REGISTER → RUN → RESULT.
 *
 * `proposeNextMultiverseExperiment` nie jest drugim planerem — woła
 * DOKŁADNIE `graph.nextExperiment` (`experimentGraph.ts`, niezmienione) i
 * DOKŁADNIE `explainScientificEvidence` (`whyNextExperiment.ts`,
 * niezmienione), a jedyne co dokłada to przełożenie zaproponowanego
 * `StructuredExperimentRequest` z powrotem na `TemporalMultiverseSpec` —
 * PREREJESTROWANY tym samym pytaniem co rodzic, PRZED jakimkolwiek
 * wykonaniem.
 *
 * Ważna, zweryfikowana właściwość istniejącego `proposeNext`: niepewności są
 * liczone PO MODELU (`scenario-timeline`), nie po pojedynczej gałęzi — więc
 * zaproponowany request może odzwierciedlać PARAMETRY DOWOLNEGO ramienia
 * (baseline albo wariantu), które dzieli ten model. Testy poniżej opisują
 * FAKTYCZNE zachowanie, a nie wyidealizowane; to jest istniejąca, nietknięta
 * semantyka `proposeNext`, nie coś wprowadzonego w tym kroku.
 */

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!; // prep:isolation-timing
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-next' };

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'ISOLATION',
  days: 18,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
  branches: [{ branchId: 'B-opoznione', scenarioId: 'ISOLATION', interventionStartDay: 20 }],
  preparedness: PREPAREDNESS,
};

describe('1-2-3 — result → propozycja → wykonywalny spec → prerejestracja', () => {
  it('propozycja pochodzi z realnych danych, nie z losowego kroku', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(next.status).toBe('READY_TO_RUN');
    expect(next.proposal).not.toBeNull();
    expect(next.proposal!.why).toMatch(/scenario-timeline|ziarnie|parametr/i);
    expect(next.proposal!.request).not.toBeNull();
  });

  it('spec jest realnie wykonywalny i różni się od rodzica dokładnie jedną dźwignią zgłoszoną przez propozycję', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const nextMultiverse = runTemporalMultiverse(next.nextSpec!);

    expect(nextMultiverse.branches[0]!.run.status).toBe('COMPLETED');
    expect(nextMultiverse.multiverseFingerprint).not.toBe(multiverse.multiverseFingerprint);
  });

  it('prerejestracja jest skopiowana z rodzica PRZED wykonaniem, nigdy dorobiona', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(next.nextSpec!.preparedness).toEqual(SPEC.preparedness);
  });
});

describe('6-7-8 — pochodzenie zachowane: rodzic, pytanie, falsyfikacja, powód', () => {
  it('next wskazuje realnego rodzica po fingerprint/branchId/questionId', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(next.sourceMultiverseFingerprint).toBe(multiverse.multiverseFingerprint);
    expect(next.sourceBranchId).toBe('B-opoznione');
    expect(next.sourceQuestionId).toBe(QUESTION.questionId);
  });

  it('kryterium falsyfikacji następnego eksperymentu jest TO SAMO co rodzica', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const nextMultiverse = runTemporalMultiverse(next.nextSpec!);
    const nextEvidence = buildMultiverseBranchEvidencePack(nextMultiverse, next.nextSpec!.branches[0]!.branchId);

    expect(nextEvidence.status).toBe('CREATED');
    expect(nextEvidence.pack!.protocol.hypothesis.falsification).toEqual(QUESTION.falsification);
  });

  it('powód następnego kroku wynika z realnej reguły, nie jest generycznym tekstem', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(next.reason).toContain(next.proposal!.action);
    expect(next.reason).toContain(next.proposal!.rule);
  });
});

describe('9-10 — bramki fail-closed', () => {
  it('brak prerejestracji na rodzicu daje NOT_AVAILABLE, nigdy dorobione kryterium', () => {
    const multiverse = runTemporalMultiverse({ ...SPEC, preparedness: undefined });
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(next.status).toBe('NOT_AVAILABLE');
    expect(next.nextSpec).toBeNull();
    expect(next.sourceQuestionId).toBeNull();
  });

  it('nieistniejąca gałąź źródłowa jest NOT_AVAILABLE, nie zmyślonym pochodzeniem', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'Z-nie-istnieje');

    expect(next.status).toBe('NOT_AVAILABLE');
    expect(next.nextSpec).toBeNull();
  });
});

describe('11-12-13 — save/reload/replay następnego eksperymentu', () => {
  it('następny multiverse zapisuje się i odtwarza jako MATCH', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const nextMultiverse = runTemporalMultiverse(next.nextSpec!);
    const saved = buildSavedTemporalMultiverse(nextMultiverse);
    const replay = replaySavedTemporalMultiverse(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.multiverse!.spec.preparedness).toEqual(SPEC.preparedness);
  });

  it('odtworzony następny multiverse wciąż proponuje kolejny krok tą samą metodą (pętla się nie urywa po reload)', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const nextMultiverse = runTemporalMultiverse(next.nextSpec!);
    const replay = replaySavedTemporalMultiverse(buildSavedTemporalMultiverse(nextMultiverse));
    const nextNext = proposeNextMultiverseExperiment(replay.multiverse!, next.nextSpec!.branches[0]!.branchId);

    expect(nextNext.sourceQuestionId).toBe(QUESTION.questionId);
  });

  it('zmiana rządzonego wejścia po zapisie daje DRIFT przy odtworzeniu, nigdy ciche MATCH', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const next = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const nextMultiverse = runTemporalMultiverse(next.nextSpec!);
    const saved = buildSavedTemporalMultiverse(nextMultiverse);
    const tampered = { ...saved, branches: saved.branches.map((b) => ({ ...b, firstDivergentDayFromBaseline: (b.firstDivergentDayFromBaseline ?? 0) + 3 })) };

    expect(replaySavedTemporalMultiverse(tampered).status).toBe('DRIFT');
  });
});

describe('14-15 — determinizm i niemutowalność', () => {
  it('ten sam rodzic daje identyczny następny spec za każdym razem', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const first = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');
    const second = proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(second.nextSpec).toEqual(first.nextSpec);
  });

  it('budowanie propozycji nie mutuje rodzicielskiego multiverse', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const snapshot = JSON.parse(JSON.stringify(multiverse));
    proposeNextMultiverseExperiment(multiverse, 'B-opoznione');

    expect(JSON.parse(JSON.stringify(multiverse))).toEqual(snapshot);
  });
});

describe('INTEGRATION — pełna pętla: pytanie → hipoteza → wynik → falsyfikacja → następny eksperyment → replay', () => {
  it('QUESTION → PRE-REGISTER → RUN → RESULT → FALSIFICATION → PROPOSE NEXT → CONSTRUCT → PRE-REGISTER → RUN NEXT → EVIDENCE → SAVE → RELOAD → REPLAY → MATCH', () => {
    // QUESTION + PRE-REGISTER + RUN — eksperyment 1.
    const experimentA = runTemporalMultiverse(SPEC);
    const evidenceA = buildMultiverseBranchEvidencePack(experimentA, 'B-opoznione');
    expect(evidenceA.status).toBe('CREATED');
    expect(evidenceA.pack!.hypothesisAssessment.assessment).toMatch(/WITHIN_PROTOCOL|INCONCLUSIVE/);

    // PROPOSE NEXT + CONSTRUCT SPEC + PRE-REGISTER (skopiowane) — bez wykonania.
    const next = proposeNextMultiverseExperiment(experimentA, 'B-opoznione');
    expect(next.status).toBe('READY_TO_RUN');
    expect(next.nextSpec!.preparedness).toEqual(SPEC.preparedness);

    // RUN NEXT + RESULT.
    const experimentB = runTemporalMultiverse(next.nextSpec!);
    const branchB = next.nextSpec!.branches[0]!.branchId;

    // EVIDENCE dla eksperymentu 2, przez TEN SAM most co eksperyment 1.
    const evidenceB = buildMultiverseBranchEvidencePack(experimentB, branchB);
    expect(evidenceB.status).toBe('CREATED');
    expect(evidenceB.pack!.protocol.hypothesis.falsification).toEqual(evidenceA.pack!.protocol.hypothesis.falsification);

    // SAVE → RELOAD → REPLAY → MATCH.
    const saved = buildSavedTemporalMultiverse(experimentB);
    const replay = replaySavedTemporalMultiverse(saved);
    expect(replay.status).toBe('MATCH');

    // CHANGE INPUT → REPLAY → DRIFT.
    const tampered = { ...saved, branches: saved.branches.map((b) => ({ ...b, firstDivergentDayFromBaseline: (b.firstDivergentDayFromBaseline ?? 0) + 7 })) };
    expect(replaySavedTemporalMultiverse(tampered).status).toBe('DRIFT');
  });
});
