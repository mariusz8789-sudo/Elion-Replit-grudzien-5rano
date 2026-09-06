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

/** Epidemic parameters an intervention may legitimately change at runtime (a real contact/infection-control lever, not a structural setting like total population). */
const OVERRIDABLE_PARAM_KEYS = ['r0', 'infectiousDays', 'incubationDays', 'ifr', 'interventionDay', 'interventionEffect'] as const;

/** Merges any per-entity overrides (set via `executeIntervention`, e.g. `{'domainState.r0': 1.0}` for a real contact-reduction intervention) onto this solver's base parameters. Absent overrides leave the base parameters untouched — no behavior change for entities that never intervened. */
function effectiveParams(base: EpidemicParams, state: Record<string, number> | undefined): EpidemicParams {
  if (!state) return base;
  let params = base;
  for (const key of OVERRIDABLE_PARAM_KEYS) {
    const override = state[key];
    if (override !== undefined && override !== base[key]) params = { ...params, [key]: override };
  }
  return params;
}

/** One reusable solver bound to base epidemic parameters (R0, infectious period, etc.) — each entity carries its own compartments AND any live intervention overrides in `domainState`. */
export function makeEpidemicSEIRSolver(baseParams: EpidemicParams): DomainSolver {
  return (entity, ctx): SolverResult => {
    const params = effectiveParams(baseParams, entity.domainState);
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
        { key: 'r0', value: params.r0, tick: ctx.tick, entity: entity.ref, provenance: ['core/epidemic/sir.ts#EpidemicParams.r0'] },
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
      parameters: { ...clipped, t: nextT, beta, r0: params.r0 },
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

export interface AddPopulationOptions extends EpidemicWorldOptions {
  parentEntityId?: EntityId;
  scale?: WorldModelEntity['scale']['level'];
  label?: string;
}

/** Adds a population entity bound to the real RK4 SEIR solver — composable: pass `parentEntityId` to nest it (e.g. under a hospital). */
export function addPopulation(graph: WorldGraph, options: AddPopulationOptions = {}): EntityId {
  const params = options.params ?? DEFAULT_EPIDEMIC;
  const ref = { kind: 'population', id: options.populationId ?? 'city-1' };
  const init = initialState(params);
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'City Population',
    scale: { level: options.scale ?? 'MACRO_CITY', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    domainState: { S: init.S, E: init.E, I: init.I, R: init.R, D: init.D, t: 0, beta: betaAt(params, 0) },
    domainBinding: { solverId: EPIDEMIC_SEIR_SOLVER_ID, domainId: EPIDEMIC_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export function buildEpidemicWorld(options: EpidemicWorldOptions = {}): EpidemicWorld {
  const params = options.params ?? DEFAULT_EPIDEMIC;
  const graph = new WorldGraph();
  const populationId = addPopulation(graph, options);
  return { graph, populationId, params };
}
