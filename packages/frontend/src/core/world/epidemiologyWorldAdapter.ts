import { EventRegistry } from '../events/eventRegistry';
import type { ScenarioRun } from '../simulation/scenarioEngine';
import { replayScenario } from '../simulation/scenarioEngine';
import { applyCapacityVerdict, buildInitialCapacityHypothesisGraph } from '../virtualLab/hypothesisFraming';
import { deriveObservationEventsFromScenarioRun, type ObservationEvent } from '../virtualLab/observationEvent';
import {
  buildWorldState, type EpistemicState, type ExperimentStatus, type ReplayState, type WorldEntity, type WorldState,
} from './scientificWorldState';

/**
 * EPIDEMIOLOGY WORLD ADAPTER — projects a real, already-computed
 * `ScenarioRun` (Scenario Engine, unchanged) into the generic
 * `WorldState` contract. Adds no epidemic mechanics of its own: every
 * number here is read from `run.series` / `run.summary`; every event is
 * the EXISTING `ObservationEvent` derivation (`virtualLab/observationEvent.ts`),
 * wrapped as a real `GenesisEvent` via the existing `EventRegistry` — not a
 * second event system.
 *
 * Epistemic resolution happens exactly where the existing Virtual Lab
 * session resolves it: once, from the completed run
 * (`hypothesisFraming.applyCapacityVerdict`) — never guessed mid-run. Every
 * state before the final one honestly carries the still-UNRESOLVED initial
 * graph, because that is what the real hypothesis-framing model has decided
 * at that point in the experiment.
 */
export const EPIDEMIOLOGY_WORLD_ADAPTER_VERSION = '1.0.0';

const HOSPITAL_ENTITY = { kind: 'facility', id: 'hospital' } as const;
const POPULATION_ENTITY = { kind: 'population', id: 'city' } as const;

function experimentStatusOf(run: ScenarioRun): ExperimentStatus {
  return run.status === 'NOT_MODELED' ? 'NOT_MODELED' : 'COMPLETED';
}

function entitiesAtTick(run: ScenarioRun, tick: number): readonly WorldEntity[] {
  const sample = run.series.find((s) => s.day === tick) ?? run.series[run.series.length - 1];
  if (!sample) return [];
  return [
    {
      ref: HOSPITAL_ENTITY,
      label: 'Hospital capacity ward',
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
      ref: POPULATION_ENTITY,
      label: 'City population',
      properties: [
        { key: 'susceptible', value: sample.susceptible },
        { key: 'exposed', value: sample.exposed },
        { key: 'infectious', value: sample.infectious },
        { key: 'recovered', value: sample.recovered },
        { key: 'deceased', value: sample.deceased },
        { key: 'isolated', value: sample.isolated },
        { key: 'hospitalized', value: sample.hospitalized },
      ],
    },
  ];
}

function replayStateOf(run: ScenarioRun): ReplayState {
  if (run.status === 'NOT_MODELED') return { status: 'NOT_COMPARABLE', message: 'Scenario is NOT_MODELED — nothing to replay.' };
  const replay = replayScenario(run);
  return { status: replay.status, message: replay.message };
}

/**
 * Projects a real `ScenarioRun` into an ordered `WorldState[]`, one per real
 * `ObservationEvent` the run actually produced (never one per raw tick —
 * a world state exists here because something scientifically real happened,
 * not because time advanced). The world's epistemic layer resolves only at
 * the final (EXPERIMENT_COMPLETE) state, matching when the real hypothesis
 * verdict is actually decided.
 */
export function projectEpidemiologyWorldStates(run: ScenarioRun): WorldState[] {
  const worldId = `epidemiology:${run.scenarioId}`;
  if (run.status === 'NOT_MODELED') {
    return [
      buildWorldState({
        worldId,
        domainId: 'EPIDEMIOLOGY',
        tick: 0,
        entities: [],
        relations: [],
        observations: [],
        events: [],
        experiment: { experimentId: run.scenarioId, status: 'NOT_MODELED', inputFingerprint: run.inputFingerprint, resultFingerprint: null, notModeledReason: run.notModeledReason },
        epistemic: null,
        evidence: [],
        replay: { status: 'NOT_COMPARABLE', message: 'Scenario is NOT_MODELED — nothing to replay.' },
        notModeled: [run.notModeledReason ?? 'scenario not modeled'],
      }),
    ];
  }

  const events: readonly ObservationEvent[] = deriveObservationEventsFromScenarioRun(run);
  const registry = new EventRegistry({ modelId: 'epidemiology-hospital-capacity', experimentId: run.scenarioId, seed: run.params.seed });
  const initialGraph = buildInitialCapacityHypothesisGraph(run.label);
  const finalized = applyCapacityVerdict(initialGraph, run);
  const replay = replayStateOf(run);
  const experiment: WorldState['experiment'] = {
    experimentId: run.scenarioId, status: experimentStatusOf(run), inputFingerprint: run.inputFingerprint, resultFingerprint: run.resultFingerprint,
  };

  let previousEventId: string | null = null;
  const states: WorldState[] = [];
  events.forEach((obs, index) => {
    const isLast = index === events.length - 1;
    const genesisEvent = registry.add({
      type: 'epidemiology.observation',
      timestamp: obs.tick,
      affectedEntities: [{ ...HOSPITAL_ENTITY }],
      severity: obs.importance === 'CRITICAL' ? 1 : obs.importance === 'HIGH' ? 0.75 : obs.importance === 'MEDIUM' ? 0.5 : 0.25,
      parameters: { observationType: obs.type, ...obs.data },
      parentEventId: previousEventId,
      provenance: { origin: 'model', modelId: 'epidemiology-hospital-capacity', experimentId: run.scenarioId, seed: run.params.seed, notes: obs.statement },
    });
    previousEventId = genesisEvent.id;

    const epistemic: EpistemicState = isLast ? finalized.graph : initialGraph;
    states.push(buildWorldState({
      worldId,
      domainId: 'EPIDEMIOLOGY',
      tick: obs.tick,
      entities: entitiesAtTick(run, obs.tick),
      relations: [{ from: { ...POPULATION_ENTITY }, to: { ...HOSPITAL_ENTITY }, kind: 'admits-to' }],
      observations: [{
        observationId: `obs:${genesisEvent.id}`,
        tick: obs.tick,
        statement: obs.statement,
        measurements: Object.entries(obs.data)
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
          .map(([key, value]) => ({ key, value, tick: obs.tick, entity: { ...HOSPITAL_ENTITY }, provenance: [genesisEvent.id] })),
        provenance: [genesisEvent.id],
      }],
      events: [genesisEvent],
      experiment,
      epistemic,
      evidence: [],
      replay: isLast ? replay : null,
      notModeled: ['evidence-references (not wired for this vertical slice)'],
    }));
  });

  return states;
}
