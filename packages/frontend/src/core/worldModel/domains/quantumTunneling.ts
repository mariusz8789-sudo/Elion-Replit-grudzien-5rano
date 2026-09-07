import { deterministicEventId, GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../../events/genesisEvent';
import { canonicalJson, fnv1a } from '../../events/hash';
import { runTunnelingScenario } from '../../quantum/tunnelingRunner';
import type { Observation } from '../../world/scientificWorldState';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';

/**
 * FIFTH REAL SCIENTIFIC WORLD: quantum mechanics (1D tunnelling).
 *
 * Wraps the existing, real split-step Fourier Schrödinger integrator
 * (`core/quantum/tunnelingRunner.ts`) — already tested, already used by the
 * Canvas lab and the backend Fabric API, and until now the single largest
 * piece of real science in this repository with NO connection to the world
 * model at all. Nothing here re-implements quantum mechanics: this file is
 * the ECS adapter (entity state in, real runner, evidence out), exactly as
 * `hydraulicsPumpPipe.ts` adapts the pump-pipe EngineeringModel.
 *
 * WHY `runScenario` AND NOT THE INCREMENTAL `advance()`:
 * `TunnelingSolver` holds a 512-point complex wavefunction in its own
 * instance fields. That state is NOT plain-numeric per-entity state, so it
 * could not live in `domainState`, could not be diffed into the delta log,
 * and would be silently SHARED between a branch and its fork (both would
 * mutate the same solver instance). `runScenario` is instead a pure,
 * deterministic function of four plain numbers — which is precisely what
 * this ECS can store, replay and fork correctly. Determinism is verified by
 * this domain's own tests, not assumed.
 *
 * HONEST LIMITS — what `transmission` is and is not:
 *  - It is the fraction of |ψ|² that has passed beyond the barrier AFTER A
 *    FINITE EVOLUTION TIME (`frames` steps of dt=0.02). It is NOT the
 *    analytic asymptotic transmission coefficient of scattering theory: run
 *    the same barrier for 300 frames instead of 1200 and the number is
 *    smaller simply because the packet has not finished crossing yet.
 *    `frames` is therefore a real, explicit parameter of the experiment,
 *    never a hidden constant.
 *  - The model is one-dimensional, single-particle, in natural units
 *    (ħ=m=1), with absorbing edges. The NUMERICS are exact to machine
 *    precision for that model; the MODEL is an idealisation of a real
 *    junction. Hence `MODEL_ESTIMATE` — the same tier
 *    `hydraulicsPumpPipe.ts`/`epidemicSEIR.ts` use for a real model of a
 *    simplified system, and never `GROUNDED_EXACT`.
 */
export const QUANTUM_TUNNELING_SOLVER_ID = 'quantum-tunneling-split-step-fourier';
export const QUANTUM_DOMAIN_ID = 'quantum-mechanics';

export const QUANTUM_TUNNELING_STEP_EVENT_TYPE = 'quantum.tunneling.step';
export const QUANTUM_TUNNELING_STATE_CHANGED_EVENT_TYPE = 'quantum.tunneling.statechanged';
export const STM_IMAGING_LOST_EVENT_TYPE = 'instrument.stm.imaginglost';
export const STM_IMAGING_RESTORED_EVENT_TYPE = 'instrument.stm.imagingrestored';

/**
 * The junction's real, finite state enum — a STRING allowlist, deliberately,
 * because this is what reaches C2 as `WorldFrameEntity.statusLabel` ->
 * `status`. `graphics/ADAPTER_CONTRACT.md` requires an adapter to gate on
 * `KNOWN_STATES.has(status)`, an allowlist of a domain's own real state
 * type — prose like "tunnelling at 1.8%" could never be allowlisted, so it
 * would be treated as unmodeled and silently drop the visual. Every value a
 * future quantum adapter needs to allowlist is exported here, from one
 * place, rather than being re-typed at the adapter.
 */
export const QUANTUM_TUNNELING_STATES = ['QUANTUM_BARRIER_OPAQUE', 'QUANTUM_TUNNELING_DETECTED', 'QUANTUM_BARRIER_TRANSPARENT'] as const;
export type QuantumTunnelingState = (typeof QUANTUM_TUNNELING_STATES)[number];

/**
 * The same three regimes as a NUMBER, published as `tunnelingStateCode` in
 * `domainState`. Added when `graphics/SOLVER_DATA_CONTRACT.md` landed:
 * its Rule 3 states that `statusLabel` is a prose channel that MUST NOT be
 * what an adapter gates on, and that a numeric discrete code "is the
 * cleanest option and SHOULD be preferred for any domain with genuinely
 * discrete modes". `transmission` (the continuous discriminator) was
 * already published; this is the discrete companion, so a consumer never
 * has to parse a label or re-derive the thresholds.
 */
export const QUANTUM_TUNNELING_STATE_CODE = { QUANTUM_BARRIER_OPAQUE: 0, QUANTUM_TUNNELING_DETECTED: 1, QUANTUM_BARRIER_TRANSPARENT: 2 } as const;

/**
 * Classification thresholds on the REAL, solver-computed transmission
 * probability. The number is real physics; where exactly to draw the line
 * between "opaque", "tunnelling" and "transparent" is a PRESENTATION
 * CONVENTION for this reference world, not a physical boundary — disclosed
 * here for the same reason `PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M` is.
 */
export const TUNNELING_DETECTED_THRESHOLD = 1e-3;
export const BARRIER_TRANSPARENT_THRESHOLD = 0.1;

/** Numeric scalar -> finite enum. Pure and exported so a test (or a future C2 adapter) can check the mapping without re-running the integrator. */
export function classifyTunnelingTransmission(transmission: number): QuantumTunnelingState {
  if (!Number.isFinite(transmission) || transmission < TUNNELING_DETECTED_THRESHOLD) return 'QUANTUM_BARRIER_OPAQUE';
  if (transmission < BARRIER_TRANSPARENT_THRESHOLD) return 'QUANTUM_TUNNELING_DETECTED';
  return 'QUANTUM_BARRIER_TRANSPARENT';
}

export interface TunnelJunctionDefaults {
  /** Incident wavepacket energy, natural units. Runner-validated range 0.2–1.6. */
  energy: number;
  /** Barrier height, natural units. Runner-validated range 0.4–2.5. */
  barrier: number;
  /** Barrier width (the junction gap), natural units. Runner-validated range 1–8. */
  width: number;
  /** Evolution length of the bounded experiment, in dt=0.02 steps. Runner-validated range 1–2400. */
  frames: number;
  transmission: number;
  reflection: number;
  remainingProbability: number;
}

/** The runner's OWN documented parameter defaults and bounds — mirrored here, not re-invented, so a clamp can never disagree with what `runScenario` actually accepts. */
const PARAMETER_BOUNDS = {
  energy: { min: 0.2, max: 1.6, fallback: 0.55 },
  barrier: { min: 0.4, max: 2.5, fallback: 1 },
  width: { min: 1, max: 8, fallback: 3 },
  frames: { min: 1, max: 2400, fallback: 1200 },
} as const;

export const TUNNEL_JUNCTION_DEFAULTS: TunnelJunctionDefaults = {
  energy: PARAMETER_BOUNDS.energy.fallback,
  barrier: PARAMETER_BOUNDS.barrier.fallback,
  width: PARAMETER_BOUNDS.width.fallback,
  frames: PARAMETER_BOUNDS.frames.fallback,
  transmission: 0,
  reflection: 0,
  remainingProbability: 0,
};

/**
 * `runScenario` THROWS on an out-of-range parameter. A solver that throws
 * mid-tick would abort the whole world's tick for every other domain, so an
 * out-of-range value (e.g. from an over-enthusiastic intervention) is
 * clamped into the runner's own validated range instead — and the CLAMPED
 * value is what gets written back to `domainState`, so the stored state
 * always matches the experiment that was actually run rather than silently
 * disagreeing with it.
 */
function clampParameter(value: number | undefined, bounds: { min: number; max: number; fallback: number }): number {
  if (value === undefined || !Number.isFinite(value)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, value));
}

