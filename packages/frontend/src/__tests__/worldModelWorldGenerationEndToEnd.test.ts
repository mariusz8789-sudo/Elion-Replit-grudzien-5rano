import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { validateEvent } from '../core/events/genesisEvent';
import { compareBranches, executeIntervention, getFrameState } from '../core/worldModel/bridge/worldFrameState';
import { buildGenesisCityWorld2, WATER_SERVICE_INTERRUPTED_EVENT_TYPE } from '../core/worldModel/domains/genesisCityWorld2';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * WORLD GENERATION 1.0 — THE ONE TRUE END-TO-END TEST (mission section 13).
 *
 * WorldBlueprint -> WorldGenerator -> WorldGraph -> TemporalEngine -> real
 * solver -> real state change -> derived event -> journal -> WorldFrame ->
 * branch -> intervention -> a genuinely different outcome -> compare.
 *
 * Every step below is REAL C3 infrastructure — `buildGenesisCityWorld2`
 * (which itself calls `generateWorld` on a real `WorldBlueprint`), the real
 * hydraulics `EngineeringModel`, the real `TemporalEngine`/`WorldJournal`,
 * the real `bridge/worldFrameState.ts` contract. Nothing here is mocked or
 * pre-computed; every assertion reads a value this chain actually produced.
 */
describe('World Generation 1.0 — one true end-to-end chain', () => {
  it('runs blueprint -> generator -> graph -> temporal engine -> solver -> event -> journal -> WorldFrame -> branch -> intervention -> divergence -> compare', () => {
    // 1. WORLDBLUEPRINT -> WORLDGENERATOR -> WORLDGRAPH: a real declarative blueprint, deterministically generated.
    const world = buildGenesisCityWorld2({ seed: 11 });
    expect(world.blueprint.seed).toBe(11);
    expect(world.generated.entityIds.length).toBeGreaterThan(5); // city + districts + buildings + pump-pipe + environment
    expect(world.graph.listEntities().length).toBeGreaterThan(10); // plus roads and the real chemistry/epidemiology leaves attached post-generation

    // 2. TEMPORALENGINE: wraps the generated graph; the generation event itself becomes real,
    // recorded provenance for how this world came to exist.
    const registry = new TemporalBranchRegistry();
    const root = new TemporalEngine(world.graph, { label: 'root', registry });
    root.journal.recordEvent(world.generated.generationEvent);
    expect(validateEvent(world.generated.generationEvent).ok).toBe(true);

    // 3. REAL SOLVER -> REAL STATE CHANGE -> EVENT -> JOURNAL: three independent real domains
    // (chemistry/epidemiology/hydraulics) genuinely advance on this generated world.
    for (let i = 0; i < 3; i++) root.advance(3600, world.updater);

    const pumpPipeBefore = root.graph.getEntity(world.pumpPipeId);
    expect(pumpPipeBefore.domainState?.headLoss).toBeGreaterThan(0); // real hydraulics output, not asserted directly elsewhere
    const hydraulicsEvents = root.journal.allEvents().filter((e) => e.type === 'hydraulics.pumppipe.step');
    expect(hydraulicsEvents.length).toBe(3);
    for (const event of hydraulicsEvents) expect(validateEvent(event).ok).toBe(true);

    // 4. WORLDFRAME: the C1/C2 bridge projects the same real, just-solved state.
    const frameBeforeFork = getFrameState(root);
    const pumpPipeFrame = frameBeforeFork.entities.find((e) => e.id === world.pumpPipeId)!;
    expect(pumpPipeFrame.scalars.headLoss).toBeCloseTo(pumpPipeBefore.domainState!.headLoss, 10);

    // 5. REPLAY: scrubbing back to the fork tick reconstructs the exact same state, byte-identical.
    const forkTick = root.tick;
    const replayedAtForkTick = root.scrubTo(forkTick);
    expect(canonicalJson(replayedAtForkTick.getEntity(world.pumpPipeId))).toBe(canonicalJson(pumpPipeBefore));

    // 6. BRANCH: fork at the current tick — both branches start identical.
    const fork = root.forkBranch(forkTick, 'pump-failure-scenario', () => {});
    expect(canonicalJson(fork.graph.getEntity(world.pumpPipeId))).toBe(canonicalJson(pumpPipeBefore));

    // 7. INTERVENTION (fork only) -> DIFFERENT OUTCOME: a real flow-rate cut, re-solved by the
    // SAME real hydraulics model, cascading into a real (non-fabricated) hospital service flag.
    executeIntervention(fork, world.pumpPipeId, { 'domainState.volumetricFlow': 0 });
    const forkPumpAtForkTick = fork.graph.getEntity(world.pumpPipeId); // snapshot right after the intervention, before any further ticking
    fork.advance(3600, world.updater);
    root.advance(3600, world.updater); // root keeps running unperturbed, for comparison

    const rootPumpAfter = root.graph.getEntity(world.pumpPipeId);
    const forkPumpAfter = fork.graph.getEntity(world.pumpPipeId);
    expect(forkPumpAfter.domainState?.volumetricFlow).toBe(0);
    expect(rootPumpAfter.domainState?.volumetricFlow).toBeGreaterThan(0);
    expect(forkPumpAfter.domainState?.headLoss).not.toBe(rootPumpAfter.domainState?.headLoss);

    const forkHospital = fork.graph.getEntity(world.hospitalBuildingId);
    const rootHospital = root.graph.getEntity(world.hospitalBuildingId);
    expect(forkHospital.domainState?.waterServiceInterrupted).toBe(1);
    expect(rootHospital.domainState?.waterServiceInterrupted).toBeUndefined();
    expect(fork.journal.allEvents().some((e) => e.type === WATER_SERVICE_INTERRUPTED_EVENT_TYPE)).toBe(true);
    expect(root.journal.allEvents().some((e) => e.type === WATER_SERVICE_INTERRUPTED_EVENT_TYPE)).toBe(false);

    // 8. COMPARE: the existing C1 branch-comparison path sees the real divergence.
    const comparison = compareBranches(registry, root.branchId, fork.branchId, root.tick);
    const pumpDiff = comparison.entityDiffs.find((d) => d.id === world.pumpPipeId)!;
    expect(pumpDiff.equal).toBe(false);
    expect(pumpDiff.worldA?.domainState?.volumetricFlow).toBe(rootPumpAfter.domainState?.volumetricFlow);
    expect(pumpDiff.worldB?.domainState?.volumetricFlow).toBe(0);
    const hospitalDiff = comparison.entityDiffs.find((d) => d.id === world.hospitalBuildingId)!;
    expect(hospitalDiff.equal).toBe(false);

    // The ROOT's own ancestry before the fork point is untouched by anything done to the fork.
    expect(canonicalJson(root.scrubTo(forkTick).getEntity(world.pumpPipeId))).toBe(canonicalJson(pumpPipeBefore));

    // The FORK's own history at forkTick correctly includes the intervention applied at that same
    // tick (via `executeIntervention` -> `TemporalEngine.applyExternalPatch`, which records a real
    // delta) — replay stays consistent with the live graph, exactly like `forkBranch`'s own
    // `mutate` argument already bakes its declared divergence into the fork's keyframe. It would be
    // a real bug for `scrubTo` to show a DIFFERENT value here than the fork's actual state at this
    // tick ever showed.
    expect(canonicalJson(fork.scrubTo(forkTick).getEntity(world.pumpPipeId))).toBe(canonicalJson(forkPumpAtForkTick));
  });
});
