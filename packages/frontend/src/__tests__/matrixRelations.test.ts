import { describe, expect, it } from 'vitest';
import { buildMatrixRelationGraph, edgesFor } from '../core/agent/matrixRelations';
import type { SavedExperiment } from '../core/scienceMemory';

/**
 * The whole value of this module is what it REFUSES to draw. A graph that
 * invents a plausible edge makes the Matrix look like a knowledge system it
 * is not, so most of these tests pin the absence of edges rather than their
 * presence.
 */

const rec = (id: string, over: Partial<SavedExperiment> = {}): SavedExperiment => ({
  id, createdAt: new Date().toISOString(), labId: 'lab-a', experimentId: `e-${id}`,
  experimentName: `Run ${id}`, params: {}, stats: {}, honesty: 'simplified',
  honestyNote: 'test fixture', equations: [], assumptions: [], epistemicStatus: 'PREDICTION',
  contentHash: `hash-${id}`, ...over,
});

const verification = (sourceId: string) =>
  ({ predictionSourceExperimentId: sourceId } as SavedExperiment['realExperimentVerification']);

describe('edges are drawn only when a field proves them', () => {
  it('two unrelated records produce no edges at all', () => {
    const graph = buildMatrixRelationGraph([rec('a'), rec('b', { experimentId: 'e-b', labId: 'lab-b' })]);
    expect(graph.edges).toEqual([]);
  });

  it('records that merely share a kind are NOT linked', () => {
    // Both are hypotheses. A similarity-based graph would connect them; this one must not.
    const graph = buildMatrixRelationGraph([
      rec('a', { labId: 'lab-a', discoveryLoop: {} as SavedExperiment['discoveryLoop'] }),
      rec('b', { labId: 'lab-b', discoveryLoop: {} as SavedExperiment['discoveryLoop'] }),
    ]);
    expect(graph.edges.filter((e) => e.kind !== 'SAME_EXPERIMENT_RERUN')).toEqual([]);
  });

  it('a real measurement links to the exact prediction run it judged, and names the field', () => {
    const graph = buildMatrixRelationGraph([
      rec('pred', { worldDiscovery: {} as SavedExperiment['worldDiscovery'] }),
      rec('meas', { labId: 'lab-b', realExperimentVerification: verification('pred') }),
    ]);
    const edge = graph.edges.find((e) => e.kind === 'VERIFIES_PREDICTION');
    expect(edge).toBeDefined();
    expect(edge!.fromId).toBe('meas');
    expect(edge!.toId).toBe('pred');
    expect(edge!.directed).toBe(true);
    expect(edge!.basis).toBe('realExperimentVerification.predictionSourceExperimentId');
  });

  it('a verification pointing at a record that is gone becomes a reported gap, not an edge', () => {
    const graph = buildMatrixRelationGraph([
      rec('meas', { realExperimentVerification: verification('deleted-run') }),
    ]);
    expect(graph.edges.filter((e) => e.kind === 'VERIFIES_PREDICTION')).toEqual([]);
    const gap = graph.missing.find((m) => m.reason === 'ENDPOINT_MISSING');
    expect(gap).toBeDefined();
    expect(gap!.to).toBe('deleted-run');
  });

  it('shared evidence pack / chain / replay capsule each produce one undirected pair', () => {
    const graph = buildMatrixRelationGraph([
      rec('a', { labId: 'l1', evidencePackId: 'pack-1', evidenceChainId: 'chain-1' }),
      rec('b', { labId: 'l2', evidencePackId: 'pack-1', evidenceChainId: 'chain-1' }),
    ]);
    const packs = graph.edges.filter((e) => e.kind === 'SHARED_EVIDENCE_PACK');
    const chains = graph.edges.filter((e) => e.kind === 'SHARED_EVIDENCE_CHAIN');
    expect(packs).toHaveLength(1);
    expect(chains).toHaveLength(1);
    expect(packs[0].directed).toBe(false);
    expect(packs[0].basis).toBe('evidencePackId=pack-1');
  });

  it('three records in one pack produce three pairs, each emitted once', () => {
    const graph = buildMatrixRelationGraph([
      rec('a', { labId: 'l1', evidencePackId: 'p' }),
      rec('b', { labId: 'l2', evidencePackId: 'p' }),
      rec('c', { labId: 'l3', evidencePackId: 'p' }),
    ]);
    expect(graph.edges.filter((e) => e.kind === 'SHARED_EVIDENCE_PACK')).toHaveLength(3);
  });

  it('ordering is deterministic', () => {
    const records = [
      rec('b', { labId: 'l2', evidencePackId: 'p' }),
      rec('a', { labId: 'l1', evidencePackId: 'p' }),
    ];
    const forward = buildMatrixRelationGraph(records);
    const reversed = buildMatrixRelationGraph([...records].reverse());
    expect(forward.edges).toEqual(reversed.edges);
  });
});

describe('gaps are reported as gaps', () => {
  it('predictions with no measurement at all are named, with a count', () => {
    const graph = buildMatrixRelationGraph([
      rec('p1', { labId: 'l1', worldDiscovery: {} as SavedExperiment['worldDiscovery'] }),
      rec('p2', { labId: 'l2', worldDiscovery: {} as SavedExperiment['worldDiscovery'] }),
    ]);
    const gap = graph.missing.find((m) => m.from === 'PREDICTION');
    expect(gap).toBeDefined();
    expect(gap!.reason).toBe('NOT_YET_LINKED');
    expect(gap!.detail).toContain('2');
  });

  it('a fully verified prediction leaves no PREDICTION gap', () => {
    const graph = buildMatrixRelationGraph([
      rec('p1', { labId: 'l1', worldDiscovery: {} as SavedExperiment['worldDiscovery'] }),
      rec('m1', { labId: 'l2', realExperimentVerification: verification('p1') }),
    ]);
    expect(graph.missing.find((m) => m.from === 'PREDICTION')).toBeUndefined();
  });

  it('the schema gap between hypothesis and experiment is stated, not papered over', () => {
    const graph = buildMatrixRelationGraph([
      rec('h', { hypothesisLoop: {} as SavedExperiment['hypothesisLoop'] }),
    ]);
    const gap = graph.missing.find((m) => m.from === 'HYPOTHESIS');
    expect(gap).toBeDefined();
    expect(gap!.reason).toBe('NO_LINKING_FIELD');
  });

  it('an empty store yields no edges and no invented gaps', () => {
    const graph = buildMatrixRelationGraph([]);
    expect(graph.edges).toEqual([]);
    expect(graph.missing).toEqual([]);
  });
});

describe('edgesFor', () => {
  it('returns every edge touching a record, in either direction', () => {
    const graph = buildMatrixRelationGraph([
      rec('p', { labId: 'l1', worldDiscovery: {} as SavedExperiment['worldDiscovery'] }),
      rec('m', { labId: 'l2', realExperimentVerification: verification('p') }),
    ]);
    expect(edgesFor(graph, 'p')).toHaveLength(1);
    expect(edgesFor(graph, 'm')).toHaveLength(1);
    expect(edgesFor(graph, 'nobody')).toHaveLength(0);
  });
});
