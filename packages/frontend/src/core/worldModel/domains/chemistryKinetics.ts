import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import {
  BASELINE_EA_KJ,
  BASELINE_LOG10_A,
  BASELINE_TEMPERATURE_K,
  buildChemistryKineticsGraph,
} from '../../modelGraph/chemistryKineticsGraph';
import type { Observation } from '../../world/scientificWorldState';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * FIRST REAL SCIENTIFIC WORLD: molecular/chemistry.
 *
 * Wraps the existing, real Arrhenius kinetics model
 * (core/modelGraph/chemistryKineticsGraph.ts — a genuinely executable
 * `ModelGraph`, not a formula re-typed here) to advance a substance
 * entity's molecular state under temperature. C3 contributes only the time
 * integration: given the model's own rate constant k(T), the fraction of
 * substance remaining after `dt` seconds of first-order decay is the exact
 * analytic solution C(t+dt) = C(t)·exp(−k·dt) — the ODE step is exact, but
 * k itself comes from a documented approximate model (`rateConstant` node
 * honesty: 'simplified' in chemistryKineticsGraph.ts), so the whole result
 * is disclosed as `MODEL_ESTIMATE`, never `GROUNDED_EXACT`.
 */
export const CHEMISTRY_KINETICS_SOLVER_ID = 'chemistry-kinetics-arrhenius';
export const CHEMISTRY_KINETICS_DOMAIN_ID = 'chemistry-kinetics';

/**
 * Demo-substance kinetics parameters (not measured data for any real
 * compound — a deliberately chosen illustration, consistent with this
 * solver's `MODEL_ESTIMATE` disclosure). The shared model's own baseline
 * (`BASELINE_EA_KJ`/`BASELINE_LOG10_A`, tuned around 350K) decays far too
 * fast to observe over a temperature range of hundreds of kelvin and a
 * 24-hour window — at 800K it underflows to zero within the first tick.
 * These values keep the same real Arrhenius equation but pick an
 * activation energy/pre-exponential pair that actually shows a 24-hour,
 * 700-800K decay trajectory instead of instant annihilation.
 */
export const DEMO_ACTIVATION_ENERGY_KJ = 120;
export const DEMO_PRE_EXPONENTIAL_LOG10 = 4;

/** Purely descriptive bucketing of a real, solver-computed number — never a second measurement. */
export function describeMolecularState(concentrationFraction: number): string {
  if (concentrationFraction >= 0.95) return 'largely intact';
  if (concentrationFraction >= 0.5) return 'partially reacted';
  if (concentrationFraction >= 0.05) return 'mostly decomposed';
  return 'fully decomposed';
}


/**
 * Builds one reusable solver instance backed by one real `ModelGraph`. Every
 * entity's temperature (and optional per-substance kinetics overrides) are
 * written to the graph and read back synchronously within the same call —
 * safe to share across many entities/ticks since JS execution is
 * single-threaded and no other code touches this graph between the write
 * and the read.
 */
export function makeChemistryKineticsSolver(): DomainSolver {
  const graph = buildChemistryKineticsGraph();

  return (entity, ctx): SolverResult => {
    const temperatureK = entity.physics?.temperatureK ?? BASELINE_TEMPERATURE_K;
    const activationEnergyKJ = entity.chemical?.activationEnergyKJ ?? BASELINE_EA_KJ;
    const preExponentialLog10 = entity.chemical?.preExponentialLog10 ?? BASELINE_LOG10_A;
    graph.setParameter('temperatureK', temperatureK);
    graph.setParameter('activationEnergyKJ', activationEnergyKJ);
    graph.setParameter('preExponentialLog10', preExponentialLog10);

    const rateConstantPerS = graph.getValue('rateConstant');
    const halfLifeSeconds = graph.getValue('halfLifeFirstOrder');
    const speedupVsRoom = graph.getValue('speedupVsRoom');

    const previousFraction = entity.chemical?.concentrationFraction ?? 1;
    // Exact analytic solution of dC/dt = -k*C over [t, t+dt] for a constant k.
    const nextFraction = previousFraction * Math.exp(-rateConstantPerS * ctx.dt);
    const stateLabel = describeMolecularState(nextFraction);

    const paramsHash = fnv1a(canonicalJson({ temperatureK, activationEnergyKJ, preExponentialLog10, dt: ctx.dt, entityId: entity.id }));

    const observation: Observation = {
      observationId: `chem-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: T=${temperatureK.toFixed(1)}K, k=${rateConstantPerS.toExponential(3)}/s, ${(nextFraction * 100).toFixed(2)}% remaining (${stateLabel})`,
      measurements: [
        { key: 'temperatureK', value: temperatureK, unit: 'K', tick: ctx.tick, entity: entity.ref, provenance: ['core/modelGraph/chemistryKineticsGraph.ts#temperatureK'] },
        { key: 'rateConstant', value: rateConstantPerS, unit: '1/s', tick: ctx.tick, entity: entity.ref, provenance: ['core/modelGraph/chemistryKineticsGraph.ts#rateConstant', 'arrhenius-equation'] },
        { key: 'halfLifeFirstOrder', value: halfLifeSeconds, unit: 's', tick: ctx.tick, entity: entity.ref, provenance: ['core/modelGraph/chemistryKineticsGraph.ts#halfLifeFirstOrder'] },
        { key: 'speedupVsRoom', value: speedupVsRoom, unit: '×', tick: ctx.tick, entity: entity.ref, provenance: ['core/modelGraph/chemistryKineticsGraph.ts#speedupVsRoom'] },
        { key: 'concentrationFraction', value: nextFraction, tick: ctx.tick, entity: entity.ref, provenance: ['first-order-decay-analytic-integration'] },
      ],
      provenance: ['core/modelGraph/chemistryKineticsGraph.ts', 'arrhenius-equation'],
    };

    const eventParameters = { temperatureK, rateConstantPerS, concentrationFraction: nextFraction, dt: ctx.dt };
    const event: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('chem-evt', entity.id, ctx.tick, eventParameters),
      type: 'chemistry.kinetics.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'arrhenius-first-order-decay',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: CHEMISTRY_KINETICS_SOLVER_ID, paramsHash },
    };

    return {
      patch: {
        chemical: { ...entity.chemical, concentrationFraction: nextFraction },
        statusLabel: `${stateLabel} (${(nextFraction * 100).toFixed(1)}%)`,
      },
      grounding: 'MODEL_ESTIMATE',
      observation,
      event,
    };
  };
}

