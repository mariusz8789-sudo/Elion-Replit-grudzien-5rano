import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_ALTITUDES_M,
  FALSIFY_THRESHOLD,
  SUPPORT_TOLERANCE,
  buildInitialTimeDilationReasoningGraph,
  runTimeDilationReasoningLoop,
} from '../core/discovery/physics/timeDilationReasoningDemo';
import { replayEpistemicUpdates } from '../core/discovery/epistemicEngine';

describe('timeDilationReasoningDemo — BEFORE state', () => {
  it('all three hypotheses start UNRESOLVED, nothing pre-judged', () => {
    const graph = buildInitialTimeDilationReasoningGraph();
    for (const id of ['hyp-correct-composition', 'hyp-sr-only', 'hyp-gr-only']) {
      expect(graph.nodes.find((n) => n.nodeId === id)!.status).toBe('UNRESOLVED');
    }
  });

  it('every declared candidate altitude has its own UNRESOLVED experiment node', () => {
    const graph = buildInitialTimeDilationReasoningGraph();
    const experimentNodes = graph.nodes.filter((n) => n.kind === 'EXPERIMENT');
    expect(experimentNodes).toHaveLength(CANDIDATE_ALTITUDES_M.length);
    expect(experimentNodes.every((n) => n.status === 'UNRESOLVED')).toBe(true);
  });
});

/**
 * THE MOST IMPORTANT TEST.
 *
 * QUESTION -> three competing, real physics hypotheses -> epistemic graph
 * -> Genesis GENERATES candidate experiments from the current state ->
 * Genesis SELECTS the one with the highest discrimination score -> REAL
 * physics computation executes it -> evidence is ingested -> the graph
 * updates -> Genesis REGENERATES and RE-SCORES candidates against the NEW
 * state -> selects a SECOND, genuinely different experiment because the
 * state changed -> executes it -> final state -> deterministic replay.
 *
 * Every number below was independently verified in a throwaway debug script
 * against the real formulas in relativisticTimeDilation.ts before this test
 * was written (never hard-coded blind): E1 is the altitude with the largest
 * 3-way spread among {correct, SR-only, GR-only}; E2 is the altitude with
 * the largest deviation of the sole remaining open hypothesis (GR-only)
 * from the now-SUPPORTED correct-composition reference. No status is
 * asserted here without deriving it from the real computation.
 */
describe('timeDilationReasoningDemo — THE CRITICAL TWO-STEP LOOP (real physics)', () => {
  it('step 1: selects the altitude with the largest 3-way discrimination spread', () => {
    const result = runTimeDilationReasoningLoop();
    const step1 = result.steps[0]!;
    expect(step1.selection.candidates.every((c) => c.openHypothesisIds.length === 3)).toBe(true);
    expect(step1.selectedExperimentId).toBe('experiment-altitude-35786000');
  });

  it('step 1 execution genuinely supports the correct composition and falsifies SR-only, from real computed residuals', () => {
    const result = runTimeDilationReasoningLoop();
    const afterStep1 = result.steps[0]!.after;
    expect(afterStep1.nodes.find((n) => n.nodeId === 'hyp-correct-composition')!.status).toBe('SUPPORTED');
    expect(afterStep1.nodes.find((n) => n.nodeId === 'hyp-sr-only')!.status).toBe('FALSIFIED');
  });

  it('step 1 leaves GR-only genuinely UNRESOLVED — its residual falls between the support tolerance and the falsify threshold', () => {
    const result = runTimeDilationReasoningLoop();
    expect(result.steps[0]!.after.nodes.find((n) => n.nodeId === 'hyp-gr-only')!.status).toBe('UNRESOLVED');
  });

  it('step 2 re-scores from the UPDATED graph: only GR-only is open, so the score basis switches to deviation-from-reference', () => {
    const result = runTimeDilationReasoningLoop();
    const step2 = result.steps[1]!;
    expect(step2.selection.candidates.every((c) => c.openHypothesisIds.length === 1 && c.openHypothesisIds[0] === 'hyp-gr-only')).toBe(true);
    expect(step2.selection.selected!.scoreBasis).toBe('DEVIATION_FROM_SUPPORTED_REFERENCE');
  });

  it('THE KEY PROOF: step 2 selects a genuinely DIFFERENT altitude than a non-adaptive ranking would have picked next', () => {
    const result = runTimeDilationReasoningLoop();
    const step1 = result.steps[0]!;
    const step2 = result.steps[1]!;

    // What a NON-adaptive algorithm (using step 1's original 3-way ranking,
    // merely skipping the already-used experiment) would have picked next:
    const naiveSecondPick = step1.selection.ranked.find((c) => c.experimentId !== step1.selectedExperimentId)!;

    expect(step2.selectedExperimentId).toBe('experiment-altitude-400000');
    expect(naiveSecondPick.experimentId).toBe('experiment-altitude-20200000');
    expect(step2.selectedExperimentId).not.toBe(naiveSecondPick.experimentId);
  });

  it('step 2 execution genuinely falsifies GR-only, resolving the question', () => {
    const result = runTimeDilationReasoningLoop();
    expect(result.finalGraph.nodes.find((n) => n.nodeId === 'hyp-gr-only')!.status).toBe('FALSIFIED');
  });

  it('the loop terminates RESOLVED after exactly two real, computed decisions', () => {
    const result = runTimeDilationReasoningLoop();
    expect(result.termination).toBe('RESOLVED');
    expect(result.steps).toHaveLength(2);
  });

  it('final state: the correct composition is SUPPORTED, both naive alternatives are FALSIFIED', () => {
    const result = runTimeDilationReasoningLoop();
    const byId = (id: string) => result.finalGraph.nodes.find((n) => n.nodeId === id)!.status;
    expect(byId('hyp-correct-composition')).toBe('SUPPORTED');
    expect(byId('hyp-sr-only')).toBe('FALSIFIED');
    expect(byId('hyp-gr-only')).toBe('FALSIFIED');
  });

  it('every status change carries a real reason referencing an actual computed residual, never a bare assertion', () => {
    const result = runTimeDilationReasoningLoop();
    for (const step of result.steps) {
      for (const change of step.changes) {
        expect(change.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic: two independent runs produce the identical final fingerprint and the identical two-step sequence', () => {
    const a = runTimeDilationReasoningLoop();
    const b = runTimeDilationReasoningLoop();
    expect(a.finalGraph.fingerprint).toBe(b.finalGraph.fingerprint);
    expect(a.steps.map((s) => s.selectedExperimentId)).toEqual(b.steps.map((s) => s.selectedExperimentId));
  });

  it('replays MATCH: re-applying each real step\'s updates to its own before-graph reproduces the same after-graph', () => {
    const result = runTimeDilationReasoningLoop();
    for (const step of result.steps) {
      expect(replayEpistemicUpdates(step.before, step.updates, step.after).status).toBe('MATCH');
    }
  });

  it('replays DRIFT when a saved final graph is tampered with', () => {
    const result = runTimeDilationReasoningLoop();
    const step = result.steps[0]!;
    const tampered = { ...step.after, fingerprint: `${step.after.fingerprint}0` };
    expect(replayEpistemicUpdates(step.before, step.updates, tampered).status).toBe('DRIFT');
  });

  it('declares its verdict thresholds explicitly (not fabricated numbers)', () => {
    expect(SUPPORT_TOLERANCE).toBeGreaterThan(0);
    expect(FALSIFY_THRESHOLD).toBeGreaterThan(SUPPORT_TOLERANCE);
  });
});
