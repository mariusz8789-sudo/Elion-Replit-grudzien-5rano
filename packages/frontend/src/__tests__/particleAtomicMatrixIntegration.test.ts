import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { kindsOf } from '../components/GenesisMatrixHub';
import { buildMatrixRelationGraph, edgesFor } from '../core/agent/matrixRelations';
import { GENESIS_ATOMIC_IONIZATION_CATALOG_ID } from '../core/agent/atomicIonizationLeverCatalog';
import { GENESIS_PARTICLE_PHYSICS_CATALOG_ID } from '../core/agent/particlePhysicsLeverCatalog';
import type { SavedExperiment } from '../core/scienceMemory';

/**
 * PARTICLE / ATOMIC RECORDS INSIDE THE EXISTING MATRIX.
 *
 * The question this file answers is deliberately narrow: do records produced by
 * the two new physics environments land in the Matrix and the relation graph
 * that ALREADY EXIST, through the fields those two already read — or would they
 * need a Particle Matrix of their own?
 *
 * They do not need one, and these tests are what proves it rather than a claim
 * in a document. Nothing here is domain-specific code: `matrixRelations.ts` and
 * `kindsOf()` are untouched, and a particle or atomic run reaches both because
 * `saveWorldDiscoveryRunToMemory` sets `labId`, `experimentId` and
 * `evidencePackId` for EVERY world-discovery record, whatever the domain.
 *
 * These tests exist so that stays true: if a future change stops setting one of
 * those fields for these domains, the relation silently disappears from the
 * Matrix, and a silent disappearance is exactly what a graph must never do.
 */

// Reset BEFORE each test as well as after: the static imports at the top of
// this file load `scienceMemory` at module-eval time, before any `window` stub
// exists, so without this the FIRST test would talk to a different module
// instance than `runWorldDiscoveryAndRemember` writes through.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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

async function runDiscovery(goal: string, catalogId: string) {
  const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
  const state = runWorldDiscoveryAndRemember(goal, catalogId);
  if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
  return state;
}

describe('particle and atomic runs carry the fields the Matrix actually reads', () => {
  it('sets labId, experimentId and evidencePackId on a real collider run — no domain-specific code', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getExperiment } = await import('../core/scienceMemory');
    const state = await runDiscovery('Maximise signal to background, at most 2 experiments.', GENESIS_PARTICLE_PHYSICS_CATALOG_ID);
    const record = getExperiment(state.savedExperimentId)!;

    expect(record.labId).toBe('genesis-particle-collider');
    expect(record.experimentId).toContain(`world-discovery:${GENESIS_PARTICLE_PHYSICS_CATALOG_ID}`);
    // The evidence bundle id IS the evidence pack id — one identifier, so the
    // Matrix groups on the same value the Evidence Showcase displays.
    expect(record.evidencePackId).toBe(state.evidence.bundleId);
  }, 30_000);

  it('does the same for a real ionisation-chamber run', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getExperiment } = await import('../core/scienceMemory');
    const state = await runDiscovery('Maximise ion yield, at most 2 experiments.', GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    const record = getExperiment(state.savedExperimentId)!;

    expect(record.labId).toBe('genesis-atomic-ionization');
    expect(record.experimentId).toContain(`world-discovery:${GENESIS_ATOMIC_IONIZATION_CATALOG_ID}`);
    expect(record.evidencePackId).toBe(state.evidence.bundleId);
  }, 30_000);

  it('leaves evidenceChainId and replayIdentity unset — and that is correct, not a gap', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getExperiment } = await import('../core/scienceMemory');
    const state = await runDiscovery('Maximise ion yield, at most 2 experiments.', GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    const record = getExperiment(state.savedExperimentId)!;

    // `evidenceChainId` belongs to the legacy ExperimentFabric chain, a
    // different substrate. A WorldGraph discovery run has no Fabric chain, so
    // inventing an id would fabricate a link that nothing backs.
    expect(record.evidenceChainId).toBeUndefined();
    // `replayIdentity.capsuleId` means "this record replays a Fabric capsule".
    // These runs replay by RE-EXECUTING from stored inputs, which is a stronger
    // guarantee and a different mechanism — so claiming a capsule would be a lie
    // that the Matrix would then draw as a real SAME_REPLAY_CAPSULE edge.
    expect(record.replayIdentity).toBeUndefined();
  }, 30_000);
});

