import { describe, expect, it } from 'vitest';
import {
  buildExperimentGraph,
  executeNextExperiment,
  EXPERIMENT_GRAPH_CONTRACT_VERSION,
  NEXT_EXPERIMENT_RULES,
  UNCERTAINTY_PRIORITY,
} from '../core/experimentFabric/experimentGraph';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildStructuredRequestFromModel } from '../core/experimentFabric/structuredRequestBuilder';
import { getRouterModel } from '../core/experimentFabric/router';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import type { ExperimentRun, ExperimentValue } from '../core/experimentFabric/types';

/**
 * SCIENTIFIC EXPERIMENT GRAPH + AUTONOMICZNY NASTĘPNY EKSPERYMENT.
 *
 * Graf jest odczytem stanu, nie ilustracją. Testy pilnują trzech rzeczy, na
 * których łatwo byłoby oszukać: że hipoteza nie jest dorabiana do gotowego
 * wyniku, że niepewności są wyliczone z realnych pól przebiegów, i że
 * „następny eksperyment" to wykonywalne żądanie, a nie zdanie po polsku.
 */

function scenarioRun(values: Record<string, ExperimentValue> = {}): ExperimentRun {
  return runExperiment(buildStructuredRequestFromModel(getRouterModel('scenario-timeline')!, {
    scenarioId: 'BASELINE', days: 18, stepsPerDay: 2, nAgents: 120, initialInfected: 4, seed: 777, interventionStartDay: 0, ...values,
  }, { sourceText: 'Zasymuluj scenariusz bazowy.' }));
}

const QUESTION = 'Czy wcześniejsza izolacja zmienia obciążenie szpitala?';

describe('Struktura grafu', () => {
  it('wiąże pytanie → eksperyment → wynik realnymi krawędziami', () => {
    const run = scenarioRun();
    const graph = buildExperimentGraph({ question: QUESTION, runs: [run] });

    expect(graph.contractVersion).toBe(EXPERIMENT_GRAPH_CONTRACT_VERSION);
    const question = graph.nodes.find((node) => node.kind === 'QUESTION')!;
    const experiment = graph.nodes.find((node) => node.kind === 'EXPERIMENT')!;
    const result = graph.nodes.find((node) => node.kind === 'RESULT')!;

    expect(experiment.dependsOn).toEqual([question.nodeId]);
    expect(result.dependsOn).toEqual([experiment.nodeId]);
    expect(graph.edges).toContainEqual({ from: question.nodeId, to: experiment.nodeId });
    expect(graph.edges).toContainEqual({ from: experiment.nodeId, to: result.nodeId });
  });

  it('węzeł wyniku niesie realną prowieniencję, a nie samą etykietę', () => {
    const run = scenarioRun();
    const result = buildExperimentGraph({ question: QUESTION, runs: [run] }).nodes.find((node) => node.kind === 'RESULT')!;

    expect(result.runId).toBe(run.runId);
    expect(result.runFingerprint).toBe(run.provenance.runFingerprint);
    expect(result.resultOrigin).toBe('real-engine');
    expect(result.engine).toBe('genesis-scenario-engine@1.0.0');
  });

  it('NIE dorabia hipotezy do gotowego wyniku', () => {
    // Bez prerejestrowanego łańcucha dowodowego graf nie ma prawa twierdzić,
    // że przebieg testował jakąkolwiek tezę. To jest granica między
    // eksperymentem a HARK-owaniem z ładnym diagramem.
    const graph = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });

    expect(graph.nodes.filter((node) => node.kind === 'HYPOTHESIS')).toHaveLength(0);
    expect(graph.nodes.find((node) => node.kind === 'EXPERIMENT')!.dependsOn).toEqual([graph.questionId]);
  });

  it('wynik nieskalibrowanego modelu nigdy nie dostaje statusu OBSERVED', () => {
    const graph = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    for (const node of graph.nodes.filter((entry) => entry.kind === 'RESULT')) {
      expect(node.epistemicStatus).not.toBe('OBSERVED');
      expect(['SIMULATION', 'MODEL_ESTIMATE', 'UNKNOWN', 'BLOCKED']).toContain(node.epistemicStatus);
    }
  });

  it('ten sam stan daje ten sam odcisk grafu, inny stan inny', () => {
    const a = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    const b = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    const c = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun(), scenarioRun({ seed: 778 })] });

    expect(b.graphFingerprint).toBe(a.graphFingerprint);
    expect(c.graphFingerprint).not.toBe(a.graphFingerprint);
  });
});