export interface ChemistryExperimentOptions {
  labId?: string;
  substanceId?: string;
  substanceLabel?: string;
  formula?: string;
  initialTemperatureK?: number;
  activationEnergyKJ?: number;
  preExponentialLog10?: number;
}

export interface ChemistryExperimentWorld {
  graph: WorldGraph;
  labId: EntityId;
  substanceId: EntityId;
}

export interface AddChemistryLabOptions {
  labId?: string;
  label?: string;
  parentEntityId?: EntityId;
  position?: { x: number; y: number; z: number };
}

/** Adds a lab container (MESO_LAB) to an existing graph — a pure container, not something any solver advances directly. Composable: pass `parentEntityId` to nest it (e.g. under a city). */
export function addChemistryLab(graph: WorldGraph, options: AddChemistryLabOptions = {}): EntityId {
  const labRef = { kind: 'lab', id: options.labId ?? 'lab-1' };
  const lab: WorldModelEntity = {
    id: entityId(labRef),
    ref: labRef,
    label: options.label ?? 'Chemistry Lab',
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: options.position ?? { x: 0, y: 0, z: 0 } },
    grounding: 'UNGROUNDED_APPROXIMATION', // NOT_MODELLED: a container, not something any solver advances directly
    updatedAtTick: 0,
  };
  graph.addEntity(lab);
  return lab.id;
}

/** Adds a substance (MICRO_MOLECULAR) bound to the real Arrhenius solver as a child of `parentLabId`. */
export function addChemistrySubstance(graph: WorldGraph, parentLabId: EntityId, options: ChemistryExperimentOptions = {}): EntityId {
  const substanceRef = { kind: 'substance', id: options.substanceId ?? 'substance-1' };
  const substance: WorldModelEntity = {
    id: entityId(substanceRef),
    ref: substanceRef,
    label: options.substanceLabel ?? 'Substance',
    scale: { level: 'MICRO_MOLECULAR', parentEntityId: parentLabId },
    spatial: { position: { x: 1, y: 0, z: 0 } },
    physics: { massKg: 1, temperatureK: options.initialTemperatureK ?? BASELINE_TEMPERATURE_K },
    chemical: {
      formula: options.formula,
      concentrationFraction: 1,
      activationEnergyKJ: options.activationEnergyKJ ?? DEMO_ACTIVATION_ENERGY_KJ,
      preExponentialLog10: options.preExponentialLog10 ?? DEMO_PRE_EXPONENTIAL_LOG10,
    },
    domainBinding: { solverId: CHEMISTRY_KINETICS_SOLVER_ID, domainId: CHEMISTRY_KINETICS_DOMAIN_ID },
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(substance);
  return substance.id;
}

/**
 * The first real vertical-slice scenario: a lab (MESO_LAB) containing one
 * substance (MICRO_MOLECULAR) bound to the Arrhenius kinetics solver. Both
 * entities live in the same `WorldGraph` — zooming from lab to substance is
 * a `listChildren`/`zoomInto` read of this one world, never a second
 * simulation.
 */
export function buildChemistryExperimentWorld(options: ChemistryExperimentOptions = {}): ChemistryExperimentWorld {
  const graph = new WorldGraph();
  const labId = addChemistryLab(graph, { labId: options.labId });
  const substanceId = addChemistrySubstance(graph, labId, options);
  return { graph, labId, substanceId };
}
