import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';
import { applyInterventionWithEvent } from '../events/worldEventRules';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';
import type { TemporalEngine } from '../temporal/temporalEngine';

/**
 * FOURTH REAL SCIENTIFIC WORLD: electrical/mechanical backup power.
 *
 * A real, physically-grounded (if simplified) backup diesel generator
 * model — a genuine state machine with a load curve, fuel consumption, and
 * a startup delay, not a flavor label on an intervention. Priority 2.4
 * (Genesis Scientific World Model 4.0): the generator is a real
 * INTERVENTION OPTION for a tripped pump — starting it, waiting out its
 * startup delay, and having it reach `RUNNING` with sufficient rated power
 * is what a cross-domain coupling (see `genesisScientificCity4.ts`) uses
 * to restore the pump's power, exactly the same cascade/coupling
 * mechanism the rainfall scenario already uses, never a special case.
 *
 * FUEL BURN MODEL: `fuelRateLPerHr = loadKw * specificFuelConsumptionLPerKwh`
 * — the standard, textbook linear diesel-genset fuel model. The specific
 * fuel consumption figure itself (`GENERATOR_DEFAULTS.specificFuelConsumptionLPerKwh`)
 * is a REPRESENTATIVE published figure for a mid-size diesel genset at
 * rated load (typically ~0.30-0.35 L/kWh), not a measurement of any real,
 * named unit — hence `PROCEDURAL_APPROXIMATION`, the same honesty tier
 * `hydraulicsPumpPipe.ts` already uses for its own engineering-estimate
 * outputs, never `GROUNDED_EXACT`.
 */
export const ELECTRICAL_GENERATOR_SOLVER_ID = 'electrical-backup-generator-model';
export const ELECTRICAL_DOMAIN_ID = 'electrical-engineering';

export const GENERATOR_STARTCOMMAND_EVENT_TYPE = 'electrical.generator.startcommand';
export const GENERATOR_STATUS_CHANGED_EVENT_TYPE = 'electrical.generator.statuschanged';

/** Numeric only — `domainState` is `Record<string, number>` (see ecs/types.ts); the human-readable form always lives in `statusLabel`, same convention as every other domain here. */
export const GENERATOR_STATUS = { OFF: 0, STARTING: 1, RUNNING: 2, FUEL_EXHAUSTED: 3 } as const;
export type GeneratorStatus = (typeof GENERATOR_STATUS)[keyof typeof GENERATOR_STATUS];

function generatorStatusLabel(status: number): string {
  switch (status) {
    case GENERATOR_STATUS.OFF: return 'off';
    case GENERATOR_STATUS.STARTING: return 'starting';
    case GENERATOR_STATUS.RUNNING: return 'running';
    case GENERATOR_STATUS.FUEL_EXHAUSTED: return 'fuel exhausted';
    default: return 'unknown';
  }
}

export interface GeneratorDefaults {
  ratedPowerKw: number;
  specificFuelConsumptionLPerKwh: number;
  fuelCapacityL: number;
  startupDelayS: number;
  status: number;
  secondsRemaining: number;
  fuelRemainingL: number;
  loadKw: number;
  cumulativeRuntimeS: number;
}

/** A representative mid-size diesel backup generator — see the module doc for the fuel-model honesty caveat. */
export const GENERATOR_DEFAULTS: GeneratorDefaults = {
  ratedPowerKw: 50,
  specificFuelConsumptionLPerKwh: 0.32,
  fuelCapacityL: 200,
  startupDelayS: 10,
  status: GENERATOR_STATUS.OFF,
  secondsRemaining: 0,
  fuelRemainingL: 200,
  loadKw: 0,
  cumulativeRuntimeS: 0,
};


/**
 * ONE STRUCTURE, PARAMETERIZED BY ITS FUEL-BURN FORMULA — so a genuine
 * structural alternative (a different equation for `fuelBurnedL`, not just a
 * different parameter value) is a second call to this factory, never a
 * hand-copied second state machine that could silently drift from the first.
 * Everything except the burn formula and its identity/label is shared: the
 * same STARTING/RUNNING/FUEL_EXHAUSTED transitions, the same event shapes.
 */
