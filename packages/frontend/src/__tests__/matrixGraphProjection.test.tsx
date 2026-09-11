import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MatrixGraph } from '../components/MatrixGraph';
import { projectMatrixGraph } from '../components/matrixGraphProjection';
import { kindsOf, primaryKindOf, ALL_MATRIX_KINDS } from '../components/matrixKinds';
import { kindsOf as kindsOfFromHub } from '../components/GenesisMatrixHub';
import { buildMatrixRelationGraph } from '../core/agent/matrixRelations';
import type { SavedExperiment } from '../core/scienceMemory';

/**
 * MATRIX GRAPH — projection tests.
 *
 * The rule these tests exist to hold: the graph is a VIEW of Genesis state and
 * invents nothing. So they never hand the projection a hand-built edge list —
 * every edge here comes from the real `buildMatrixRelationGraph`, and the final
 * block runs the whole chain against real records saved through the real
 * `saveExperiment`, so a drift in any of those contracts fails here rather than
 * silently producing a prettier, wronger picture.
 */

/**
 * Each fixture record gets its OWN `experimentId` by default.
 *
 * That is not cosmetic: `matrixRelations.ts` derives a real
 * `SAME_EXPERIMENT_RERUN` edge from `labId + experimentId`, so fixtures sharing
 * one hardcoded id are genuinely reruns of each other and Genesis correctly
 * links them. Defaulting to distinct ids keeps each test's relations to the one
 * it is actually testing — and a test that wants a rerun edge asks for it by
 * passing the same `experimentId` explicitly.
 */
const record = (overrides: Partial<SavedExperiment> = {}): SavedExperiment => {
  const id = overrides.id ?? 'exp-1';
  return {
    id, createdAt: new Date().toISOString(), labId: 'lab-1', experimentId: `e-${id}`,
    experimentName: 'Test experiment', params: {}, stats: {}, honesty: 'simplified', honestyNote: 'test fixture',
    equations: [], assumptions: [], epistemicStatus: 'PREDICTION', contentHash: 'test-hash',
    ...overrides,
  };
};

/** Always project from the REAL relation builder, never a hand-written edge list. */
const projectReal = (records: readonly SavedExperiment[]) =>
  projectMatrixGraph(records, buildMatrixRelationGraph(records));

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('the classifier is the SAME one Matrix already uses', () => {
  it('re-exports one implementation rather than defining a second', () => {
    // Both import paths must resolve to the identical function object, or
    // there are two classifiers and they will eventually disagree.
    expect(kindsOfFromHub).toBe(kindsOf);
  });

  it('primaryKindOf only ever picks a kind the record really has', () => {
    const kinds = kindsOf(record({
      worldDiscovery: {} as SavedExperiment['worldDiscovery'],
      evidencePackId: 'pack-1',
    }));
    expect(kinds).toContain('WORLD');
    expect(kinds).toContain('EVIDENCE');
    expect(kinds).toContain(primaryKindOf(kinds));
  });

  it('covers every declared Matrix kind in its display order', () => {
    expect([...ALL_MATRIX_KINDS].sort()).toEqual([
      'CYBER', 'DECIPHERMENT', 'EVIDENCE', 'EXPERIMENT', 'HYPOTHESIS',
      'MODEL', 'REPLAY', 'RESEARCH_CHAIN', 'SCENARIO', 'WORLD',
    ]);
  });
});

describe('every node keeps its full Genesis classification', () => {
  it('carries all kinds, not just the one it is drawn as', () => {
    const model = projectReal([record({
      id: 'a',
      discoveryLoop: {} as SavedExperiment['discoveryLoop'],
      biotech: {} as SavedExperiment['biotech'],
    })]);
    const node = model.nodeById.get('a')!;
    expect(node.kinds).toContain('HYPOTHESIS');
    expect(node.kinds).toContain('EVIDENCE');
    expect(node.kinds.length).toBe(2);
    expect(node.kinds).toContain(node.primaryKind);
  });

  it('uses record.id as the node id and experimentName as the label', () => {
    const model = projectReal([record({ id: 'real-id', experimentName: 'Nazwa przebiegu' })]);
    expect(model.nodeById.has('real-id')).toBe(true);
    expect(model.nodeById.get('real-id')!.label).toBe('Nazwa przebiegu');
  });

  it('falls back to experimentId when a record has no name, like the rest of Matrix', () => {
    const model = projectReal([record({ id: 'x', experimentName: '', experimentId: 'world-discovery:abc' })]);
    expect(model.nodeById.get('x')!.label).toBe('world-discovery:abc');
  });
});