describe('the EXISTING kindsOf() already classifies these records', () => {
  it('files a collider run under both WORLD and EVIDENCE, with no new kind', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getExperiment } = await import('../core/scienceMemory');
    const state = await runDiscovery('Maximise signal to background, at most 2 experiments.', GENESIS_PARTICLE_PHYSICS_CATALOG_ID);
    const kinds = kindsOf(getExperiment(state.savedExperimentId)!);

    expect(kinds).toContain('WORLD');
    expect(kinds).toContain('EVIDENCE');
    // The fallback bucket means "nothing recognised this" — it must not appear.
    expect(kinds).not.toContain('EXPERIMENT');
  }, 30_000);

  it('files an ionisation run the same way — one physics laboratory, one taxonomy', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { getExperiment } = await import('../core/scienceMemory');
    const state = await runDiscovery('Maximise ion yield, at most 2 experiments.', GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    const kinds = kindsOf(getExperiment(state.savedExperimentId)!);

    expect(kinds).toContain('WORLD');
    expect(kinds).toContain('EVIDENCE');
    expect(kinds).not.toContain('EXPERIMENT');
  }, 30_000);
});

describe('the EXISTING matrixRelations.ts derives real edges for these records', () => {
  it('links two runs of the same atomic question by evidence pack AND by rerun', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { listExperiments } = await import('../core/scienceMemory');
    const goal = 'Maximise ion yield, at most 2 experiments.';
    const a = await runDiscovery(goal, GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    const b = await runDiscovery(goal, GENESIS_ATOMIC_IONIZATION_CATALOG_ID);
    expect(a.savedExperimentId).not.toBe(b.savedExperimentId);

    const graph = buildMatrixRelationGraph(listExperiments());
    const between = graph.edges.filter(
      (e) => [e.fromId, e.toId].includes(a.savedExperimentId) && [e.fromId, e.toId].includes(b.savedExperimentId),
    );
    const kinds = between.map((e) => e.kind);

    // The run is deterministic, so a second run of the same goal reaches the
    // same evidence bundle and the same experiment id — and BOTH of those are
    // real, stored fields, so both edges are proved rather than guessed.
    expect(kinds).toContain('SHARED_EVIDENCE_PACK');
    expect(kinds).toContain('SAME_EXPERIMENT_RERUN');
    for (const edge of between) expect(edge.basis.length).toBeGreaterThan(0);
  }, 60_000);

  it('does NOT invent an edge between a collider run and an atomic run', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { listExperiments } = await import('../core/scienceMemory');
    const collider = await runDiscovery('Maximise signal to background, at most 2 experiments.', GENESIS_PARTICLE_PHYSICS_CATALOG_ID);
    const atomic = await runDiscovery('Maximise ion yield, at most 2 experiments.', GENESIS_ATOMIC_IONIZATION_CATALOG_ID);

    const graph = buildMatrixRelationGraph(listExperiments());
    const between = graph.edges.filter(
      (e) => [e.fromId, e.toId].includes(collider.savedExperimentId) && [e.fromId, e.toId].includes(atomic.savedExperimentId),
    );
    // Two environments of one laboratory are still two different experiments
    // with two different evidence bundles. "Both are physics" is a similarity,
    // and this graph draws no edge a concrete field does not prove.
    expect(between).toHaveLength(0);
  }, 60_000);

  it('accepts a collider run as the TARGET of a real measurement, closing the loop', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { listExperiments } = await import('../core/scienceMemory');
    const prediction = await runDiscovery('Maximise signal to background, at most 2 experiments.', GENESIS_PARTICLE_PHYSICS_CATALOG_ID);

    // `buildMatrixRelationGraph` is a stateless projection and reads exactly one
    // field off this branch — `predictionSourceExperimentId`. The cast is scoped
    // to that: it stands in for a real verification record without pulling a
    // whole ExperimentRun and PredictionVerification into a relation test.
    const verification = {
      id: 'test:real-measurement',
      createdAt: new Date().toISOString(),
      labId: 'genesis-particle-collider',
      experimentId: 'real-experiment:collider',
      realExperimentVerification: { predictionSourceExperimentId: prediction.savedExperimentId },
    } as unknown as SavedExperiment;

    const graph = buildMatrixRelationGraph([...listExperiments(), verification]);
    const closing = edgesFor(graph, prediction.savedExperimentId).find((e) => e.kind === 'VERIFIES_PREDICTION');

    expect(closing).toBeDefined();
    expect(closing!.directed).toBe(true);
    expect(closing!.toId).toBe(prediction.savedExperimentId);
    expect(closing!.basis).toBe('realExperimentVerification.predictionSourceExperimentId');
  }, 30_000);

  it('reports an unverified physics prediction as a GAP rather than hiding it', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { listExperiments } = await import('../core/scienceMemory');
    await runDiscovery('Maximise ion yield, at most 2 experiments.', GENESIS_ATOMIC_IONIZATION_CATALOG_ID);

    const graph = buildMatrixRelationGraph(listExperiments());
    const gap = graph.missing.find((m) => m.from === 'PREDICTION' && m.to === 'REAL RESULT');
    expect(gap).toBeDefined();
    expect(gap!.reason).toBe('NOT_YET_LINKED');
  }, 30_000);
});
