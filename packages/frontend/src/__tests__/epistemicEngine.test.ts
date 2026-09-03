import { describe, expect, it } from 'vitest';
import {
  applyEpistemicUpdates,
  buildEpistemicEdge,
  buildEpistemicGraph,
  buildEpistemicNode,
  listUnresolved,
  nextActionForOpenNode,
  replayEpistemicUpdates,
  saveEpistemicGraphToMemory,
  type EpistemicNode,
} from '../core/discovery/epistemicEngine';

function hyp(id: string, status: EpistemicNode['status'] = 'UNRESOLVED'): EpistemicNode {
  return buildEpistemicNode({
    nodeId: id, kind: 'HYPOTHESIS', domainId: 'TEST', statement: `statement of ${id}`,
    status, statusReason: 'initial', provenance: [`declared:${id}`],
  });
}

describe('epistemic engine — node and edge construction', () => {
  it('1. epistemic nodes can be created', () => {
    const node = hyp('h1');
    expect(node.nodeId).toBe('h1');
    expect(node.fingerprint.length).toBeGreaterThan(0);
  });

  it('refuses a node with no provenance', () => {
    expect(() => buildEpistemicNode({ nodeId: 'x', kind: 'FACT', domainId: 'T', statement: 's', status: 'ESTABLISHED', statusReason: 'r', provenance: [] })).toThrow(/no provenance/);
  });

  it('3. UNKNOWN is representable, with structured detail', () => {
    const node = buildEpistemicNode({
      nodeId: 'u1', kind: 'UNKNOWN', domainId: 'TEST', statement: 'What is the real measured value?',
      status: 'UNKNOWN', statusReason: 'No retrieval has been performed.', provenance: ['declared:u1'],
      unknownDetail: {
        whatIsUnknown: 'The real measured value',
        whyUnknown: 'No external retrieval has succeeded in this runtime.',
        missingEvidence: ['independent measurement'],
        competingHypothesisIds: ['h1', 'h2'],
        potentialResolution: 'Retrieve an independent measurement.',
      },
    });
    expect(node.unknownDetail).not.toBeNull();
    expect(node.status).toBe('UNKNOWN');
  });

  it('refuses an UNKNOWN-kind node with no unknownDetail', () => {
    expect(() => buildEpistemicNode({ nodeId: 'u2', kind: 'UNKNOWN', domainId: 'T', statement: 's', status: 'UNRESOLVED', statusReason: 'r', provenance: ['p'] })).toThrow(/declares no unknownDetail/);
  });

  it('2. epistemic edges/dependencies can be created and referenced in a graph', () => {
    const a = hyp('a');
    const b = hyp('b');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b assumes a holds' });
    const graph = buildEpistemicGraph('g1', [a, b], [edge]);
    expect(graph.edges).toHaveLength(1);
  });

  it('refuses an edge referencing an unknown node', () => {
    const a = hyp('a');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'a', to: 'ghost', relation: 'DEPENDS_ON', rationale: 'r' });
    expect(() => buildEpistemicGraph('g1', [a], [edge])).toThrow(/unknown node "ghost"/);
  });
});

describe('epistemic engine — status updates and propagation', () => {
  it('4. supported evidence updates a hypothesis', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'SUPPORTED', reason: 'real test passed' }]);
    expect(result.graph.nodes[0]!.status).toBe('SUPPORTED');
    expect(result.changes).toHaveLength(1);
  });

  it('5. falsification updates a hypothesis', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    expect(result.graph.nodes[0]!.status).toBe('FALSIFIED');
  });

  it('6. falsification propagates through DEPENDS_ON to a dependent node, 7. producing BLOCKED', () => {
    const a = hyp('a');
    const b = hyp('b');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b assumes a' });
    const graph = buildEpistemicGraph('g', [a, b], [edge]);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    const bNode = result.graph.nodes.find((n) => n.nodeId === 'b')!;
    expect(bNode.status).toBe('BLOCKED');
    const propagatedChange = result.changes.find((c) => c.nodeId === 'b')!;
    expect(propagatedChange.triggeredBy).toBe('a');
  });

  it('propagates transitively through a chain (a falsified -> b blocked -> c blocked)', () => {
    const a = hyp('a');
    const b = hyp('b');
    const c = hyp('c');
    const e1 = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b depends on a' });
    const e2 = buildEpistemicEdge({ edgeId: 'e2', from: 'c', to: 'b', relation: 'DEPENDS_ON', rationale: 'c depends on b' });
    const graph = buildEpistemicGraph('g', [a, b, c], [e1, e2]);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    expect(result.graph.nodes.find((n) => n.nodeId === 'c')!.status).toBe('BLOCKED');
  });

  it('BLOCKS edges propagate identically to DEPENDS_ON, in the opposite direction', () => {
    const a = hyp('a');
    const b = hyp('b');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'a', to: 'b', relation: 'BLOCKS', rationale: 'a blocks b if falsified' });
    const graph = buildEpistemicGraph('g', [a, b], [edge]);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    expect(result.graph.nodes.find((n) => n.nodeId === 'b')!.status).toBe('BLOCKED');
  });

  it('8. unrelated nodes are not incorrectly changed', () => {
    const a = hyp('a');
    const b = hyp('b');
    const unrelated = hyp('z');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b depends on a' });
    const graph = buildEpistemicGraph('g', [a, b, unrelated], [edge]);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    const z = result.graph.nodes.find((n) => n.nodeId === 'z')!;
    expect(z.status).toBe('UNRESOLVED');
    expect(result.changes.some((c) => c.nodeId === 'z')).toBe(false);
  });

  it('non-propagating relations (SUPPORTS, CONTRADICTS, etc.) never trigger an automatic status change', () => {
    const a = hyp('a');
    const b = hyp('b');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'CONTRADICTS', rationale: 'b contradicts a' });
    const graph = buildEpistemicGraph('g', [a, b], [edge]);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test failed' }]);
    expect(result.graph.nodes.find((n) => n.nodeId === 'b')!.status).toBe('UNRESOLVED');
  });

  it('an update to a node already at the target status produces no change entry', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED')], []);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'SUPPORTED', reason: 'still supported' }]);
    expect(result.changes).toHaveLength(0);
  });

  it('refuses an update to an unknown node id', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    expect(() => applyEpistemicUpdates(graph, [{ nodeId: 'ghost', newStatus: 'SUPPORTED', reason: 'r' }])).toThrow(/unknown node "ghost"/);
  });
});

