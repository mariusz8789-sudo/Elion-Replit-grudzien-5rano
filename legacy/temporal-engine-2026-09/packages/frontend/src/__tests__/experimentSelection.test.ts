import { describe, expect, it } from 'vitest';
import { buildEpistemicGraph, buildEpistemicNode, type EpistemicNode } from '../core/discovery/epistemicEngine';
import { selectNextExperiment, type CandidateExperimentSpec } from '../core/discovery/experimentSelection';

function hyp(id: string, status: EpistemicNode['status'] = 'UNRESOLVED'): EpistemicNode {
  return buildEpistemicNode({ nodeId: id, kind: 'HYPOTHESIS', domainId: 'TEST', statement: `statement of ${id}`, status, statusReason: 'initial', provenance: [`declared:${id}`] });
}

function candidate(id: string, targetHypothesisIds: readonly string[], predictions: Readonly<Record<string, number | null>>, cost = 1): CandidateExperimentSpec {
  return { experimentId: id, targetHypothesisIds, predictions, cost, costReasoning: 'test' };
}

describe('experimentSelection — candidate generation and discrimination scoring', () => {
  it('5. generates candidates depending on the current graph (open hypotheses only counted as open)', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b', 'SUPPORTED')], []);
    const c = candidate('e1', ['a', 'b'], { a: 1, b: 2 });
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.openHypothesisIds).toEqual(['a']);
  });

  it('6. discrimination score is the spread among open hypotheses\' predictions when >= 2 are open', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c = candidate('e1', ['a', 'b'], { a: 10, b: 3 });
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.discriminationScore).toBe(7);
    expect(result.candidates[0]!.scoreBasis).toBe('SPREAD_AMONG_OPEN');
  });

  it('scores by deviation from the nearest SUPPORTED reference when exactly one hypothesis is open', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED'), hyp('b')], []);
    const c = candidate('e1', ['a', 'b'], { a: 5, b: 9 });
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.discriminationScore).toBe(4);
    expect(result.candidates[0]!.scoreBasis).toBe('DEVIATION_FROM_SUPPORTED_REFERENCE');
  });

  it('scores 0 and excludes a candidate whose every target is already resolved', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED'), hyp('b', 'FALSIFIED')], []);
    const c = candidate('e1', ['a', 'b'], { a: 5, b: 9 });
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.discriminationScore).toBe(0);
    expect(result.candidates[0]!.scoreBasis).toBe('NO_OPEN_TARGETS');
    expect(result.termination).toBe('NO_OPEN_HYPOTHESES');
  });

  it('7. deterministic selection: the highest-value candidate wins, ties broken by experimentId', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c1 = candidate('e1', ['a', 'b'], { a: 0, b: 5 });
    const c2 = candidate('e2', ['a', 'b'], { a: 0, b: 9 });
    const result = selectNextExperiment(graph, [c1, c2]);
    expect(result.selected!.experimentId).toBe('e2');
    expect(result.runnerUp!.experimentId).toBe('e1');
  });

  it('produces a human-readable "A selected over B because..." explanation', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c1 = candidate('e1', ['a', 'b'], { a: 0, b: 5 });
    const c2 = candidate('e2', ['a', 'b'], { a: 0, b: 9 });
    const result = selectNextExperiment(graph, [c1, c2]);
    expect(result.selectionExplanation).toContain('e2');
    expect(result.selectionExplanation).toContain('e1');
    expect(result.selectionExplanation).toContain('selected over');
  });

  it('8. selection changes when the epistemic state changes (same candidates, different open hypotheses)', () => {
    const openGraph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c')], []);
    const resolvedGraph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED'), hyp('b'), hyp('c')], []);
    const c1 = candidate('e1', ['a', 'b'], { a: 10, b: 0 });
    const c2 = candidate('e2', ['b', 'c'], { b: 0, c: 1 });
    const before = selectNextExperiment(openGraph, [c1, c2]);
    const after = selectNextExperiment(resolvedGraph, [c1, c2]);
    expect(before.selected!.experimentId).toBe('e1');
    // once 'a' resolves, e1 falls back to DEVIATION_FROM_SUPPORTED_REFERENCE (|0-10|=10) and still wins,
    // but via a genuinely different scoring basis than before — proving re-scoring is state-driven.
    expect(before.selected!.scoreBasis).toBe('SPREAD_AMONG_OPEN');
    expect(after.selected!.scoreBasis).toBe('DEVIATION_FROM_SUPPORTED_REFERENCE');
  });

  it('20. NO_CANDIDATES when no candidate experiments are supplied', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const result = selectNextExperiment(graph, []);
    expect(result.termination).toBe('NO_CANDIDATES');
    expect(result.selected).toBeNull();
  });

  it('20. NO_DISCRIMINATING_CANDIDATE when open hypotheses exist but no candidate can discriminate them', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c = candidate('e1', ['a', 'b'], { a: null, b: null });
    const result = selectNextExperiment(graph, [c]);
    expect(result.termination).toBe('NO_DISCRIMINATING_CANDIDATE');
    expect(result.selected).toBeNull();
  });

  it('refuses a candidate targeting an unknown node id', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const c = candidate('e1', ['ghost'], { ghost: 1 });
    expect(() => selectNextExperiment(graph, [c])).toThrow(/unknown node "ghost"/);
  });

  it('refuses a non-positive declared cost', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c = candidate('e1', ['a', 'b'], { a: 1, b: 2 }, 0);
    expect(() => selectNextExperiment(graph, [c])).toThrow(/non-positive cost/);
  });

  it('falls back to a declared PRIORITY_SCORE when exactly one hypothesis is open and no reference exists', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const c = candidate('e1', ['a'], { a: 7 });
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.scoreBasis).toBe('PRIORITY_SCORE');
    expect(result.candidates[0]!.discriminationScore).toBe(7);
  });

  it('COVERAGE mode scores by how many targets are still open, not by their disagreement', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b', 'SUPPORTED'), hyp('c')], []);
    const c: CandidateExperimentSpec = { experimentId: 'batch', targetHypothesisIds: ['a', 'b', 'c'], predictions: {}, cost: 2, costReasoning: 'test', scoringMode: 'COVERAGE' };
    const result = selectNextExperiment(graph, [c]);
    expect(result.candidates[0]!.scoreBasis).toBe('COVERAGE_COUNT');
    expect([...result.candidates[0]!.openHypothesisIds].sort()).toEqual(['a', 'c']);
    expect(result.candidates[0]!.discriminationScore).toBe(2);
    expect(result.candidates[0]!.value).toBe(1);
  });

  it('is deterministic across repeated calls on the same graph and candidates', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b')], []);
    const c1 = candidate('e1', ['a', 'b'], { a: 0, b: 5 });
    const c2 = candidate('e2', ['a', 'b'], { a: 0, b: 9 });
    const r1 = selectNextExperiment(graph, [c1, c2]);
    const r2 = selectNextExperiment(graph, [c1, c2]);
    expect(r1.selected!.experimentId).toBe(r2.selected!.experimentId);
    expect(r1.selected!.discriminationScore).toBe(r2.selected!.discriminationScore);
  });
});
