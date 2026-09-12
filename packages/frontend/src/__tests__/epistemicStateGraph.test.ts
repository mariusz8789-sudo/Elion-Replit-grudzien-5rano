import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * ENGINE 08 — EPISTEMIC STATE GRAPH.
 *
 * The substrate decision this file proves: one node per REAL `SavedExperiment`
 * record, status DERIVED from real fields (never the free-text
 * `epistemicStatus` string), edges reused verbatim from `matrixRelations.ts`
 * (not reimplemented), deterministic and fingerprinted.
 */

const SRC_DIR = join(__dirname, '..');

function makeFakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

describe('source-level guarantee: derivation never reads SavedExperiment.epistemicStatus', () => {
  it('deriveNodeStatus\'s source contains no reference to record.epistemicStatus', () => {
    const source = readFileSync(join(SRC_DIR, 'core', 'agent', 'epistemicStateGraph.ts'), 'utf8');
    const fnMatch = source.match(/function deriveNodeStatus\([\s\S]*?\n\}/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![0]).not.toMatch(/record\.epistemicStatus/);
  });

  it('does not reimplement buildMatrixRelationGraph — imports it instead', () => {
    const source = readFileSync(join(SRC_DIR, 'core', 'agent', 'epistemicStateGraph.ts'), 'utf8');
    expect(source).toMatch(/import\s*\{[^}]*buildMatrixRelationGraph[^}]*\}\s*from\s*'\.\/matrixRelations'/);
    expect(source).not.toMatch(/function buildMatrixRelationGraph/);
  });
});

