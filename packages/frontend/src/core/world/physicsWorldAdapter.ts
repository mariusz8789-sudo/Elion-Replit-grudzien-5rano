import { EventRegistry } from '../events/eventRegistry';
import {
  replayTimeDilationEpistemicDemo,
  runTimeDilationEpistemicDemo,
  type TimeDilationEpistemicRunResult,
} from '../discovery/physics/epistemicTimeDilationDemo';
import { buildWorldState, type WorldState } from './scientificWorldState';

/**
 * PHYSICS WORLD ADAPTER — projects the existing, unchanged physics epistemic
 * demo (`epistemicTimeDilationDemo.ts`: real GPS clock-rate derivation +
 * real hypothesis resolution) into the SAME generic `WorldState` contract
 * the epidemiology adapter uses. No physics is recomputed here; this file
 * only wraps an already-real result and its already-real status changes as
 * `GenesisEvent`s.
 *
 * This is the cross-domain proof required by the mission: one
 * `WorldState`/`WorldEntity`/`ScientificEvent` contract, TWO unrelated real
 * scientific executors (epidemiology's hospital-capacity model here vs.
 * physics's GPS relativistic time dilation), zero duplicated per-domain
 * world-state types.
 */
export const PHYSICS_WORLD_ADAPTER_VERSION = '1.0.0';

const GROUND_CLOCK = { kind: 'clock', id: 'ground-reference' } as const;
const SATELLITE_CLOCK = { kind: 'clock', id: 'gps-satellite' } as const;

/**
 * Projects one real `TimeDilationEpistemicRunResult` (before/after graph +
 * the real `StatusUpdate`s applied to it) into TWO `WorldState`s: the world
 * BEFORE the composition test runs (all hypotheses UNRESOLVED) and AFTER
 * (real verdicts applied) — a real, minimal "before -> real experiment ->
 * after" world timeline, exactly like the epidemiology adapter's tick
 * series, just with two states instead of many because this case computes
 * its whole result in one step rather than day-by-day.
 */
export function projectPhysicsWorldStates(run: TimeDilationEpistemicRunResult = runTimeDilationEpistemicDemo()): WorldState[] {
  const worldId = 'physics:gps-time-dilation';
  const registry = new EventRegistry({ modelId: 'physics-relativistic-time-dilation', experimentId: 'gps-composition-test' });
  const inputFingerprint = run.before.fingerprint;
  const resultFingerprint = run.after.fingerprint;

  const beforeState = buildWorldState({
    worldId,
    domainId: 'PHYSICS',
    tick: 0,
    entities: [
      { ref: GROUND_CLOCK, label: 'Ground reference clock', properties: [] },
      { ref: SATELLITE_CLOCK, label: 'GPS orbital satellite clock', properties: [] },
    ],
    relations: [{ from: SATELLITE_CLOCK, to: GROUND_CLOCK, kind: 'clock-rate-compared-to' }],
    observations: [],
    events: [],
    experiment: { experimentId: 'gps-composition-test', status: 'RUNNING', inputFingerprint, resultFingerprint: null },
    epistemic: run.before,
    evidence: [],
    replay: null,
    notModeled: ['spatial-position (this case has no coordinate model — clocks are compared by rate only, not location)'],
  });

  let previousEventId: string | null = null;
  const changeEvents = run.changes.map((change) => {
    const event = registry.add({
      type: 'physics.epistemic',
      timestamp: 1,
      affectedEntities: [{ kind: 'hypothesis', id: change.nodeId }],
      parameters: { nodeId: change.nodeId, previousStatus: change.previousStatus, newStatus: change.newStatus, reason: change.reason },
      parentEventId: previousEventId,
      provenance: { origin: 'model', modelId: 'physics-relativistic-time-dilation', experimentId: 'gps-composition-test', notes: change.reason },
    });
    previousEventId = event.id;
    return event;
  });

  const replay = replayTimeDilationEpistemicDemo(run);

  const afterState = buildWorldState({
    worldId,
    domainId: 'PHYSICS',
    tick: 1,
    entities: beforeState.entities,
    relations: beforeState.relations,
    observations: run.changes.map((change, i) => ({
      observationId: `obs:${changeEvents[i]!.id}`,
      tick: 1,
      statement: change.reason,
      measurements: [],
      provenance: [changeEvents[i]!.id],
    })),
    events: changeEvents,
    experiment: { experimentId: 'gps-composition-test', status: 'COMPLETED', inputFingerprint, resultFingerprint },
    epistemic: run.after,
    evidence: [],
    replay: { status: replay.status === 'MATCH' ? 'MATCH' : 'DRIFT', message: replay.reason },
    notModeled: ['spatial-position (this case has no coordinate model — clocks are compared by rate only, not location)'],
  });

  return [beforeState, afterState];
}
