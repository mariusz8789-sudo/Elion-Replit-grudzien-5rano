import { describe, expect, it } from 'vitest';
import { buildEpistemicGraph, buildEpistemicNode, type EpistemicGraph, type EpistemicNode, type StatusUpdate } from '../core/discovery/epistemicEngine';
import { runReasoningLoop, runReasoningStep, type ReasoningDomainAdapter, type ReasoningExecutionResult } from '../core/discovery/epistemicReasoningLoop';
import type { CandidateExperimentSpec } from '../core/discovery/experimentSelection';

function hyp(id: string, status: EpistemicNode['status'] = 'UNRESOLVED'): EpistemicNode {
  return buildEpistemicNode({ nodeId: id, kind: 'HYPOTHESIS', domainId: 'TEST', statement: `statement of ${id}`, status, statusReason: 'initial', provenance: [`declared:${id}`] });
}
function exp(id: string): EpistemicNode {
  return buildEpistemicNode({ nodeId: id, kind: 'EXPERIMENT', domainId: 'TEST', statement: `experiment ${id}`, status: 'UNRESOLVED', statusReason: 'not yet executed', provenance: [`declared:${id}`] });
}

/**
 * A tiny, entirely synthetic domain: two candidate experiments, e1 and e2.
 * e1 tests {a,b} with real predictions 0 vs 10 (spread 10, wins first).
 * e2 tests {b,c} with real predictions 0 vs 1 (spread 1).
 * Executing e1 truthfully falsifies 'a' (its "real" value is 10, matching
 * b's prediction) and supports 'b'. After that, only 'c' remains open and
 * only e2 still targets it, so e2 must be selected next — a genuine,
 * non-scripted two-step sequence over a fake but fully deterministic domain.
 */
function buildFakeAdapter(): ReasoningDomainAdapter {
  const REAL_VALUE = 10;
  function generateCandidates(graph: EpistemicGraph): readonly CandidateExperimentSpec[] {
    return graph.nodes
      .filter((n) => n.kind === 'EXPERIMENT' && n.status === 'UNRESOLVED')
      .map((n): CandidateExperimentSpec => {
        if (n.nodeId === 'e1') return { experimentId: 'e1', targetHypothesisIds: ['a', 'b'], predictions: { a: 0, b: 10 }, cost: 1, costReasoning: 'fake' };
        return { experimentId: 'e2', targetHypothesisIds: ['b', 'c'], predictions: { b: 10, c: 1 }, cost: 1, costReasoning: 'fake' };
      });
  }
  function execute(experimentId: string, graph: EpistemicGraph): ReasoningExecutionResult {
    const predictions: Record<string, Record<string, number>> = { e1: { a: 0, b: 10 }, e2: { b: 10, c: 1 } };
    const preds = predictions[experimentId]!;
    const updates: StatusUpdate[] = [{ nodeId: experimentId, newStatus: 'ESTABLISHED', reason: 'executed', provenance: [`real:${REAL_VALUE}`] }];
    for (const [id, predicted] of Object.entries(preds)) {
      const node = graph.nodes.find((n) => n.nodeId === id)!;
      if (node.status !== 'UNRESOLVED') continue;
      const verdict = Math.abs(predicted - REAL_VALUE) < 1 ? 'SUPPORTED' : 'FALSIFIED';
      updates.push({ nodeId: id, newStatus: verdict, reason: `predicted ${predicted} vs real ${REAL_VALUE}` });
    }
    return { updates, provenance: [`experiment:${experimentId}`], narrative: `executed ${experimentId}` };
  }
  return { generateCandidates, execute };
}

describe('epistemicReasoningLoop — single step', () => {
  it('9. selects and executes the highest-value candidate', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const step = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(step.selectedExperimentId).toBe('e1');
    expect(step.executed).toBe(true);
  });

  it('10. evidence is genuinely ingested: the experiment node becomes ESTABLISHED', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const step = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(step.after.nodes.find((n) => n.nodeId === 'e1')!.status).toBe('ESTABLISHED');
  });

  it('11. hypothesis status updates from real ingested evidence', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const step = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(step.after.nodes.find((n) => n.nodeId === 'a')!.status).toBe('FALSIFIED');
    expect(step.after.nodes.find((n) => n.nodeId === 'b')!.status).toBe('SUPPORTED');
  });

  it('16. provenance is retained on every changed node', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const step = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(step.after.nodes.find((n) => n.nodeId === 'e1')!.provenance).toContain('real:10');
  });

  it('17. the resulting graph carries a deterministic fingerprint', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const stepA = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    const stepB = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(stepA.after.fingerprint).toBe(stepB.after.fingerprint);
  });

  it('Phase H: the structured explanation names the question, competing hypotheses, and why this experiment', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const step = runReasoningStep(0, 'test question', graph, buildFakeAdapter());
    expect(step.explanation.currentQuestion).toBe('test question');
    expect(step.explanation.competingHypotheses.map((h) => h.hypothesisId).sort()).toEqual(['a', 'b', 'c']);
    expect(step.explanation.selectedExperiment).toBe('e1');
    expect(step.explanation.whyThisExperiment).toContain('e1');
    expect(step.explanation.whatChanged.length).toBeGreaterThan(0);
  });

  it('19. no candidates -> unexecuted step with a null selection', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED')], []);
    const adapter: ReasoningDomainAdapter = { generateCandidates: () => [], execute: () => { throw new Error('should not be called'); } };
    const step = runReasoningStep(0, 'q', graph, adapter);
    expect(step.executed).toBe(false);
    expect(step.selectedExperimentId).toBeNull();
  });
});

