import { describe, expect, it } from 'vitest';
import { buildMultiverseBranchScientificLineage } from '../core/experimentFabric/multiverseEvidence';
import { explainScientificEvidence } from '../core/experimentFabric/whyNextExperiment';
import { GOVERNED_PREPAREDNESS_QUESTIONS } from '../core/simulation/preparednessQuestions';
import {
  buildSavedTemporalMultiverse,
  replaySavedTemporalMultiverse,
  runTemporalMultiverse,
  type TemporalMultiverseSpec,
} from '../core/simulation/temporalMultiverse';

/**
 * JEDNOLITY ŁAŃCUCH: PYTANIE → HIPOTEZA → EKSPERYMENT → WYNIK → FALSYFIKACJA
 * → DOWÓD → ODTWORZENIE → NASTĘPNY EKSPERYMENT, dla gałęzi multiverse.
 *
 * `buildMultiverseBranchScientificLineage` NICZEGO nie liczy drugi raz — te
 * testy pilnują, że jest wyłącznie odczytem nad trzema już istniejącymi,
 * osobno testowanymi mechanizmami (`temporalDecisionLineage`,
 * `buildMultiverseBranchEvidencePack`, `buildExperimentGraph`), poprawnie
 * skorelowanym po `branchId`, i że fałszywy MATCH nigdy nie przechodzi.
 */

const QUESTION = GOVERNED_PREPAREDNESS_QUESTIONS[0]!; // prep:isolation-timing — ISOLATION vs ISOLATION, dzień 0 vs 20
const PREPAREDNESS = { questionId: QUESTION.questionId, askedText: QUESTION.question, resolutionFingerprint: 'fp-lineage' };

const SPEC: TemporalMultiverseSpec = {
  baselineScenarioId: 'ISOLATION',
  days: 18,
  stepsPerDay: 2,
  baseParams: { nAgents: 120, initialInfected: 4, seed: 20260831 },
  branches: [{ branchId: 'B-opoznione', scenarioId: 'ISOLATION', interventionStartDay: 20 }],
  preparedness: PREPAREDNESS,
};

describe('Łańcuch od pytania do dowodu — happy path', () => {
  it('1-3: pytanie → hipoteza → eksperyment są połączone dependsOn w grafie', () => {
    const lineage = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione');
    const graph = lineage.graph!;
    const question = graph.nodes.find((n) => n.kind === 'QUESTION')!;
    const hypothesis = graph.nodes.find((n) => n.kind === 'HYPOTHESIS')!;
    const experiment = graph.nodes.find((n) => n.kind === 'EXPERIMENT')!;

    expect(hypothesis.dependsOn).toContain(question.nodeId);
    expect(experiment.dependsOn).toContain(hypothesis.nodeId);
    expect(hypothesis.label).toBe(QUESTION.question);
  });

  it('4-6: eksperyment → wynik → stan czasowy → gałąź → rozjazd są spójne', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const lineage = buildMultiverseBranchScientificLineage(multiverse, 'B-opoznione');
    const graph = lineage.graph!;
    const experiment = graph.nodes.find((n) => n.kind === 'EXPERIMENT')!;
    const result = graph.nodes.find((n) => n.kind === 'RESULT')!;

    expect(result.dependsOn).toContain(experiment.nodeId);
    expect(lineage.decision!.branchId).toBe('B-opoznione');
    expect(lineage.decision!.declaredInterventionStartDay).toBe(20);
    expect(lineage.decision!.firstDivergentDayFromBaseline).not.toBeNull();
    expect(lineage.decision!.branchState!.logicalDay).toBe(lineage.decision!.firstDivergentDayFromBaseline);
    expect(lineage.decision!.branchState!.branchRole).toBe('VARIANT');
  });

  it('7-8: gałąź → evidence → replay (MATCH)', () => {
    const lineage = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione');

    expect(lineage.evidence.status).toBe('CREATED');
    expect(lineage.evidence.pack).not.toBeNull();
    expect(lineage.evidence.replay!.status).toBe('MATCH');
    expect(lineage.evidence.pack!.protocol.hypothesis.falsification).toEqual(QUESTION.falsification);
  });

  it('9: cały multiverse odtwarza się jako MATCH niezależnie od lineage', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));
    expect(replaySavedTemporalMultiverse(saved).status).toBe('MATCH');
  });

  it('14: propozycja następnego eksperymentu (jeśli jest) sięga wstecz do tej samej hipotezy', () => {
    const lineage = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione');
    const graph = lineage.graph!;
    const next = graph.nodes.find((n) => n.kind === 'NEXT_EXPERIMENT');
    expect(next).toBeDefined();

    // Przejście wstecz po dependsOn od NEXT_EXPERIMENT musi dotrzeć do QUESTION.
    const byId = new Map(graph.nodes.map((n) => [n.nodeId, n]));
    const question = graph.nodes.find((n) => n.kind === 'QUESTION')!;
    let frontier = [next!.nodeId];
    const visited = new Set(frontier);
    let reachedQuestion = false;
    while (frontier.length > 0 && !reachedQuestion) {
      const nextFrontier: string[] = [];
      for (const id of frontier) {
        for (const dep of byId.get(id)?.dependsOn ?? []) {
          if (dep === question.nodeId) { reachedQuestion = true; break; }
          if (!visited.has(dep)) { visited.add(dep); nextFrontier.push(dep); }
        }
      }
      frontier = nextFrontier;
    }
    expect(reachedQuestion).toBe(true);
  });

  it('whyNextExperiment przyjmuje ten sam łańcuch dowodowy bez adaptacji', () => {
    const lineage = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione');
    const advice = explainScientificEvidence(lineage.evidence.chain!);

    expect(advice.nextExperiment.autoRun).toBe(false);
    expect(advice.evidenceBasis.join(' ')).toMatch(new RegExp(lineage.evidence.chain!.assessment.assessment));
  });
});