describe('edges come only from matrixRelations, never from the projection', () => {
  it('draws a real SHARED_EVIDENCE_PACK relation and carries its basis through untouched', () => {
    const records = [
      record({ id: 'a', evidencePackId: 'pack-1' }),
      record({ id: 'b', evidencePackId: 'pack-1' }),
    ];
    const relations = buildMatrixRelationGraph(records);
    const model = projectMatrixGraph(records, relations);

    expect(model.edges).toHaveLength(1);
    // The exact edge object Genesis produced, not a re-derived copy.
    expect(model.edges[0].edge).toBe(relations.edges[0]);
    expect(model.edges[0].edge.kind).toBe('SHARED_EVIDENCE_PACK');
    expect(model.edges[0].edge.basis).toContain('evidencePackId');
  });

  it('draws NO edge between records that merely share a lab or a domain', () => {
    // Same labId, same shape, nothing that actually links them. A similarity
    // heuristic would connect these; Genesis does not, so neither does the graph.
    const model = projectReal([
      record({ id: 'a', labId: 'same-lab' }),
      record({ id: 'b', labId: 'same-lab' }),
    ]);
    expect(model.edges).toHaveLength(0);
    expect([...model.isolatedIds].sort()).toEqual(['a', 'b']);
  });

  it('keeps isolated records as visible nodes rather than dropping them', () => {
    const model = projectReal([
      record({ id: 'a', evidencePackId: 'pack-1' }),
      record({ id: 'b', evidencePackId: 'pack-1' }),
      record({ id: 'lonely' }),
    ]);
    expect(model.nodes).toHaveLength(3);
    expect(model.nodeById.get('lonely')!.isolated).toBe(true);
    expect(model.isolatedIds).toEqual(['lonely']);
  });

  it('draws nothing for a verification whose prediction was deleted — Genesis reports it as a GAP, not an edge', () => {
    const orphan = record({
      id: 'verifier',
      realExperimentVerification: { predictionSourceExperimentId: 'deleted-record' } as SavedExperiment['realExperimentVerification'],
    });
    const relations = buildMatrixRelationGraph([orphan]);

    // The real contract: matrixRelations never emits this as an edge at all.
    // It filters it upstream and states it as a missing relation instead, so
    // the graph has nothing to draw and nothing to hide.
    expect(relations.edges).toHaveLength(0);
    expect(relations.missing.some((m) => m.reason === 'ENDPOINT_MISSING')).toBe(true);

    const model = projectMatrixGraph([orphan], relations);
    expect(model.edges).toHaveLength(0);
    expect(model.nodeById.get('verifier')!.isolated).toBe(true);
  });

  it('still guards against an edge pointing outside the record set it was given', () => {
    // Defensive, not hypothetical: the projection takes `records` and
    // `relations` as separate arguments, so a caller could pass a relation
    // graph built from a different (larger) set. Such an edge is counted and
    // reported rather than drawn to a node that is not on screen.
    const both = [record({ id: 'a', evidencePackId: 'p' }), record({ id: 'b', evidencePackId: 'p' })];
    const relationsForBoth = buildMatrixRelationGraph(both);
    expect(relationsForBoth.edges).toHaveLength(1);

    const model = projectMatrixGraph([both[0]!], relationsForBoth);
    expect(model.edges).toHaveLength(0);
    expect(model.danglingEdgeCount).toBe(1);
  });

  it('PRESERVES a real self-relation instead of silently discarding it', () => {
    // Genesis can genuinely emit one: VERIFIES_PREDICTION is built as
    // fromId: record.id, toId: predictionSourceExperimentId.
    const selfVerifying = record({
      id: 'self',
      realExperimentVerification: { predictionSourceExperimentId: 'self' } as SavedExperiment['realExperimentVerification'],
    });
    const relations = buildMatrixRelationGraph([selfVerifying]);
    expect(relations.edges).toHaveLength(1); // Genesis really does assert it

    const model = projectMatrixGraph([selfVerifying], relations);
    expect(model.edges).toHaveLength(0);        // not drawable as a line...
    expect(model.selfEdges).toHaveLength(1);    // ...but never thrown away
    expect(model.selfEdgesById.get('self')).toHaveLength(1);
    expect(model.danglingEdgeCount).toBe(0);    // it is not "missing", it is self-directed
  });

  it('counts a directed verification edge as directed, preserving the arrow', () => {
    const records = [
      record({ id: 'prediction' }),
      record({
        id: 'measurement',
        realExperimentVerification: { predictionSourceExperimentId: 'prediction' } as SavedExperiment['realExperimentVerification'],
      }),
    ];
    const model = projectReal(records);
    expect(model.edges).toHaveLength(1);
    expect(model.edges[0].edge.directed).toBe(true);
    expect(model.edges[0].edge.fromId).toBe('measurement');
    expect(model.edges[0].edge.toId).toBe('prediction');
  });
});

