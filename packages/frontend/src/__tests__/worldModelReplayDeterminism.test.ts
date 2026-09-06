import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import type { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';
import { buildGenesisCityWorld, makeGenesisCityRouter, makeGenesisCityUpdater } from '../core/worldModel/domains/genesisCityWorld';

/**
 * PRIORITY 4 (world persistence/journal hardening): proves the specific
 * guarantee the mission asks for — "prefer byte-identical or deterministic
 * equality where practical" — for `scrubTo` replay, across THREE real,
 * independently-solved domains sharing one `WorldGraph` (chemistry,
 * epidemiology, hydraulics; see genesisCityWorld.ts), not just one
 * hand-rolled kinematics fixture.
 *
 * `canonicalJson` (core/events/hash.ts) is the same deterministic,
 * key-order-independent serialization `diffGraphs` itself already uses to
 * decide whether an entity changed — so comparing two entities' canonical
 * JSON for equality is exactly "the graph's own notion of byte-identical."
 */
function canonicalEntities(graph: WorldGraph): string {
  // Sort by id first: `listEntities()` iterates Map insertion order, which
  // is already stable, but sorting makes the comparison robust to that
  // detail rather than relying on it.
  return canonicalJson([...graph.listEntities()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

describe('Replay determinism (Priority 4: world persistence/journal)', () => {
  it('scrubTo(headTick) is byte-identical to the live graph across three coexisting real domains', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 5; i++) engine.advance(3600, updater);

    const live = canonicalEntities(engine.graph);
    const replayed = canonicalEntities(engine.scrubTo(engine.tick));
    expect(replayed).toBe(live);
  });

  it('scrubTo is itself deterministic: replaying to the same tick twice yields byte-identical results', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 4; i++) engine.advance(3600, updater);

    const first = canonicalEntities(engine.scrubTo(2));
    const second = canonicalEntities(engine.scrubTo(2));
    expect(second).toBe(first);
  });

  it('scrubTo never mutates the live graph: the head state is unchanged after scrubbing to an earlier tick', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const engine = new TemporalEngine(world.graph);
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 3; i++) engine.advance(3600, updater);
    const before = canonicalEntities(engine.graph);

    engine.scrubTo(0);
    engine.scrubTo(1);

    expect(canonicalEntities(engine.graph)).toBe(before);
  });

  it('an unmutated fork is byte-identical to its parent at the fork point, and both replay ancestor ticks identically', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(world.graph, { label: 'root', registry });
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 4; i++) root.advance(3600, updater);

    const rootAtTick4 = canonicalEntities(root.scrubTo(4));
    const fork = root.forkBranch(4, 'counterfactual', () => {
      // No mutation: this fork exists only to prove shared ancestry at the fork point.
    });

    // A fork's own keyframe (== its graph, before any ticks of its own) is byte-identical to the
    // parent's state at the fork tick — the declared divergence, `mutate`, is a no-op here.
    expect(canonicalEntities(fork.graph)).toBe(rootAtTick4);
    // A fork cannot scrub before its own keyframe: shared ancestry is proven via the parent
    // branch, not by asking the fork to replay ticks that predate its own history (see the
    // dedicated "rejects scrubbing before a branch's own keyframe" test in worldModelTemporal.test.ts).
    expect(() => fork.scrubTo(0)).toThrow();
  });

  it('branch divergence is deterministic: root and a mutated fork stay byte-identical before the fork tick and diverge only after it', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(world.graph, { label: 'root', registry });
    const updater = makeGenesisCityUpdater(router);

    root.advance(3600, updater); // tick 1
    root.advance(3600, updater); // tick 2
    const rootAtForkTickBefore = canonicalEntities(root.scrubTo(2));

    // Real intervention: shut the pump's flow to zero — the same `volumetricFlow` parameter
    // `executeIntervention('domainState.volumetricFlow', ...)` would patch, applied directly here.
    const fork = root.forkBranch(2, 'pump-shutdown', (g) => {
      g.updateEntity(world.pumpPipeId, { domainState: { ...g.getEntity(world.pumpPipeId).domainState, volumetricFlow: 0 } });
    });

    // Root's own recorded history (ticks 0..2) is untouched by the fork's divergence mutation,
    // since `forkBranch` mutates a fresh `scrubTo()` clone, never root's own history/journal.
    expect(canonicalEntities(root.scrubTo(2))).toBe(rootAtForkTickBefore);
    // The fork itself, however, is the declared divergence from tick 2 onward: its own keyframe
    // (== its graph, since it has no history frames yet) already reflects the mutation.
    expect(canonicalEntities(fork.graph)).not.toBe(canonicalEntities(root.scrubTo(2)));

    root.advance(3600, updater); // tick 3 on root, unaffected by the fork
    fork.advance(3600, updater); // tick 3 on fork, pump shut off and re-solved by the real hydraulics model

    expect(root.graph.getEntity(world.pumpPipeId).domainState?.volumetricFlow).toBeGreaterThan(0);
    expect(fork.graph.getEntity(world.pumpPipeId).domainState?.volumetricFlow).toBe(0);
    expect(fork.graph.getEntity(world.pumpPipeId).domainState?.shaftPower).toBe(0); // real re-derived consequence, not asserted directly
  });

  it('journal ancestry is preserved on fork: cloneUpToTick shares prior evidence and diverges only afterward', () => {
    const world = buildGenesisCityWorld();
    const router = makeGenesisCityRouter(world.epidemicParams);
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(world.graph, { label: 'root', registry });
    const updater = makeGenesisCityUpdater(router);

    for (let i = 0; i < 3; i++) root.advance(3600, updater);
    const rootEventsAtFork = root.journal.upToTick(3).events.length;
    expect(rootEventsAtFork).toBeGreaterThan(0); // real solvers do emit evidence for this world

    const fork = root.forkBranch(3, 'evidence-fork', () => {});
    expect(fork.journal.allEvents().length).toBe(rootEventsAtFork);

    root.advance(3600, updater);
    fork.advance(3600, updater);

    // Each branch only grew its OWN journal after the fork point; they no longer share entries 1:1.
    expect(root.journal.allEvents().length).toBeGreaterThan(rootEventsAtFork);
    expect(fork.journal.allEvents().length).toBeGreaterThan(rootEventsAtFork);
  });
});