describe('Negatywne ścieżki — fail-closed', () => {
  it('11: nieistniejąca gałąź jest niekompletnym lineage — BLOCKED, nie zmyślony wynik', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const lineage = buildMultiverseBranchScientificLineage(multiverse, 'Z-nie-istnieje');

    expect(lineage.decision).toBeNull();
    expect(lineage.evidence.status).toBe('BLOCKED_NOT_COMPARABLE');
    expect(lineage.graph).toBeNull();
  });

  it('10: zmiana rządzonego wejścia po zapisie daje DRIFT przy odtworzeniu, nigdy ciche MATCH', () => {
    const saved = buildSavedTemporalMultiverse(runTemporalMultiverse(SPEC));
    const tampered = {
      ...saved,
      branches: saved.branches.map((b) => ({ ...b, firstDivergentDayFromBaseline: (b.firstDivergentDayFromBaseline ?? 0) + 1 })),
    };
    expect(replaySavedTemporalMultiverse(tampered).status).not.toBe('MATCH');
  });
});

describe('Trwałość: przeładowanie zachowuje lineage', () => {
  it('12-13: odtworzony multiverse daje to samo evidence i tę samą falsyfikację co oryginał', () => {
    const original = runTemporalMultiverse(SPEC);
    const originalLineage = buildMultiverseBranchScientificLineage(original, 'B-opoznione');

    const saved = buildSavedTemporalMultiverse(original);
    const replay = replaySavedTemporalMultiverse(saved);
    expect(replay.status).toBe('MATCH');
    const reloadedLineage = buildMultiverseBranchScientificLineage(replay.multiverse!, 'B-opoznione');

    expect(reloadedLineage.evidence.status).toBe(originalLineage.evidence.status);
    expect(reloadedLineage.evidence.pack!.protocol.hypothesis.falsification).toEqual(originalLineage.evidence.pack!.protocol.hypothesis.falsification);
    expect(reloadedLineage.decision!.declaredInterventionStartDay).toBe(originalLineage.decision!.declaredInterventionStartDay);
  });

  it('15: te same wejścia dają identyczny odcisk grafu', () => {
    const first = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione').graph!;
    const second = buildMultiverseBranchScientificLineage(runTemporalMultiverse(SPEC), 'B-opoznione').graph!;

    expect(second.graphFingerprint).toBe(first.graphFingerprint);
  });

  it('16: budowanie lineage nie mutuje przekazanego multiverse', () => {
    const multiverse = runTemporalMultiverse(SPEC);
    const snapshot = JSON.parse(JSON.stringify(multiverse));
    buildMultiverseBranchScientificLineage(multiverse, 'B-opoznione');

    expect(JSON.parse(JSON.stringify(multiverse))).toEqual(snapshot);
  });
});