describe('layout is deterministic and clusters by real connectivity', () => {
  const records = [
    record({ id: 'a', evidencePackId: 'pack-1' }),
    record({ id: 'b', evidencePackId: 'pack-1' }),
    record({ id: 'c', evidencePackId: 'pack-2' }),
    record({ id: 'd', evidencePackId: 'pack-2' }),
    record({ id: 'alone' }),
  ];

  it('produces identical coordinates on repeated projection of unchanged data', () => {
    const a = projectReal(records);
    const b = projectReal(records);
    expect(a.nodes.map((n) => [n.id, n.x, n.y])).toEqual(b.nodes.map((n) => [n.id, n.x, n.y]));
  });

  it('separates the two real evidence packs into two components', () => {
    const model = projectReal(records);
    expect(model.componentCount).toBe(2);
    expect(model.nodeById.get('a')!.componentIndex).toBe(model.nodeById.get('b')!.componentIndex);
    expect(model.nodeById.get('c')!.componentIndex).toBe(model.nodeById.get('d')!.componentIndex);
    expect(model.nodeById.get('a')!.componentIndex).not.toBe(model.nodeById.get('c')!.componentIndex);
  });

  it('puts unlinked records below every cluster, in their own band', () => {
    const model = projectReal(records);
    const clustered = model.nodes.filter((n) => !n.isolated);
    const lonely = model.nodeById.get('alone')!;
    expect(lonely.componentIndex).toBe(-1);
    for (const node of clustered) expect(lonely.y).toBeGreaterThan(node.y);
  });

  it('gives every node a finite position inside the viewBox', () => {
    const model = projectReal(records);
    for (const node of model.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.y).toBeLessThanOrEqual(model.viewBox.height);
    }
  });

  it('stays cheap at the real Science Memory cap of 100 records', () => {
    // scienceMemory.ts caps the store at MAX_TOTAL = 100, so this is the whole
    // worst case — not a hypothetical thousand-node graph.
    const many = Array.from({ length: 100 }, (_, i) =>
      record({ id: `r${i}`, evidencePackId: `pack-${i % 7}` }));
    const started = Date.now();
    const model = projectReal(many);
    expect(model.nodes).toHaveLength(100);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('the renderer draws real relations and hides nothing', () => {
  const records = [
    record({ id: 'a', experimentName: 'Alpha', evidencePackId: 'pack-1' }),
    record({ id: 'b', experimentName: 'Beta', evidencePackId: 'pack-1' }),
    record({ id: 'lonely', experimentName: 'Samotny' }),
  ];
  const model = projectReal(records);
  const html = renderToStaticMarkup(
    <MatrixGraph model={model} selectedId={null} onSelect={() => {}} onClearSelection={() => {}} />,
  );

  it('renders a node for every record, including the unlinked one', () => {
    expect(html).toContain('matrix-graph-node-a');
    expect(html).toContain('matrix-graph-node-b');
    expect(html).toContain('matrix-graph-node-lonely');
  });

  it('marks the unlinked record as isolated rather than omitting it', () => {
    expect(html).toContain('matrix-graph-node-isolated');
    expect(html).toContain('BEZ POWIĄZAŃ');
  });

  it('exposes each edge’s real basis, so a drawn line can be checked', () => {
    expect(html).toContain('podstawa: evidencePackId=pack-1');
  });

  it('reports the real counts instead of a decorative summary', () => {
    expect(html).toContain('>3</strong> rekordów');
    expect(html).toContain('>1</strong> realnych relacji');
    expect(html).toContain('>1</strong> bez powiązań');
  });

  it('dims unrelated records on selection instead of hiding them', () => {
    const selected = renderToStaticMarkup(
      <MatrixGraph model={model} selectedId="a" onSelect={() => {}} onClearSelection={() => {}} />,
    );
    expect(selected).toContain('matrix-graph-node-selected');
    expect(selected).toContain('matrix-graph-node-neighbour'); // b is a real neighbour
    expect(selected).toContain('matrix-graph-node-dim');       // lonely is dimmed, still drawn
    expect(selected).toContain('matrix-graph-node-lonely');
  });

  it('renders an honest empty state rather than an empty canvas', () => {
    const empty = renderToStaticMarkup(
      <MatrixGraph model={projectReal([])} selectedId={null} onSelect={() => {}} onClearSelection={() => {}} />,
    );
    expect(empty).toContain('matrix-graph-empty');
    expect(empty).toContain('Pamięć Naukowa jest pusta');
  });

  it('shows a self-relation on the node and in the counts', () => {
    const selfModel = projectReal([record({
      id: 'self',
      realExperimentVerification: { predictionSourceExperimentId: 'self' } as SavedExperiment['realExperimentVerification'],
    })]);
    const selfHtml = renderToStaticMarkup(
      <MatrixGraph model={selfModel} selectedId={null} onSelect={() => {}} onClearSelection={() => {}} />,
    );
    expect(selfHtml).toContain('matrix-graph-selfring-self');
    expect(selfHtml).toContain('matrix-graph-selfedge-count');
  });
});

describe('END TO END against the real Science Memory contracts', () => {
  it('projects records saved through the real saveExperiment, with real relations', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment, listExperiments } = await import('../core/scienceMemory');

    // Two runs sealed into the same evidence pack — a relation Genesis really
    // derives — plus one standalone run that nothing links to.
    const base = {
      labId: 'graph-lab', params: {}, stats: {},
      honesty: 'simplified' as const, honestyNote: 'integration fixture',
      assumptions: [], epistemicStatus: 'SIMULATION',
    };
    saveExperiment({ ...base, experimentId: 'run-1', experimentName: 'Run one', evidencePackId: 'shared-pack' });
    saveExperiment({ ...base, experimentId: 'run-2', experimentName: 'Run two', evidencePackId: 'shared-pack' });
    saveExperiment({ ...base, experimentId: 'run-3', experimentName: 'Run three' });

    const saved = listExperiments();
    expect(saved).toHaveLength(3);

    const relations = buildMatrixRelationGraph(saved);
    const model = projectMatrixGraph(saved, relations);

    // Nodes are the real saved records, keyed by the real id.
    expect(model.nodes).toHaveLength(3);
    for (const node of model.nodes) expect(saved.some((r) => r.id === node.id)).toBe(true);

    // The pack relation is real and drawn; the standalone run is isolated.
    const packEdge = model.edges.find((e) => e.edge.kind === 'SHARED_EVIDENCE_PACK');
    expect(packEdge).toBeDefined();
    expect(packEdge!.edge.basis).toContain('shared-pack');
    expect(model.isolatedIds).toHaveLength(1);

    // And the classification on the nodes is the real one: an evidencePackId
    // makes a record EVIDENCE, exactly as kindsOf() says.
    const packNodes = model.nodes.filter((n) => n.id !== model.isolatedIds[0]);
    for (const node of packNodes) expect(node.kinds).toContain('EVIDENCE');
  });
});