function makeGeneratorSolverWithFuelModel(
  solverId: string,
  fuelModelLabel: string,
  fuelBurnedLThisTick: (loadKw: number, params: GeneratorDefaults, dt: number) => number,
): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<GeneratorDefaults> | undefined;
    const params: GeneratorDefaults = { ...GENERATOR_DEFAULTS, ...state };
    const previousStatus = params.status;
    let { status, secondsRemaining, fuelRemainingL, loadKw, cumulativeRuntimeS } = params;

    if (status === GENERATOR_STATUS.STARTING) {
      secondsRemaining = Math.max(0, secondsRemaining - ctx.dt);
      if (secondsRemaining <= 0) {
        status = fuelRemainingL > 0 ? GENERATOR_STATUS.RUNNING : GENERATOR_STATUS.FUEL_EXHAUSTED;
        loadKw = status === GENERATOR_STATUS.RUNNING ? params.ratedPowerKw : 0;
      }
    } else if (status === GENERATOR_STATUS.RUNNING) {
      const fuelBurnedL = fuelBurnedLThisTick(loadKw, params, ctx.dt);
      fuelRemainingL = Math.max(0, fuelRemainingL - fuelBurnedL);
      cumulativeRuntimeS += ctx.dt;
      if (fuelRemainingL <= 0) {
        status = GENERATOR_STATUS.FUEL_EXHAUSTED;
        loadKw = 0;
      }
    }

    const nextParams: GeneratorDefaults = { ...params, status, secondsRemaining, fuelRemainingL, loadKw, cumulativeRuntimeS };

    const observation: Observation = {
      observationId: `gen-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: ${generatorStatusLabel(status)}, load=${loadKw.toFixed(1)}kW, fuel=${fuelRemainingL.toFixed(1)}L`,
      measurements: [
        { key: 'loadKw', value: loadKw, tick: ctx.tick, entity: entity.ref, provenance: ['domains/electricalGenerator.ts#loadKw'] },
        { key: 'fuelRemainingL', value: fuelRemainingL, tick: ctx.tick, entity: entity.ref, provenance: ['domains/electricalGenerator.ts#fuelRemainingL', fuelModelLabel] },
      ],
      provenance: ['domains/electricalGenerator.ts', fuelModelLabel],
    };

    const eventParameters = { ...nextParams };
    const stepEvent: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('gen-evt', entity.id, ctx.tick, eventParameters),
      type: 'electrical.generator.step',
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'state-machine-step',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: solverId },
    };

    if (status !== previousStatus) {
      // A REAL state transition this tick — the one event a cross-domain coupling (RUNNING) or an
      // honest failure disclosure (FUEL_EXHAUSTED) actually reacts to, not the routine step noise.
      const eventParameters1 = { previousStatus, newStatus: status };
      const transitionEvent: GenesisEvent = {
        contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
        id: deterministicEventId('gen-evt:transition', entity.id, ctx.tick, eventParameters1),
        type: GENERATOR_STATUS_CHANGED_EVENT_TYPE,
        timestamp: ctx.tick,
        source: entity.ref,
        affectedEntities: [entity.ref],
        cause: 'state-machine-transition',
        parameters: eventParameters1,
        parentEventId: stepEvent.id,
        provenance: { origin: 'model', modelId: solverId, notes: `${generatorStatusLabel(previousStatus)} -> ${generatorStatusLabel(status)}` },
      };
      return {
        patch: { domainState: { ...nextParams }, statusLabel: generatorStatusLabel(status) },
        grounding: 'PROCEDURAL_APPROXIMATION',
        observation,
        event: transitionEvent,
      };
    }

    return {
      patch: { domainState: { ...nextParams }, statusLabel: generatorStatusLabel(status) },
      grounding: 'PROCEDURAL_APPROXIMATION',
      observation,
      event: stepEvent,
    };
  };
}

/**
 * One reusable solver: advances a generator's real state machine by `dt`
 * seconds. `OFF` never advances on its own — it only ever leaves `OFF` via
 * a real intervention (`applyGeneratorStartCommand`), same discipline as
 * a pump never un-tripping itself.
 */