describe('epistemicReasoningLoop — the critical two-step loop', () => {
  it('12. the second step regenerates candidates from the UPDATED graph, 13. correctly identifying the one remaining open hypothesis', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const adapter = buildFakeAdapter();
    const step1 = runReasoningStep(0, 'q', graph, adapter);
    const step2 = runReasoningStep(1, 'q', step1.after, adapter);
    expect(step2.selection.candidates[0]!.openHypothesisIds).toEqual(['c']);
  });

  it('14. step 2 selects a DIFFERENT experiment (e2) because the epistemic state changed, not a scripted sequence', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const adapter = buildFakeAdapter();
    const step1 = runReasoningStep(0, 'q', graph, adapter);
    const step2 = runReasoningStep(1, 'q', step1.after, adapter);
    expect(step1.selectedExperimentId).toBe('e1');
    expect(step2.selectedExperimentId).toBe('e2');
  });

  it('runs the full loop end to end and terminates RESOLVED once no hypothesis remains open', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1'), exp('e2')], []);
    const result = runReasoningLoop('q', graph, buildFakeAdapter(), 10);
    expect(result.termination).toBe('RESOLVED');
    expect(result.steps.map((s) => s.selectedExperimentId)).toEqual(['e1', 'e2']);
    expect(result.finalGraph.nodes.find((n) => n.nodeId === 'c')!.status).toBe('FALSIFIED');
  });

  it('15. terminates NO_USEFUL_EXPERIMENT when candidates run out before all hypotheses resolve', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), hyp('c'), exp('e1')], []);
    const adapter: ReasoningDomainAdapter = {
      generateCandidates: (g) => g.nodes.filter((n) => n.kind === 'EXPERIMENT' && n.status === 'UNRESOLVED').map((n) => ({ experimentId: n.nodeId, targetHypothesisIds: ['a', 'b'], predictions: { a: 0, b: 10 }, cost: 1, costReasoning: 'fake' })),
      execute: (id) => ({ updates: [{ nodeId: id, newStatus: 'ESTABLISHED', reason: 'executed' }, { nodeId: 'a', newStatus: 'FALSIFIED', reason: 'far from real' }, { nodeId: 'b', newStatus: 'SUPPORTED', reason: 'close to real' }], provenance: [], narrative: '' }),
    };
    const result = runReasoningLoop('q', graph, adapter, 10);
    expect(result.termination).toBe('NO_USEFUL_EXPERIMENT');
    expect(result.finalGraph.nodes.find((n) => n.nodeId === 'c')!.status).toBe('UNRESOLVED');
  });

  it('18. terminates MAX_ITERATIONS_REACHED as a safety bound, never spinning forever', () => {
    const graph = buildEpistemicGraph('g', [hyp('a'), hyp('b'), exp('e1')], []);
    let counter = 0;
    const adapter: ReasoningDomainAdapter = {
      generateCandidates: () => [{ experimentId: `e${counter}`, targetHypothesisIds: ['a', 'b'], predictions: { a: 0, b: 10 }, cost: 1, costReasoning: 'fake' }],
      execute: () => {
        counter += 1;
        // Never actually resolves 'a' or 'b' — the loop must not spin forever.
        return { updates: [], provenance: [], narrative: '' };
      },
    };
    const result = runReasoningLoop('q', graph, adapter, 5);
    expect(result.termination).toBe('MAX_ITERATIONS_REACHED');
    expect(result.steps.length).toBe(5);
  });

  it('terminates BLOCKED when every hypothesis ends up BLOCKED rather than resolved', () => {
    const a = hyp('a');
    const b = buildEpistemicNode({ nodeId: 'b', kind: 'HYPOTHESIS', domainId: 'TEST', statement: 'b', status: 'UNRESOLVED', statusReason: 'initial', provenance: ['declared:b'] });
    const graph = buildEpistemicGraph('g', [a, b, exp('e1')], [{ edgeId: 'edge1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b depends on a' }]);
    const adapter: ReasoningDomainAdapter = {
      generateCandidates: (g) => g.nodes.filter((n) => n.kind === 'EXPERIMENT' && n.status === 'UNRESOLVED').map((n) => ({ experimentId: n.nodeId, targetHypothesisIds: ['a', 'b'], predictions: { a: 0, b: 10 }, cost: 1, costReasoning: 'fake' })),
      execute: (id) => ({ updates: [{ nodeId: id, newStatus: 'ESTABLISHED', reason: 'executed' }, { nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }], provenance: [], narrative: '' }),
    };
    const result = runReasoningLoop('q', graph, adapter, 10);
    expect(result.termination).toBe('BLOCKED');
    expect(result.finalGraph.nodes.find((n) => n.nodeId === 'b')!.status).toBe('BLOCKED');
  });
});
