import { describe, expect, it } from 'vitest';
import {
  buildInitialTimeDilationEpistemicGraph,
  replayTimeDilationEpistemicDemo,
  runTimeDilationEpistemicDemo,
  saveTimeDilationEpistemicDemoToMemory,
} from '../core/discovery/physics/epistemicTimeDilationDemo';

/**
 * THE MOST IMPORTANT TEST: a real end-to-end epistemic run.
 *
 * QUESTION -> competing hypotheses -> epistemic graph -> real Genesis
 * computation -> evidence -> graph update -> one hypothesis supported,
 * another falsified -> dependency propagation -> updated UNKNOWN/
 * UNRESOLVED state -> deterministic replay.
 *
 * The verdicts below are never hard-coded as an expectation typed in
 * without basis — they are exactly what generatePhysicsModelCandidates()
 * and runRelativisticTimeDilationCase() (both unchanged, both proven real
 * elsewhere in this codebase) actually compute.
 */
describe('epistemic time dilation demo — BEFORE state', () => {
  it('every hypothesis starts UNRESOLVED, nothing pre-judged', () => {
    const graph = buildInitialTimeDilationEpistemicGraph();
    for (const id of ['hyp-einstein-combined', 'hyp-alternative-quadrature', 'hyp-newtonian']) {
      expect(graph.nodes.find((n) => n.nodeId === id)!.status).toBe('UNRESOLVED');
    }
  });

  it('the dependent claim starts UNRESOLVED (it depends on an UNRESOLVED hypothesis)', () => {
    const graph = buildInitialTimeDilationEpistemicGraph();
    expect(graph.nodes.find((n) => n.nodeId === 'claim-gps-no-relativistic-correction-needed')!.status).toBe('UNRESOLVED');
  });

  it('the UNKNOWN node is honestly represented, not silently resolved', () => {
    const graph = buildInitialTimeDilationEpistemicGraph();
    const unknown = graph.nodes.find((n) => n.nodeId === 'unknown-independent-gps-measurement')!;
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.unknownDetail).not.toBeNull();
    expect(unknown.unknownDetail!.potentialResolution.length).toBeGreaterThan(0);
  });

  it('two established facts anchor the graph', () => {
    const graph = buildInitialTimeDilationEpistemicGraph();
    expect(graph.nodes.filter((n) => n.status === 'ESTABLISHED')).toHaveLength(2);
  });
});

describe('epistemic time dilation demo — E2E: real computation updates the graph', () => {
  it('running the demo produces one SUPPORTED and (at least) one FALSIFIED hypothesis, from real computation', () => {
    const run = runTimeDilationEpistemicDemo();
    const einstein = run.after.nodes.find((n) => n.nodeId === 'hyp-einstein-combined')!;
    const alternative = run.after.nodes.find((n) => n.nodeId === 'hyp-alternative-quadrature')!;
    const newtonian = run.after.nodes.find((n) => n.nodeId === 'hyp-newtonian')!;

    expect(einstein.status).toBe('SUPPORTED');
    expect(alternative.status).toBe('FALSIFIED');
    expect(newtonian.status).toBe('FALSIFIED');
  });

  it('DEPENDENCY PROPAGATION: the claim depending on the falsified Newtonian hypothesis becomes BLOCKED automatically', () => {
    const run = runTimeDilationEpistemicDemo();
    const claim = run.after.nodes.find((n) => n.nodeId === 'claim-gps-no-relativistic-correction-needed')!;
    expect(claim.status).toBe('BLOCKED');
    const claimChange = run.changes.find((c) => c.nodeId === 'claim-gps-no-relativistic-correction-needed')!;
    expect(claimChange.triggeredBy).toBe('hyp-newtonian');
  });

  it('the experiment node moves from UNRESOLVED to ESTABLISHED once executed', () => {
    const run = runTimeDilationEpistemicDemo();
    expect(run.before.nodes.find((n) => n.nodeId === 'experiment-gps-composition-test')!.status).toBe('UNRESOLVED');
    expect(run.after.nodes.find((n) => n.nodeId === 'experiment-gps-composition-test')!.status).toBe('ESTABLISHED');
  });

  it('the UNKNOWN node remains UNKNOWN — real computation on derived data never resolves an independent-measurement gap', () => {
    const run = runTimeDilationEpistemicDemo();
    const unknown = run.after.nodes.find((n) => n.nodeId === 'unknown-independent-gps-measurement')!;
    expect(unknown.status).toBe('UNKNOWN');
  });

  it('established facts are untouched by the run', () => {
    const run = runTimeDilationEpistemicDemo();
    expect(run.after.nodes.find((n) => n.nodeId === 'fact-sr')!.status).toBe('ESTABLISHED');
    expect(run.after.nodes.find((n) => n.nodeId === 'fact-gr')!.status).toBe('ESTABLISHED');
  });

  it('every status change carries real provenance and reasoning, never a bare assertion', () => {
    const run = runTimeDilationEpistemicDemo();
    for (const change of run.changes) {
      expect(change.reason.length).toBeGreaterThan(0);
    }
    const einstein = run.after.nodes.find((n) => n.nodeId === 'hyp-einstein-combined')!;
    expect(einstein.provenance.some((p) => p.startsWith('candidate:'))).toBe(true);
  });

  it('is deterministic: two independent runs produce the identical final fingerprint', () => {
    const a = runTimeDilationEpistemicDemo();
    const b = runTimeDilationEpistemicDemo();
    expect(a.after.fingerprint).toBe(b.after.fingerprint);
  });
});

describe('epistemic time dilation demo — replay', () => {
  it('replays MATCH against its own freshly recomputed run', () => {
    const run = runTimeDilationEpistemicDemo();
    expect(replayTimeDilationEpistemicDemo(run).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved final graph is tampered with', () => {
    const run = runTimeDilationEpistemicDemo();
    const tampered = { ...run, after: { ...run.after, fingerprint: `${run.after.fingerprint}0` } };
    expect(replayTimeDilationEpistemicDemo(tampered).status).toBe('DRIFT');
  });

  it('saves the final state to Scientific Memory with an honest per-status breakdown', () => {
    const run = runTimeDilationEpistemicDemo();
    const saved = saveTimeDilationEpistemicDemoToMemory(run);
    expect(saved.epistemicStatus).toContain('SUPPORTED=1');
    expect(saved.epistemicStatus).toContain('FALSIFIED=2');
    expect(saved.epistemicStatus).toContain('BLOCKED=1');
    expect(saved.epistemicStatus).toContain('UNKNOWN=1');
  });
});