export function makeElectricalGeneratorSolver(): DomainSolver {
  return makeGeneratorSolverWithFuelModel(
    ELECTRICAL_GENERATOR_SOLVER_ID,
    'linear-diesel-genset-fuel-model',
    (loadKw, params, dt) => (loadKw * params.specificFuelConsumptionLPerKwh / 3600) * dt, // real linear diesel-genset fuel model
  );
}

export const ELECTRICAL_GENERATOR_AFFINE_SOLVER_ID = 'electrical-backup-generator-model-affine-idle-burn';

/**
 * Idle fuel burn: a real diesel genset keeps consuming fuel just to keep the
 * engine turning even at zero electrical load (parasitic/friction losses),
 * which the linear model above — fuel proportional to load only — does not
 * capture. Representative rule-of-thumb figure from generator-sizing
 * guidance: no-load consumption is commonly cited around 10-15% of a unit's
 * full-load fuel flow. At this class's rated 50 kW / 0.32 L/kWh baseline
 * that flow is 16 L/h, so 15% is 2.4 L/h — a figure for the CLASS, not a
 * measurement of any named unit, same honesty tier as `GENERATOR_DEFAULTS`.
 */
const AFFINE_IDLE_FUEL_L_PER_HR = 2.4;

/**
 * STRUCTURAL ALTERNATIVE to the linear fuel model above: same state machine,
 * same declared parameters, a DIFFERENT equation for `fuelBurnedL` — burn is
 * `idle + load x specific consumption`, not `load x specific consumption`
 * alone. Registered ADDITIONALLY alongside the linear solver (see
 * `structuralAlternative.ts`); nothing binds an entity to it by default, so
 * its existence changes no existing result.
 */
export function makeAffineElectricalGeneratorSolver(): DomainSolver {
  return makeGeneratorSolverWithFuelModel(
    ELECTRICAL_GENERATOR_AFFINE_SOLVER_ID,
    'affine-diesel-genset-fuel-model-with-idle-burn',
    (loadKw, params, dt) => ((AFFINE_IDLE_FUEL_L_PER_HR + loadKw * params.specificFuelConsumptionLPerKwh) / 3600) * dt,
  );
}

export interface AddBackupGeneratorOptions {
  generatorId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<GeneratorDefaults>;
}

export function addBackupGenerator(graph: WorldGraph, options: AddBackupGeneratorOptions = {}): EntityId {
  const ref = { kind: 'backup-generator', id: options.generatorId ?? 'generator-1' };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Backup Diesel Generator',
    scale: { level: 'MESO_LAB', parentEntityId: options.parentEntityId },
    spatial: { position: { x: -2, y: 0, z: 0 } },
    domainState: { ...GENERATOR_DEFAULTS, ...options.params },
    domainBinding: { solverId: ELECTRICAL_GENERATOR_SOLVER_ID, domainId: ELECTRICAL_DOMAIN_ID },
    statusLabel: generatorStatusLabel(options.params?.status ?? GENERATOR_DEFAULTS.status),
    grounding: 'PROCEDURAL_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/**
 * A real, human-initiated intervention (mission section 10's own "turn on
 * the generator" example): commands an `OFF` generator to begin its
 * startup sequence. Refuses (throws) if the generator is not currently
 * `OFF` — starting an already-starting/running/exhausted unit is not a
 * real operation this model defines, so it is rejected rather than
 * silently coerced into one. Goes through `applyInterventionWithEvent`,
 * never a direct graph mutation, so the command is real, replayable
 * evidence like any other intervention.
 */
export function applyGeneratorStartCommand(engine: TemporalEngine, generatorId: EntityId): WorldModelEntity {
  const generator = engine.graph.getEntity(generatorId);
  const status = generator.domainState?.status ?? GENERATOR_DEFAULTS.status;
  if (status !== GENERATOR_STATUS.OFF) {
    throw new Error(`Generator "${generatorId}" is not OFF (current status: ${generatorStatusLabel(status)}) — cannot issue a start command.`);
  }
  return applyInterventionWithEvent(
    engine,
    generatorId,
    { 'domainState.status': GENERATOR_STATUS.STARTING, 'domainState.secondsRemaining': generator.domainState?.startupDelayS ?? GENERATOR_DEFAULTS.startupDelayS },
    { eventType: GENERATOR_STARTCOMMAND_EVENT_TYPE, cause: 'operator-start-command' },
  );
}
