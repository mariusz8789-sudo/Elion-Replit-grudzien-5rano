import { EventRegistry } from '../events/eventRegistry';
import type { DivergenceSweepResult } from '../experimentFabric/modelVsModelCompare';
import { buildWorldState, type WorldState } from './scientificWorldState';

/**
 * PARTICLE PHYSICS WORLD ADAPTER — the SECOND domain for the cross-domain
 * proof this generic `WorldState` contract needs (Phase D). Projects a
 * real, already-executed `DivergenceSweepResult` (Newtonian vs
 * relativistic kinetic energy, `modelVsModelCompare.ts`, unchanged) into
 * the SAME contract the epidemiology adapter uses. No physics is
 * recomputed here — every number is read from the real `ExperimentRun`s
 * already inside each sweep point's comparison.
 */
export const PARTICLE_WORLD_ADAPTER_VERSION = '1.0.0';

const PARTICLE_ENTITY = { kind: 'particle', id: 'test-particle' } as const;

export function projectParticleDivergenceWorldStates(sweep: DivergenceSweepResult): WorldState[] {
  const worldId = `particle:${sweep.sweepParameter}:${sweep.observableKey}`;
  const registry = new EventRegistry({ modelId: 'particle-model-vs-model-tournament' });
  let previousEventId: string | null = null;

  const states: WorldState[] = [];
  sweep.points.forEach((point, index) => {
    const { comparison } = point;
    if (comparison.status !== 'COMPLETED' || !comparison.metric || !comparison.runA || !comparison.runB) {
      states.push(buildWorldState({
        worldId, domainId: 'PHYSICS', tick: index,
        entities: [{ ref: PARTICLE_ENTITY, label: 'Test particle', properties: [{ key: sweep.sweepParameter, value: point.parameterValue }] }],
        relations: [], observations: [], events: [], epistemic: null, evidence: [], replay: null,
        experiment: { experimentId: `sweep:${index}`, status: comparison.status === 'BLOCKED_INVALID_REQUEST' ? 'BLOCKED' : 'NOT_MODELED', runs: [], notModeledReason: comparison.disclaimer },
        notModeled: ['model tournament did not complete at this sweep point — see experiment.notModeledReason'],
      }));
      return;
    }

    const event = registry.add({
      type: 'physics.tournament.compared',
      timestamp: point.parameterValue,
      affectedEntities: [{ ...PARTICLE_ENTITY }],
      parameters: {
        [sweep.sweepParameter]: point.parameterValue,
        modelAValue: comparison.metric.modelAValue, modelBValue: comparison.metric.modelBValue,
        relativeDivergence: comparison.metric.relativeDivergence,
      },
      parentEventId: previousEventId,
      experimentId: comparison.runB.runId,
      provenance: { origin: 'model', modelId: comparison.modelB?.modelId, experimentId: comparison.runB.runId, notes: comparison.disclaimer },
    });
    previousEventId = event.id;

    states.push(buildWorldState({
      worldId, domainId: 'PHYSICS', tick: index,
      entities: [{
        ref: PARTICLE_ENTITY, label: 'Test particle',
        properties: [
          { key: sweep.sweepParameter, value: point.parameterValue },
          { key: `${sweep.observableKey}_modelA`, value: comparison.metric.modelAValue, unit: comparison.metric.unit },
          { key: `${sweep.observableKey}_modelB`, value: comparison.metric.modelBValue, unit: comparison.metric.unit },
          { key: 'relativeDivergence', value: comparison.metric.relativeDivergence },
        ],
      }],
      relations: [{ from: comparison.modelA ? { kind: 'model', id: comparison.modelA.modelId } : PARTICLE_ENTITY, to: comparison.modelB ? { kind: 'model', id: comparison.modelB.modelId } : PARTICLE_ENTITY, kind: 'diverges-from' }],
      observations: [{
        observationId: `obs:${event.id}`, tick: index,
        statement: `At ${sweep.sweepParameter}=${point.parameterValue}: ${comparison.labels.modelA}=${comparison.metric.modelAValue} vs ${comparison.labels.modelB}=${comparison.metric.modelBValue} (relative divergence ${comparison.metric.relativeDivergence.toFixed(4)}).`,
        measurements: [
          { key: `${sweep.observableKey}_modelA`, value: comparison.metric.modelAValue, unit: comparison.metric.unit, tick: index, entity: { ...PARTICLE_ENTITY }, provenance: [event.id] },
          { key: `${sweep.observableKey}_modelB`, value: comparison.metric.modelBValue, unit: comparison.metric.unit, tick: index, entity: { ...PARTICLE_ENTITY }, provenance: [event.id] },
        ],
        provenance: [event.id],
      }],
      events: [event],
      experiment: { experimentId: `sweep:${index}`, status: 'COMPLETED', runs: [comparison.runA, comparison.runB] },
      epistemic: null,
      evidence: [],
      replay: null,
      notModeled: ['epistemic (this is a direct real model-vs-model comparison, not a preregistered hypothesis loop)'],
    }));
  });

  return states;
}