describe('Niepewności wyliczone ze stanu', () => {
  it('pojedyncze ziarno jest zgłoszone jako niepewność z jawnym zakazem wniosku', () => {
    const graph = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    const singleSeed = graph.uncertainties.find((entry) => entry.kind === 'SINGLE_SEED');

    expect(singleSeed).toBeDefined();
    expect(singleSeed!.statement).toContain('777');
    expect(singleSeed!.blocksClaim).toMatch(/nie wolno/i);
  });

  it('drugie ziarno usuwa tę niepewność — stan, nie deklaracja', () => {
    const graph = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun(), scenarioRun({ seed: 778 })] });

    expect(graph.uncertainties.find((entry) => entry.kind === 'SINGLE_SEED')).toBeUndefined();
  });

  it('niewykonane żądanie jest niepewnością typu brak danych, nie słabym wynikiem', () => {
    const request = parseScienceChatMessage('Zaprojektuj lek na chorobę Alzheimera i podaj skuteczność kliniczną');
    const graph = buildExperimentGraph({ question: QUESTION, runs: [runExperiment(request)] });
    const notExecuted = graph.uncertainties.find((entry) => entry.kind === 'ENGINE_NOT_EXECUTED');

    expect(notExecuted).toBeDefined();
    expect(notExecuted!.blocksClaim).toMatch(/nie ma danych/i);
    expect(graph.nodes.find((node) => node.kind === 'RESULT')!.epistemicStatus).toMatch(/BLOCKED|UNKNOWN/);
  });

  it('kolejność niepewności jest zadeklarowana wprost, nie zważona ukrytą liczbą', () => {
    expect(UNCERTAINTY_PRIORITY[0]).toBe('REPRODUCIBILITY_DRIFT');
    expect(UNCERTAINTY_PRIORITY).toContain('SINGLE_SEED');
    const graph = buildExperimentGraph({
      question: QUESTION,
      runs: [scenarioRun(), runExperiment(parseScienceChatMessage('Zaprojektuj lek na chorobę Alzheimera'))],
    });
    // Brak wykonania bije pojedyncze ziarno: to brak danych, nie ograniczony wynik.
    expect(graph.uncertainties[0]!.kind).toBe('ENGINE_NOT_EXECUTED');
  });
});

describe('Autonomiczny następny eksperyment', () => {
  it('proponuje WYKONYWALNE żądanie, nie zdanie po polsku', () => {
    const graph = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    const proposal = graph.nextExperiment!;

    expect(proposal.status).toBe('READY_TO_RUN');
    expect(proposal.request).not.toBeNull();
    expect(proposal.request!.modelId).toBe('scenario-timeline');
    expect(proposal.rule).toBe(NEXT_EXPERIMENT_RULES.seed);
    expect(proposal.resolves).toMatch(/rozstrzygnie/i);
  });

  it('zmienia DOKŁADNIE jedną rzecz względem przebiegu, który wywołał niepewność', () => {
    const run = scenarioRun();
    const proposal = buildExperimentGraph({ question: QUESTION, runs: [run] }).nextExperiment!;
    const before = run.provenance.parameterSnapshot;
    const after = proposal.request!.parameters;
    const changed = Object.keys({ ...before, ...after }).filter((key) => before[key] !== after[key]);

    expect(changed).toEqual(['seed']);
    expect(after.seed).toBe((before.seed as number) + 1);
  });

  it('wykonuje krok przez ten sam kontrakt i zamyka pętlę niepewności', () => {
    const first = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun()] });
    const execution = executeNextExperiment(first, runExperiment);

    expect(execution.executed).toBe(true);
    expect(execution.run!.result.status).toBe('completed');
    expect(execution.run!.provenance.resultOrigin).toBe('real-engine');

    // Pętla: nowy przebieg wraca do grafu i USUWA niepewność, która go zamówiła.
    const second = buildExperimentGraph({ question: QUESTION, runs: [scenarioRun(), execution.run!] });
    expect(second.uncertainties.find((entry) => entry.kind === 'SINGLE_SEED')).toBeUndefined();
    expect(second.graphFingerprint).not.toBe(first.graphFingerprint);
  });

  it('niewykonywalny krok zostaje VALIDATION_REQUIRED i niczego nie uruchamia', () => {
    const graph = buildExperimentGraph({
      question: QUESTION,
      runs: [runExperiment(parseScienceChatMessage('Zaprojektuj lek na chorobę Alzheimera'))],
    });
    const execution = executeNextExperiment(graph, () => { throw new Error('nie wolno wykonać niewykonywalnego kroku'); });

    expect(graph.nextExperiment!.status).toBe('VALIDATION_REQUIRED');
    expect(graph.nextExperiment!.request).toBeNull();
    expect(execution.executed).toBe(false);
    expect(execution.run).toBeNull();
  });

  it('graf bez otwartej niepewności nie zmyśla następnego kroku', () => {
    const graph = buildExperimentGraph({ question: QUESTION, runs: [] });

    expect(graph.uncertainties).toEqual([]);
    expect(graph.nextExperiment).toBeNull();
    expect(executeNextExperiment(graph, runExperiment).executed).toBe(false);
  });
});