/**
 * `runTunnelingScenario` costs ~80ms at the default 1200 frames — far too
 * much to repeat every tick for a result that cannot have changed. Because
 * it is a PURE function of (energy, barrier, width, frames), caching its
 * output is exact rather than an approximation: a cache hit returns bit-for-bit
 * what a re-run would have produced. This is the same reasoning that lets
 * `hydraulicsPumpPipe.ts` treat its model as steady-state — recompute only
 * when an input actually changed.
 */
const SCENARIO_CACHE_LIMIT = 64;

function makeScenarioCache() {
  const cache = new Map<string, { transmission: number; reflection: number; remainingProbability: number }>();
  return (energy: number, barrier: number, width: number, frames: number) => {
    const key = `${energy}|${barrier}|${width}|${frames}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const result = runTunnelingScenario({ energy, barrier, width, frames });
    const stored = { transmission: result.transmission, reflection: result.reflection, remainingProbability: result.remainingProbability };
    if (cache.size >= SCENARIO_CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    cache.set(key, stored);
    return stored;
  };
}


/** One reusable solver over the real split-step Fourier integrator. Each entity carries its own experiment parameters in `domainState`. */
export function makeQuantumTunnelingSolver(): DomainSolver {
  const solveScenario = makeScenarioCache();

  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<TunnelJunctionDefaults> | undefined;
    const energy = clampParameter(state?.energy, PARAMETER_BOUNDS.energy);
    const barrier = clampParameter(state?.barrier, PARAMETER_BOUNDS.barrier);
    const width = clampParameter(state?.width, PARAMETER_BOUNDS.width);
    const frames = Math.round(clampParameter(state?.frames, PARAMETER_BOUNDS.frames));

    const { transmission, reflection, remainingProbability } = solveScenario(energy, barrier, width, frames);
    const previousState = state?.transmission === undefined ? undefined : classifyTunnelingTransmission(state.transmission);
    const junctionState = classifyTunnelingTransmission(transmission);

    const nextParams: TunnelJunctionDefaults = { energy, barrier, width, frames, transmission, reflection, remainingProbability };
    // Rule 3's preferred machine-readable channel: the discrete regime as a number, alongside the
    // continuous `transmission` it is derived from.
    const domainState = { ...nextParams, tunnelingStateCode: QUANTUM_TUNNELING_STATE_CODE[junctionState] };
    const paramsHash = fnv1a(canonicalJson({ energy, barrier, width, frames, entityId: entity.id }));

    const observation: Observation = {
      observationId: `qtun-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: E=${energy}, V=${barrier}, w=${width} -> T=${transmission.toExponential(3)}, R=${reflection.toFixed(4)} after ${frames} frames`,
      measurements: [
        { key: 'transmission', value: transmission, tick: ctx.tick, entity: entity.ref, provenance: ['core/quantum/tunnelingRunner.ts#runScenario', 'split-step-fourier-tdse'] },
        { key: 'reflection', value: reflection, tick: ctx.tick, entity: entity.ref, provenance: ['core/quantum/tunnelingRunner.ts#runScenario'] },
        { key: 'remainingProbability', value: remainingProbability, tick: ctx.tick, entity: entity.ref, provenance: ['core/quantum/tunnelingRunner.ts#runScenario'] },
      ],
      provenance: ['core/quantum/tunnelingRunner.ts', 'split-step-fourier', `finite-evolution-frames:${frames}`],
    };

    const eventParameters = { ...nextParams };
    const stepEvent: GenesisEvent = {
      contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
      id: deterministicEventId('qtun-evt', entity.id, ctx.tick, eventParameters),
      type: QUANTUM_TUNNELING_STEP_EVENT_TYPE,
      timestamp: ctx.tick,
      source: entity.ref,
      affectedEntities: [entity.ref],
      cause: 'bounded-tdse-evaluation',
      parameters: eventParameters,
      provenance: { origin: 'model', modelId: QUANTUM_TUNNELING_SOLVER_ID, paramsHash },
    };

    const patch = { domainState, statusLabel: junctionState };

    if (previousState !== undefined && previousState !== junctionState) {
      // A REAL transition of the junction's measured regime — the one event a cross-domain
      // coupling reacts to, rather than the routine per-tick step noise.
      return {
        patch,
        grounding: 'MODEL_ESTIMATE',
        observation,
        event: {
          ...stepEvent,
          id: `${stepEvent.id}:transition`,
          type: QUANTUM_TUNNELING_STATE_CHANGED_EVENT_TYPE,
          cause: 'tunnelling-regime-transition',
          parameters: { ...nextParams, previousState, newState: junctionState },
          parentEventId: stepEvent.id,
          provenance: { origin: 'model', modelId: QUANTUM_TUNNELING_SOLVER_ID, notes: `${previousState} -> ${junctionState}` },
        },
      };
    }

    return { patch, grounding: 'MODEL_ESTIMATE', observation, event: stepEvent };
  };
}

export interface AddTunnelJunctionOptions {
  junctionId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<TunnelJunctionDefaults>;
}

/**
 * Adds a scanning-tunnelling-microscope junction bound to the real solver —
 * composable exactly like `addPumpPipeSystem`/`addBackupGenerator`.
 */
export function addTunnelJunction(graph: WorldGraph, options: AddTunnelJunctionOptions = {}): EntityId {
  const ref = { kind: 'tunnel-junction', id: options.junctionId ?? 'stm-1' };
  const params = { ...TUNNEL_JUNCTION_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'STM Tunnel Junction',
    scale: { level: 'MICRO_MOLECULAR', parentEntityId: options.parentEntityId },
    spatial: { position: { x: 21, y: 0, z: 2 } },
    domainState: { ...params },
    domainBinding: { solverId: QUANTUM_TUNNELING_SOLVER_ID, domainId: QUANTUM_DOMAIN_ID },
    // No status until the solver has actually measured one: the junction's regime is a solver
    // OUTPUT, and asserting one at construction time would be a reading nothing computed.
    grounding: 'MODEL_ESTIMATE',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/**
 * QUANTUM -> CHEMISTRY coupling.
 *
 * A scanning tunnelling microscope images a sample by measuring the current
 * across its vacuum junction, and that current is carried by exactly the
 * tunnelling this solver computes — so when the junction goes opaque, the
 * instrument genuinely cannot image the sample any more. That physical
 * dependence is real, not decorative.
 *
 * What is a SCRIPTED ASSUMPTION, disclosed: the USABILITY cut — treating
 * `QUANTUM_BARRIER_OPAQUE` as "not enough current to image" — is an
 * engineering-judgment threshold on a real number, the same tier as
 * `PUMP_OVERLOAD_HEAD_LOSS_THRESHOLD_M`, hence `PROCEDURAL_APPROXIMATION`.
 *
 * The effect is deliberately an INSTRUMENT-AVAILABILITY flag on the sample,
 * never a change to the sample's chemistry: no validated model connects a
 * microscope's junction current to a reaction's kinetics, so the real
 * Arrhenius state (`chemical`) is left untouched, exactly as the rainfall
 * cascade leaves the SEIR compartments alone. `domainState` is safe to write
 * here because the chemistry solver only ever patches `chemical`/`statusLabel`.
 */
export function buildStmImagingCouplings(): readonly CrossDomainCoupling[] {
  const imagingLost = defineCrossDomainCoupling({
    id: 'tunnel-junction-opaque-to-stm-imaging',
    sourceDomain: 'quantum-mechanics',
    targetDomain: 'chemistry-kinetics',
    triggerEventType: QUANTUM_TUNNELING_STATE_CHANGED_EVENT_TYPE,
    relationshipKind: 'images',
    direction: 'from',
    condition: 'Tunnel junction fell to QUANTUM_BARRIER_OPAQUE — no usable tunnelling current',
    effect: "Sample is flagged as not currently imageable by the STM. The sample's real Arrhenius chemistry is never altered by this coupling.",
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (sample, triggerEvent) => {
      if (triggerEvent.parameters.newState !== 'QUANTUM_BARRIER_OPAQUE') return undefined;
      const state = sample.domainState ?? {};
      if (state.stmImagingAvailable === 0) return undefined;
      return {
        patch: { domainState: { ...state, stmImagingAvailable: 0 } },
        eventType: STM_IMAGING_LOST_EVENT_TYPE,
        cause: 'tunnel-junction-opaque',
      };
    },
  });

  const imagingRestored = defineCrossDomainCoupling({
    id: 'tunnel-junction-conducting-to-stm-imaging',
    sourceDomain: 'quantum-mechanics',
    targetDomain: 'chemistry-kinetics',
    triggerEventType: QUANTUM_TUNNELING_STATE_CHANGED_EVENT_TYPE,
    relationshipKind: 'images',
    direction: 'from',
    condition: 'Tunnel junction recovered to a conducting regime',
    effect: 'Sample is flagged as imageable again — the exact mirror of the imaging-lost coupling.',
    grounding: 'PROCEDURAL_APPROXIMATION',
    deriveEffect: (sample, triggerEvent) => {
      if (triggerEvent.parameters.newState === 'QUANTUM_BARRIER_OPAQUE') return undefined;
      const state = sample.domainState ?? {};
      if (state.stmImagingAvailable !== 0) return undefined;
      return {
        patch: { domainState: { ...state, stmImagingAvailable: 1 } },
        eventType: STM_IMAGING_RESTORED_EVENT_TYPE,
        cause: 'tunnel-junction-conducting',
      };
    },
  });

  return [imagingLost, imagingRestored];
}
