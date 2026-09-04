import { EventRegistry } from '../events/eventRegistry';
import { getScenarioTimelineByRunId } from '../experimentFabric/worldHandoff';
import { replaySavedHypothesisLoop, type HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';
import { buildWorldState, type ReplayState, type WorldEntity, type WorldState } from './scientificWorldState';

/**
 * EPIDEMIOLOGY WORLD ADAPTER — projects a real, already-executed
 * `HypothesisLoopResult` (from `executePreregisteredHypotheses` over a
 * `scenario-timeline` `HypothesisProblem`, e.g. `problem:lowest-modeled-deaths`)
 * into the generic `WorldState` contract.
 *
 * Adds no epidemic mechanics: the per-day series behind each real
 * `ExperimentRun` is read via `getScenarioTimelineByRunId` — the EXISTING
 * world-runtime handoff `runExperiment` already populates for every real
 * scenario-timeline run (`experimentFabric/worldHandoff.ts`), not a second
 * world-state store. One `WorldState` is projected per real run in
 * `loopResult.allRuns`, using that run's own FINAL day sample (a full
 * day-by-day timeline is not built here — the same generic contract is
 * satisfied with one state per real, distinct experiment arm, which is
 * enough to prove the cross-domain projection without duplicating the
 * Scenario Engine's own day-by-day series).
 */
export const EPIDEMIOLOGY_WORLD_ADAPTER_VERSION = '1.0.0';

const HOSPITAL_ENTITY = { kind: 'facility', id: 'hospital' } as const;
const POPULATION_ENTITY = { kind: 'population', id: 'city' } as const;

function entitiesFor(sample: import('../simulation/scenarioEngine').ScenarioDaySample): readonly WorldEntity[] {
  return [
    {
      ref: HOSPITAL_ENTITY, label: 'Hospital capacity ward',
      properties: [
        { key: 'occupiedBeds', value: sample.hospital.occupiedBeds },
        { key: 'occupiedIcu', value: sample.hospital.occupiedIcu },
        { key: 'unmetCare', value: sample.hospital.unmetCare },
        { key: 'bedOccupancy', value: sample.hospital.bedOccupancy, unit: 'fraction' },
        { key: 'icuOccupancy', value: sample.hospital.icuOccupancy, unit: 'fraction' },
        { key: 'status', value: sample.hospital.status },
      ],
    },
    {
      ref: POPULATION_ENTITY, label: 'City population',
      properties: [
        { key: 'susceptible', value: sample.susceptible }, { key: 'exposed', value: sample.exposed },
        { key: 'infectious', value: sample.infectious }, { key: 'recovered', value: sample.recovered },
        { key: 'deceased', value: sample.deceased }, { key: 'isolated', value: sample.isolated },
        { key: 'hospitalized', value: sample.hospitalized },
      ],
    },
  ];
}

function replayStateFor(loopResult: HypothesisLoopResult): ReplayState {
  if (!loopResult.preregistrationIntact.intact) return { status: 'BLOCKED', message: loopResult.preregistrationIntact.reason };
  const replay = replaySavedHypothesisLoop({
    contractVersion: loopResult.contractVersion,
    preregistrationId: loopResult.preregistration.preregistrationId,
    preregistrationFingerprint: loopResult.preregistration.preregistrationFingerprint,
    problem: loopResult.preregistration.set.problem,
    hypotheses: loopResult.preregistration.hypotheses,
    outcomes: loopResult.outcomes.map((o) => ({ hypothesisId: o.hypothesisId, status: o.status, observedMetric: o.observedMetric, baselineMetric: o.baselineMetric, evidencePackId: o.evidencePackId, evidenceChainId: o.evidenceChainId })),
    discrimination: { ranking: loopResult.discrimination.ranking, winnerHypothesisId: loopResult.discrimination.winnerHypothesisId, decisive: loopResult.discrimination.decisive },
    loopFingerprint: '',
  });
  return { status: replay.status, message: replay.reason };
}

/**
 * Projects a real, executed epidemiology `HypothesisLoopResult` into an
 * ordered `WorldState[]`, one per real run behind it that actually carried
 * a scenario timeline. Runs without a registered timeline (e.g. a
 * non-scenario-timeline model, or a run whose live world already expired
 * from the retained-worlds cache) are skipped, never backfilled with a
 * guess.
 */
export function projectEpidemiologyWorldStates(loopResult: HypothesisLoopResult): WorldState[] {
  const worldId = `epidemiology:${loopResult.preregistration.set.problem.problemId}`;
  const registry = new EventRegistry({ modelId: loopResult.preregistration.set.problem.modelId, experimentId: loopResult.preregistration.preregistrationId });
  const replay = replayStateFor(loopResult);
  let previousEventId: string | null = null;

  const states: WorldState[] = [];
  loopResult.allRuns.forEach((run, index) => {
    const timeline = getScenarioTimelineByRunId(run.runId);
    if (!timeline) return;
    const lastSample = timeline.series[timeline.series.length - 1];
    if (!lastSample) return;

    const event = registry.add({
      type: 'epidemiology.run.completed',
      timestamp: lastSample.day,
      affectedEntities: [{ ...HOSPITAL_ENTITY }, { ...POPULATION_ENTITY }],
      parameters: { scenarioId: timeline.scenarioId, scenarioLabel: timeline.scenarioLabel, totalDeaths: lastSample.deceased },
      parentEventId: previousEventId,
      experimentId: run.runId,
      provenance: { origin: 'model', modelId: 'scenario-timeline', experimentId: run.runId, seed: timeline.seed, notes: timeline.summary },
    });
    previousEventId = event.id;

    states.push(buildWorldState({
      worldId, domainId: 'EPIDEMIOLOGY', tick: index,
      entities: entitiesFor(lastSample),
      relations: [{ from: { ...POPULATION_ENTITY }, to: { ...HOSPITAL_ENTITY }, kind: 'admits-to' }],
      observations: [{
        observationId: `obs:${event.id}`, tick: index, statement: timeline.summary,
        measurements: [{ key: 'totalDeaths', value: lastSample.deceased, tick: index, entity: { ...POPULATION_ENTITY }, provenance: [event.id] }],
        provenance: [event.id],
      }],
      events: [event],
      experiment: { experimentId: run.runId, status: 'COMPLETED', runs: [run] },
      epistemic: loopResult,
      evidence: [],
      replay,
      notModeled: ['spatial-position (this projection reads only the day-level series, not agent-level state)'],
    }));
  });

  return states;
}
