import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import { buildPumpPipeModel, PUMP_PIPE_DEFAULTS, type PumpPipeDefaults } from '../../engineeringGraph/pumpPipe';
import { provenanceRank, type Provenance } from '../../engineeringGraph/provenance';
import type { Measurement, Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type GroundingLevel, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * THIRD REAL SCIENTIFIC WORLD: hydraulics/engineering.
 *
 * Wraps the existing, real pump-pipe `EngineeringModel`
 * (core/engineeringGraph/pumpPipe.ts — Darcy-Weisbach head loss, Swamee-Jain
 * friction, hydraulic/shaft power; a genuinely executable `ModelGraph`, not
 * a re-typed formula). Unlike chemistry/epidemiology, this system is
 * STEADY-STATE: its equations give the instantaneous flow/power for
 * whatever parameters (flow rate, pipe geometry, pump efficiency) hold
 * right now — there is no ODE to integrate, so `dt` is irrelevant here and
 * a tick simply re-evaluates the real model against the entity's current
 * parameters. That is why grounding is computed dynamically per output
 * from the model's OWN provenance propagation
 * (`EngineeringModel.effectiveProvenance`), never hardcoded: some outputs
 * are exact given their inputs (flowVelocity, reynolds, totalHead,
 * hydraulicPower), one is a documented empirical correlation
 * (frictionFactor/headLoss), and pump efficiency is an engineering
 * estimate — the worst-ranked output in a step honestly sets that step's
 * overall grounding.
 */
export const HYDRAULICS_PUMP_PIPE_SOLVER_ID = 'hydraulics-pump-pipe-engineering-model';
export const HYDRAULICS_DOMAIN_ID = 'hydraulics-engineering';

const OUTPUT_NODES = ['flowVelocity', 'reynolds', 'frictionFactor', 'headLoss', 'totalHead', 'hydraulicPower', 'shaftPower'] as const;

/** Maps this domain's own Provenance rank (core/engineeringGraph/provenance.ts) onto C3's GroundingLevel — never a second, parallel honesty scale. */
function provenanceToGrounding(p: Provenance): GroundingLevel {
  switch (p) {
    case 'measured':
    case 'manufacturer':
    case 'user-provided':
    case 'calculated':
      return 'GROUNDED_EXACT';
    case 'empirical-model':
      return 'MODEL_ESTIMATE';
    case 'engineering-estimate':
      return 'PROCEDURAL_APPROXIMATION';
    case 'requires-validation':
      return 'UNGROUNDED_APPROXIMATION';
  }
}

let stepCounter = 0;

/**
 * One reusable solver bound to one real `EngineeringModel` instance. Every
 * entity's pump/pipe parameters (`domainState`) are written to the model
 * and its outputs read back synchronously within the same call — safe to
 * share since JS execution is single-threaded.
 */
export function makeHydraulicsPumpPipeSolver(): DomainSolver {
  const model = buildPumpPipeModel();

  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<Record<keyof PumpPipeDefaults, number>> | undefined;
    const params: PumpPipeDefaults = { ...PUMP_PIPE_DEFAULTS, ...state };

    model.setParameter('volumetricFlow', params.volumetricFlow);
    model.setParameter('pipeDiameter', params.pipeDiameter);
    model.setParameter('pipeLength', params.pipeLength);
    model.setParameter('pipeRoughness', params.pipeRoughnessMm);
    model.setParameter('staticLift', params.staticLift);
    model.setParameter('fluidDensity', params.fluidDensity);
    model.setParameter('fluidViscosity', params.fluidViscosity);
    model.setParameter('pumpEfficiency', params.pumpEfficiency);

    const outputs: Record<string, number> = {};
    const measurements: Measurement[] = [];
    let worstGrounding: GroundingLevel = 'GROUNDED_EXACT';
    let worstRank = Number.POSITIVE_INFINITY;

    for (const nodeId of OUTPUT_NODES) {
      const value = model.getValue(nodeId);
      outputs[nodeId] = value;
      const effective = model.effectiveProvenance(nodeId);
      const rank = provenanceRank(effective.provenance);
      if (rank < worstRank) {
        worstRank = rank;
        worstGrounding = provenanceToGrounding(effective.provenance);
      }
      measurements.push({
        key: nodeId,
        value,
        tick: ctx.tick,
        entity: entity.ref,
        provenance: [`core/engineeringGraph/pumpPipe.ts#${nodeId}`, `provenance:${effective.provenance}`],
      });
    }

    stepCounter += 1;
    const paramsHash = fnv1a(canonicalJson({ params, entityId: entity.id }));

    const observation: Observation = {
      observationId: `hyd-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: Q=${params.volumetricFlow.toFixed(4)}m³/s, headLoss=${outputs.headLoss.toFixed(2)}m, shaftPower=${outputs.shaftPower.toFixed(0)}W`,
      measurements,
      provenance: ['core/engineeringGraph/pumpPipe.ts', 'darcy-weisbach', 'swamee-jain'],
    };

    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: `hyd-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
      type: 'hydraulics.pumppipe.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'steady-state-recompute',
      parameters: { ...params, ...outputs },
      provenance: { origin: 'model', modelId: HYDRAULICS_PUMP_PIPE_SOLVER_ID, paramsHash },
    };

    return {
      patch: {
        domainState: { ...params, ...outputs },
        statusLabel: `Q=${params.volumetricFlow.toFixed(3)}m³/s, ${outputs.shaftPower.toFixed(0)}W shaft power`,
      },
      grounding: worstGrounding,
      observation,
      event,
    };
  };
}

export interface AddPumpPipeSystemOptions {
  systemId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<PumpPipeDefaults>;
}

/** Adds a pump/pipe system bound to the real hydraulics EngineeringModel — composable: pass `parentEntityId` to nest it (e.g. under a water system). */
export function addPumpPipeSystem(graph: WorldGraph, options: AddPumpPipeSystemOptions = {}): EntityId {
  const ref = { kind: 'pump-pipe-system', id: options.systemId ?? 'pump-pipe-1' };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Pump-Pipe System',
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: -1, y: 0, z: 0 } },
    domainState: { ...PUMP_PIPE_DEFAULTS, ...options.params },
    domainBinding: { solverId: HYDRAULICS_PUMP_PIPE_SOLVER_ID, domainId: HYDRAULICS_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface HydraulicsWorldOptions {
  waterSystemId?: string;
  params?: Partial<PumpPipeDefaults>;
}

export interface HydraulicsWorld {
  graph: WorldGraph;
  waterSystemId: EntityId;
  pumpPipeId: EntityId;
}

/** Standalone scenario: a water system (MESO_LAB) containing one pump-pipe system bound to the real hydraulics model. */
export function buildHydraulicsWorld(options: HydraulicsWorldOptions = {}): HydraulicsWorld {
  const graph = new WorldGraph();
  const waterSystemRef = { kind: 'water-system', id: options.waterSystemId ?? 'water-system-1' };
  const waterSystem: WorldModelEntity = {
    id: entityId(waterSystemRef),
    ref: waterSystemRef,
    label: 'Water System',
    scale: { level: 'MESO_LAB' },
    spatial: { position: { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION', // NOT_MODELLED: a container, not something any solver advances directly
    updatedAtTick: 0,
  };
  graph.addEntity(waterSystem);
  const pumpPipeId = addPumpPipeSystem(graph, { parentEntityId: waterSystem.id, params: options.params });
  return { graph, waterSystemId: waterSystem.id, pumpPipeId };
}
