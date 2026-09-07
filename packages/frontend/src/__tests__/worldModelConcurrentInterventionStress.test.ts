import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { compareBranches, executeIntervention } from '../core/worldModel/bridge/worldFrameState';
import { applyInterventionWithEvent } from '../core/worldModel/events/worldEventRules';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import { getCausalAncestry } from '../core/worldModel/queries/worldQueries';
import { TemporalBranchRegistry } from '../core/worldModel/temporal/temporalEngine';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

/**
 * CONCURRENT / INTERLEAVED INTERVENTION STRESS TEST (Priority 3.8) — an
 * adversarial test of the branching system itself: multiple forks off the
 * SAME base branch, multiple interventions applied close together in tick
 * order (interleaved across branches, not sequential per branch), proving
 * replay determinism and the causal graph both stay correct under that
 * stress — not just the single-fork happy path every other test already
 * covers.
 */
describe('Multi-fork, interleaved-intervention stress test', () => {
  const spec: WorldSpecification = {
    worldId: 'stress-city',
    seed: 5,
    worldType: ['CITY', 'WATER_SYSTEM'],
    scientificDomains: [{ domain: 'hydraulics', required: true }],
  };
  const pumpId = 'pump-pipe-system:pump-pipe-1';

  it('4 branches forked at different ticks off the same root, each with its own intervention, all replay correctly and compare correctly pairwise', () => {
    const registry = new TemporalBranchRegistry();
    const root = createScientificWorld({ kind: 'specification', specification: spec }).engine;
    registry.register(root);

    for (let i = 0; i < 2; i++) root.advance(1, () => undefined);
    const rootAtTick2 = canonicalJson(root.graph.getEntity(pumpId)); // captured BEFORE any fork/intervention touches tick 2 — the shared-history baseline both root and forkA must agree on
    const forkA = root.forkBranch(2, 'stress-fork-a', (g) => {
      const p = g.getEntity(pumpId);
      g.updateEntity(pumpId, { domainState: { ...p.domainState, volumetricFlow: 0.1 } });
    });
    registry.register(forkA);

    root.advance(1, () => undefined);
    const forkB = root.forkBranch(3, 'stress-fork-b', (g) => {
      const p = g.getEntity(pumpId);
      g.updateEntity(pumpId, { domainState: { ...p.domainState, volumetricFlow: 0.2 } });
    });
    registry.register(forkB);

    // Interleave real interventions across branches — root, forkA, forkB, root again — rather than
    // finishing one branch's own timeline before touching the next.
    executeIntervention(root, pumpId, { 'domainState.volumetricFlow': 0.3 });
    executeIntervention(forkA, pumpId, { 'domainState.volumetricFlow': 0.4 });
    root.advance(1, () => undefined);
    executeIntervention(forkB, pumpId, { 'domainState.volumetricFlow': 0.5 });
    forkA.advance(1, () => undefined);
    executeIntervention(root, pumpId, { 'domainState.volumetricFlow': 0.6 });
    forkB.advance(1, () => undefined);

    const forkC = forkA.forkBranch(forkA.tick, 'stress-fork-c', (g) => {
      const p = g.getEntity(pumpId);
      g.updateEntity(pumpId, { domainState: { ...p.domainState, volumetricFlow: 0.7 } });
    });
    registry.register(forkC);
    executeIntervention(forkC, pumpId, { 'domainState.volumetricFlow': 0.8 });

    // INVARIANT 1: every branch's own live state, independently, replays byte-identical.
    for (const engine of [root, forkA, forkB, forkC]) {
      const live = engine.graph.getEntity(pumpId);
      const replayed = engine.scrubTo(engine.tick).getEntity(pumpId);
      expect(canonicalJson(replayed)).toBe(canonicalJson(live));
    }

    // INVARIANT 2: the four branches genuinely hold four DIFFERENT final flow values — the
    // interleaving didn't cross-contaminate one branch's state into another's.
    const flows = [root, forkA, forkB, forkC].map((e) => e.graph.getEntity(pumpId).domainState?.volumetricFlow);
    expect(new Set(flows).size).toBe(4);
    expect(flows).toEqual([0.6, 0.4, 0.5, 0.8]);

    // INVARIANT 3: pairwise comparison at a tick every branch has reached shows real, distinct divergence.
    const commonTick = Math.min(root.tick, forkA.tick, forkB.tick, forkC.tick);
    const rootVsA = compareBranches(registry, root.branchId, forkA.branchId, commonTick);
    const aVsB = compareBranches(registry, forkA.branchId, forkB.branchId, commonTick);
    expect(rootVsA.entityDiffs.find((d) => d.id === pumpId)?.equal).toBe(false);
    expect(aVsB.entityDiffs.find((d) => d.id === pumpId)?.equal).toBe(false);

    // INVARIANT 4: each branch's ancestry (parentBranchId chain) is exactly what was forked, in order.
    expect(forkA.parentBranchId).toBe(root.branchId);
    expect(forkB.parentBranchId).toBe(root.branchId);
    expect(forkC.parentBranchId).toBe(forkA.branchId);

    // INVARIANT 5: root's own recorded history at tick 2 is EXACTLY what it was the moment forkA
    // was created from it — untouched by anything done to any fork (or to root itself) afterward.
    // No shared-history corruption from the interleaving.
    expect(canonicalJson(root.scrubTo(2).getEntity(pumpId))).toBe(rootAtTick2);
  });

  it('causal ancestry stays correct for an intervention event on a deeply-forked branch (fork of a fork)', () => {
    const registry = new TemporalBranchRegistry();
    const root = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'stress-city-2' } }).engine;
    registry.register(root);
    root.advance(1, () => undefined);
    const forkA = root.forkBranch(1, 'deep-fork-a', () => {});
    registry.register(forkA);
    forkA.advance(1, () => undefined);
    const forkB = forkA.forkBranch(2, 'deep-fork-b', () => {});
    registry.register(forkB);

    applyInterventionWithEvent(forkB, pumpId, { 'domainState.volumetricFlow': 0.99 });
    const events = forkB.journal.allEvents().filter((e) => e.type === 'world.intervention.applied');
    expect(events.length).toBeGreaterThan(0);
    // The intervention event itself has no further parent (a root cause, not a cascade consequence) —
    // getCausalAncestry must handle that honestly (a chain of exactly one) rather than erroring.
    const ancestry = getCausalAncestry(forkB, events[0]!.id);
    expect(ancestry).toEqual([events[0]]);
  });
});