describe('epistemic engine — provenance, fingerprints, determinism', () => {
  it('9. provenance is retained and appended, not overwritten', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const result = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'SUPPORTED', reason: 'real test', provenance: ['evidence:e1'] }]);
    const node = result.graph.nodes[0]!;
    expect(node.provenance).toContain('declared:a');
    expect(node.provenance).toContain('evidence:e1');
  });

  it('10. fingerprints are deterministic: identical graphs produce identical fingerprints', () => {
    const g1 = buildEpistemicGraph('g', [hyp('a')], []);
    const g2 = buildEpistemicGraph('g', [hyp('a')], []);
    expect(g1.fingerprint).toBe(g2.fingerprint);
  });

  it('12. same input produces the same resulting state', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const r1 = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test' }]);
    const r2 = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test' }]);
    expect(r1.graph.fingerprint).toBe(r2.graph.fingerprint);
  });

  it('13. different evidence produces a different resulting state', () => {
    const graph = buildEpistemicGraph('g', [hyp('a')], []);
    const supported = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'SUPPORTED', reason: 'real test A' }]);
    const falsified = applyEpistemicUpdates(graph, [{ nodeId: 'a', newStatus: 'FALSIFIED', reason: 'real test B' }]);
    expect(supported.graph.fingerprint).not.toBe(falsified.graph.fingerprint);
  });
});

describe('epistemic engine — replay', () => {
  it('11. replay reproduces the same epistemic state', () => {
    const a = hyp('a');
    const b = hyp('b');
    const edge = buildEpistemicEdge({ edgeId: 'e1', from: 'b', to: 'a', relation: 'DEPENDS_ON', rationale: 'b depends on a' });
    const initial = buildEpistemicGraph('g', [a, b], [edge]);
    const updates = [{ nodeId: 'a', newStatus: 'FALSIFIED' as const, reason: 'real test failed' }];
    const result = applyEpistemicUpdates(initial, updates);
    expect(replayEpistemicUpdates(initial, updates, result.graph).status).toBe('MATCH');
  });

  it('replays DRIFT when the saved final graph does not match recomputation', () => {
    const a = hyp('a');
    const initial = buildEpistemicGraph('g', [a], []);
    const updates = [{ nodeId: 'a', newStatus: 'FALSIFIED' as const, reason: 'real test failed' }];
    const result = applyEpistemicUpdates(initial, updates);
    const tampered = { ...result.graph, fingerprint: `${result.graph.fingerprint}0` };
    expect(replayEpistemicUpdates(initial, updates, tampered).status).toBe('DRIFT');
  });
});

describe('epistemic engine — next-action hook and memory', () => {
  it('produces a NextScientificAction for an UNRESOLVED node', () => {
    const node = hyp('a', 'UNRESOLVED');
    const action = nextActionForOpenNode(node);
    expect(action).not.toBeNull();
    expect(action!.availability).not.toBe('RUNNABLE_IN_GENESIS');
  });

  it('returns null for a resolved node', () => {
    const node = hyp('a', 'SUPPORTED');
    expect(nextActionForOpenNode(node)).toBeNull();
  });

  it('listUnresolved finds UNRESOLVED and UNKNOWN nodes only', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED'), hyp('b', 'UNRESOLVED')], []);
    const open = listUnresolved(graph);
    expect(open.map((n) => n.nodeId)).toEqual(['b']);
  });

  it('saves a graph to Scientific Memory with an honest per-status breakdown', () => {
    const graph = buildEpistemicGraph('g', [hyp('a', 'SUPPORTED'), hyp('b', 'FALSIFIED')], []);
    const saved = saveEpistemicGraphToMemory(graph);
    expect(saved.epistemicStatus).toContain('SUPPORTED=1');
    expect(saved.epistemicStatus).toContain('FALSIFIED=1');
  });
});