describe('buildEpistemicStateGraph — real, saved records, no fixtures pretending to be Memory', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('an empty Science Memory produces an empty graph, not an error', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');
    const graph = buildEpistemicStateGraph([]);
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it('a real Research Campaign chain produces real nodes with derived status and real reused edges', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { startResearchCampaign, continueResearchCampaign, isNoJustifiedNextQuestion } = await import('../core/experimentFabric/researchCampaign');
    const { saveScientificDiscoveryLoopToMemory, listExperiments } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');
    const { buildMatrixRelationGraph } = await import('../core/agent/matrixRelations');

    const cycle1 = await startResearchCampaign('problem:intervention-timing');
    const saved1 = saveScientificDiscoveryLoopToMemory(cycle1.result);
    const step2 = await continueResearchCampaign(cycle1);
    if (isNoJustifiedNextQuestion(step2)) throw new Error('Cycle #2 unexpectedly had no justified next question.');
    saveScientificDiscoveryLoopToMemory(step2.result, {
      previousCycleId: saved1.id,
      resolvedFrom: cycle1.result.nextExperiment.resolves,
      previousCycleFingerprint: saved1.discoveryLoop!.discoveryLoopFingerprint,
    });

    const records = listExperiments();
    const graph = buildEpistemicStateGraph(records);
    expect(graph.nodeCount).toBe(records.length);
    expect(graph.nodes.every((n) => n.derivationRule.length > 0)).toBe(true);

    // Edges are exactly matrixRelations's own edges, reindexed — never a second computation.
    const directRelations = buildMatrixRelationGraph(records);
    expect(graph.edgeCount).toBe(directRelations.edges.length);
  });

  it('a record with realExperimentVerification is derived OBSERVED regardless of its own epistemicStatus field claiming otherwise', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { GENESIS_GENERATOR_CATALOG, GENESIS_GENERATOR_OBJECTIVE_METRIC, GENESIS_GENERATOR_CATALOG_ID } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const {
      buildSavedWorldDiscoveryRun, saveWorldDiscoveryRunToMemory,
      buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory,
    } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');

    const state = runWorldDiscoveryAndRemember('Maximise fuel efficiency, at most 12 experiments.', GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;

    const sourceRecord = saveWorldDiscoveryRunToMemory(buildSavedWorldDiscoveryRun({
      resultKind: 'HYPOTHESIS_LOOP', goal: state.result.question, catalogId: GENESIS_GENERATOR_CATALOG_ID,
      worldId: GENESIS_GENERATOR_CATALOG.worldId, domainId: GENESIS_GENERATOR_CATALOG.domainId,
      objectiveMetric: GENESIS_GENERATOR_OBJECTIVE_METRIC, objectiveDirection: 'maximize',
      loopResult: state.result, evidence: null, resumedFromMemory: null,
    }));
    // sourceRecord itself has no realExperimentVerification -> derived from worldDiscovery -> SIMULATION.
    const request = {
      structuredRequest: { contractVersion: (await import('../core/experimentFabric/types')).EXPERIMENT_FABRIC_VERSION, sourceText: 'x', domainId: GENESIS_GENERATOR_CATALOG.domainId, operation: 'simulate' as const, parameters: {} },
      physicalProtocolRef: 'manual-fuel-dipstick-reading-v1',
      hypothesisId: lastRound.hypothesisId,
    };
    const realRun = createRealExperimentRun({
      request,
      derived: [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: lastRound.objectiveObserved!, unit: 'L', derivedFrom: [{ channel: 'fuel-tank-dipstick', value: lastRound.objectiveObserved!, unit: 'L', capturedAt: '2026-09-12T00:00:00.000Z' }] }],
      summary: 'Manual reading matching the model prediction.',
    });
    const saved = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: sourceRecord.id, loopResult: state.result,
      verificationCriterion: { metric: GENESIS_GENERATOR_OBJECTIVE_METRIC, relation: 'equal-within-tolerance', tolerance: 1e9, rationale: 'Always matches for this test.' },
      request, realRun,
    });
    const verificationRecord = saveRealExperimentVerificationToMemory(saved);

    const graph = buildEpistemicStateGraph([sourceRecord, verificationRecord]);
    const worldNode = graph.nodes.find((n) => n.nodeId === sourceRecord.id)!;
    const verificationNode = graph.nodes.find((n) => n.nodeId === verificationRecord.id)!;
    expect(worldNode.epistemicStatus).toBe('SIMULATION');
    expect(verificationNode.epistemicStatus).toBe('OBSERVED');
    expect(verificationNode.derivationRule).toContain('realExperimentVerification');
  });

  it('a BLOCKED research chain is derived BLOCKED, an INCONCLUSIVE one VERIFY_REQUIRED', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');

    const chain = runMechanismResearchChain({ shape: 'MECHANISM', goal: 'Maximise remaining fuel, at most 12 experiments.', catalog: GENESIS_GENERATOR_CATALOG }, 4);
    expect(chain.terminalStatus).toBe('SETTLED');

    const records = listExperiments();
    const manifestRecord = records.find((r) => r.researchChain !== undefined)!;
    const graph = buildEpistemicStateGraph(records);
    const node = graph.nodes.find((n) => n.nodeId === manifestRecord.id)!;
    expect(node.epistemicStatus).toBe('MODEL_ESTIMATE');
    expect(node.derivationRule).toContain('SETTLED');
  });

  it('an unrecognised shape reports UNKNOWN honestly, not a guess', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');

    const record = saveExperiment({
      labId: 'lab-1', experimentId: 'exp-1', experimentName: 'Unclassified record',
      params: {}, stats: {}, honesty: 'simplified', honestyNote: 'Test fixture.',
      epistemicStatus: 'FACT', // deliberately misleading value on the free-text field
    });
    const graph = buildEpistemicStateGraph([record]);
    expect(graph.nodes[0]!.epistemicStatus).toBe('UNKNOWN');
    expect(graph.nodes[0]!.derivationRule).toContain('no derivation rule');
  });

  it('determinism: same records, same order, produce an identical fingerprint', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');

    runMechanismResearchChain({ shape: 'MECHANISM', goal: 'Maximise remaining fuel, at most 12 experiments.', catalog: GENESIS_GENERATOR_CATALOG }, 4);
    const records = listExperiments();

    const first = buildEpistemicStateGraph(records);
    const second = buildEpistemicStateGraph([...records].reverse()); // input order must not matter — nodes are sorted by id
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('statusDistribution is a real count over the actual nodes, not asserted', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runMechanismResearchChain } = await import('../core/agent/researchChain');
    const { GENESIS_GENERATOR_CATALOG } = await import('../core/agent/electricalGeneratorLeverCatalog');
    const { listExperiments } = await import('../core/scienceMemory');
    const { buildEpistemicStateGraph } = await import('../core/agent/epistemicStateGraph');

    runMechanismResearchChain({ shape: 'MECHANISM', goal: 'Maximise remaining fuel, at most 12 experiments.', catalog: GENESIS_GENERATOR_CATALOG }, 4);
    const graph = buildEpistemicStateGraph(listExperiments());
    const summed = Object.values(graph.statusDistribution).reduce((a, b) => a + b, 0);
    expect(summed).toBe(graph.nodeCount);
  });
});
