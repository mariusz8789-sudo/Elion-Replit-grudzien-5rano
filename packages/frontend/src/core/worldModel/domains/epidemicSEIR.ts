import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import { DEFAULT_EPIDEMIC, betaAt, initialState, rk4Step, type Compartments, type EpidemicParams } from '../../epidemic/sir';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * SECOND REAL SCIENTIFIC WORLD: epidemiology.
 *
 * Wraps the existing, real SEIR/SIR compartmental engine
 * (core/epidemic/sir.ts) — an RK4-integrated ODE system, not a re-typed
 * formula. C3 contributes only per-tick invocation and evidence recording;
 * `rk4Step` itself is untouched, so this solver's trajectory is bit-for-bit
 * the same computation `simulateEpidemic` already runs elsewhere in Genesis.
 * Disclosed as `MODEL_ESTIMATE`: the RK4 integration is exact for the given
 * ODE system, but the compartmental model itself (homogeneous mixing,
 * abstract "Pathogen X") is a real, deliberate simplification of an actual
 * epidemic.
 */
export const EPIDEMIC_SEIR_SOLVER_ID = 'epidemic-seir-rk4';
export const EPIDEMIC_DOMAIN_ID = 'epidemiology';

let stepCounter = 0;

function compartmentsFromState(state: Record<string, number> | undefined, fallback: Compartments): Compartments {
  return {
    S: state?.S ?? fallback.S,
    E: state?.E ?? fallback.E,
    I: state?.I ?? fallback.I,
    R: state?.R ?? fallback.R,
    D: state?.D ?? fallback.D,
  };
}

/** One reusable solver bound to fixed epidemic parameters (R0, infectious period, etc.) — each entity carries its own compartments in `domainState`. */
export function makeEpidemicSEIRSolver(params: EpidemicParams): DomainSolver {
  return (entity, ctx): SolverResult => {
    const t = entity.domainState?.t ?? 0;
    const compartments = compartmentsFromState(entity.domainState, initialState(params));
    const dtDays = ctx.dt;

    const stepped = rk4Step(compartments, params, t, dtDays);
    const clipped: Compartments = {
      S: Math.max(0, stepped.S),
      E: Math.max(0, stepped.E),
      I: Math.max(0, stepped.I),
      R: Math.max(0, stepped.R),
      D: Math.max(0, stepped.D),
    };
    const nextT = t + dtDays;
    const beta = betaAt(params, nextT);

    stepCounter += 1;
    const paramsHash = fnv1a(canonicalJson({ params, t, dtDays, entityId: entity.id }));

    const observation: Observation = {
      observationId: `epi-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: day ${nextT.toFixed(2)}, S=${clipped.S.toFixed(0)} E=${clipped.E.toFixed(0)} I=${clipped.I.toFixed(0)} R=${clipped.R.toFixed(0)} D=${clipped.D.toFixed(0)}`,
      measurements: [
        { key: 'susceptible', value: clipped.S, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#rk4Step'] },
        { key: 'exposed', value: clipped.E, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#rk4Step'] },
        { key: 'infected', value: clipped.I, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#rk4Step'] },
        { key: 'recovered', value: clipped.R, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#rk4Step'] },
        { key: 'dead', value: clipped.D, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#rk4Step'] },
        { key: 'beta', value: beta, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#betaAt'] },
      ],
      provenance: ['core/epidemic/sir.ts', `model:${params.model}`],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `epi-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'epidemiology.seir.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'rk4-integration',
      parameters: { ...clipped, t: nextT, beta },
      provenance: { origin: 'model', modelId: EPIDEMIC_SEIR_SOLVER_ID, paramsHash },
    };

    return {
      patch: {
        domainState: { ...clipped, t: nextT, beta },
        statusLabel: `I=${clipped.I.toFixed(0)} R=${clipped.R.toFixed(0)} D=${clipped.D.toFixed(0)} (day ${nextT.toFixed(1)})`,
      },
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export interface EpidemicWorldOptions {
  populationId?: string;
  params?: EpidemicParams;
}

export interface EpidemicWorld {
  graph: WorldGraph;
  populationId: EntityId;
  params: EpidemicParams;
}

export function buildEpidemicWorld(options: EpidemicWorldOptions = {}): EpidemicWorld {
  const params = options.params ?? DEFAULT_EPIDEMIC;
  const graph = new WorldGraph();
  const ref = { kind: 'population', id: options.populationId ?? 'city-1' };
  const init = initialState(params);
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: 'City Population',
    scale: { level: 'MACRO_CITY' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: { S: init.S, E: init.E, I: init.I, R: init.R, D: init.D, t: 0, beta: betaAt(params, 0) },
    domainBinding: { solverId: EPIDEMIC_SEIR_SOLVER_ID, domainId: EPIDEMIC_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return { graph, populationId: entity.id, params };
}
