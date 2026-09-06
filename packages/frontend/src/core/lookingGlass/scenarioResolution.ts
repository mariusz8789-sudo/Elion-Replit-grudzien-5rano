import type {
  ScenarioFamily, ScenarioKind, StructuredScenarioRequest, TemporalUnit,
  UnresolvedAspect, Viewpoint, ViewpointKind,
} from './scenarioRequest';
import { spanToTicks } from './scenarioRequest';

/**
 * LOOKING GLASS — CAN GENESIS ACTUALLY RUN THIS?
 *
 * `parseScenarioRequest` reads what the user MEANT. This module answers the
 * separate, harder question of whether Genesis can honour it, and it is
 * required to say no in three different ways, for three different reasons.
 *
 * 1. NEEDS_INPUT — the sentence did not say enough. Ask; never default.
 *
 * 2. NOT_MODELLED — understood completely, and no Genesis model produces it.
 *    This is the boundary where the Looking Glass refuses to fake science.
 *    "Show this city over the next 100 years from a bench" parses perfectly:
 *    family, span and anchored viewpoint are unambiguous. It still cannot be
 *    honoured, because nothing here simulates century-scale urban change.
 *    The correct answer is not a plausible-looking city that ages on screen
 *    — that is fabricated output wearing a cinematic costume. It is to name
 *    the missing capability, so the user learns something true about the
 *    system instead of being deceived by it. Most hazard families are in
 *    exactly this state today, and saying so is the honest inventory.
 *
 * 3. REFUSED — the request is about building or improving a weapon rather
 *    than understanding what one would do to a population. Genesis models
 *    consequences, exposure, evacuation and response, because civil
 *    protection and public health need exactly that. It does not help design,
 *    synthesise, optimise or target a weapon. See `SafetyClass`.
 *
 * The capability table is the honest inventory of what the real adapters
 * genuinely simulate. Every entry must be justifiable by pointing at a
 * running model. Widening it without widening a model is the single most
 * damaging edit anyone could make to this file.
 */

/** The Genesis subsystem that would actually run a scenario. */
export type ScenarioEngineBinding =
  | 'SCENARIO_ENGINE_EPIDEMIC'
  | 'CELL_WORLD_ADAPTER'
  | 'MOLECULE_WORLD_ADAPTER'
  | 'PARTICLE_WORLD_ADAPTER'
  /** The real C3 World Model engine (core/worldModel/*) — WorldGraph + TemporalEngine + a real domain solver, not scenarioEngine/hypothesisLoop. */
  | 'WORLD_MODEL_CHEMISTRY';

export interface ScenarioCapability {
  readonly binding: ScenarioEngineBinding;
  /** Time units the underlying model genuinely advances in. */
  readonly units: readonly TemporalUnit[];
  /** Largest span the model stays meaningful over, in its own units. */
  readonly maxSpan: Readonly<Partial<Record<TemporalUnit, number>>>;
  /** Viewpoints that have a real spatial world to stand in. */
  readonly viewpoints: readonly ViewpointKind[];
  /** Ticks the world advances per unit of its own time. */
  readonly ticksPerUnit: Readonly<Record<TemporalUnit, number>>;
  /** Transformations this scenario does NOT model, phrased for a human. */
  readonly notModelled: readonly string[];
}

/**
 * ONLY the scenario kinds a real Genesis model runs today. A kind absent
 * from this map is not an oversight — it is the truthful statement that
 * Genesis cannot simulate it yet.
 */
export const SCENARIO_CAPABILITIES: Readonly<Partial<Record<ScenarioKind, ScenarioCapability>>> = {
  EPIDEMIC: {
    binding: 'SCENARIO_ENGINE_EPIDEMIC',
    units: ['DAY'],
    maxSpan: { DAY: 365 },
    viewpoints: ['ANCHORED_HUMAN', 'DRIVER_POV', 'RESPONDER_POV', 'OPERATOR_POV', 'OBSERVER', 'WIDE', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 1, YEAR: 365 },
    notModelled: [
      'urban transformation — buildings, infrastructure and vegetation do not change over years',
      'demographics beyond the compartmental model',
    ],
  },
  QUARANTINE: {
    binding: 'SCENARIO_ENGINE_EPIDEMIC',
    units: ['DAY'],
    maxSpan: { DAY: 365 },
    viewpoints: ['ANCHORED_HUMAN', 'DRIVER_POV', 'RESPONDER_POV', 'OPERATOR_POV', 'OBSERVER', 'WIDE'],
    ticksPerUnit: { HOUR: 1, DAY: 1, YEAR: 365 },
    notModelled: ['enforcement behaviour and compliance dynamics'],
  },
  CELL_CULTURE: {
    binding: 'CELL_WORLD_ADAPTER',
    units: ['HOUR', 'DAY'],
    maxSpan: { HOUR: 720, DAY: 30 },
    viewpoints: ['SCIENTIST_POV', 'OPERATOR_POV', 'OBSERVER', 'WIDE', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 24, YEAR: 8760 },
    notModelled: [
      'a walkable human-scale world outside the laboratory',
      'multi-generational evolutionary change',
    ],
  },
  LAB_EXPERIMENT: {
    binding: 'CELL_WORLD_ADAPTER',
    units: ['HOUR', 'DAY'],
    maxSpan: { HOUR: 720, DAY: 30 },
    viewpoints: ['SCIENTIST_POV', 'OPERATOR_POV', 'OBSERVER', 'WIDE', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 24, YEAR: 8760 },
    notModelled: ['apparatus outside the modelled bioreactor'],
  },
  CHEMICAL_REACTION: {
    binding: 'MOLECULE_WORLD_ADAPTER',
    units: ['HOUR'],
    maxSpan: { HOUR: 48 },
    viewpoints: ['SCIENTIST_POV', 'OBSERVER', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 24, YEAR: 8760 },
    notModelled: [
      'a human-scale world a person can stand in — the world is molecular',
      'reaction kinetics outside the bounded scenario set',
    ],
  },
  PARTICLE_SYSTEM: {
    binding: 'PARTICLE_WORLD_ADAPTER',
    units: ['HOUR'],
    maxSpan: { HOUR: 24 },
    viewpoints: ['OBSERVER', 'WIDE', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 24, YEAR: 8760 },
    notModelled: [
      'a human-scale world a person can stand in — the world is particle-scale',
      'continuum or fluid dynamics',
    ],
  },
  /**
   * Backed by the real C3 World Model engine — a live WorldGraph advanced by
   * `chemistryKinetics.ts`'s Arrhenius solver, not scenarioEngine/hypothesisLoop.
   * Span capped at 24 hours because the solver's demo kinetics parameters
   * (see DEMO_ACTIVATION_ENERGY_KJ/DEMO_PRE_EXPONENTIAL_LOG10) were tuned to
   * show a real decay trajectory over exactly that window at 700-800K — a
   * longer request would either underflow to zero or barely move.
   */
  CHEMICAL_KINETICS: {
    binding: 'WORLD_MODEL_CHEMISTRY',
    units: ['HOUR'],
    maxSpan: { HOUR: 24 },
    viewpoints: ['SCIENTIST_POV', 'OBSERVER', 'MACRO'],
    ticksPerUnit: { HOUR: 1, DAY: 24, YEAR: 8760 },
    notModelled: [
      'a human-scale world a person can stand in — no 3D rendering surface exists for this domain yet',
      'reaction products or multi-step mechanisms — this is single-substance first-order decay only',
    ],
  },
};

/** Why a whole family is unavailable, when no kind in it is modelled yet. */
const FAMILY_GAP: Readonly<Record<ScenarioFamily, string>> = {
  NATURAL_HAZARD: 'Genesis has no hydrological, seismic or atmospheric solver — hazard propagation, inundation depth and ground motion are not simulated',
  EPIDEMIOLOGICAL: 'this particular epidemiological scenario has no model behind it yet',
  INDUSTRIAL_ENVIRONMENTAL: 'Genesis has no plume dispersion, hydraulic network or power-grid solver',
  TRANSPORT: 'Genesis has no transport-network or air-traffic model',
  CIVIL_PROTECTION: 'Genesis has no blast, fallout or evacuation-flow model — consequence modelling for these scenarios is not implemented',
  LABORATORY: 'this laboratory scenario has no model behind it yet',
  MOLECULAR: 'this molecular scenario has no model behind it yet',
  URBAN_CHANGE: 'Genesis has no urban-development model — buildings, infrastructure and population structure do not evolve',
};

/**
 * Every viewpoint the vocabulary knows, answered for one scenario kind: is
 * there really somewhere to stand, and if not, why. Derived from the same
 * capability table the resolver refuses with, so a UI listing perspectives
 * and the resolver rejecting one can never disagree.
 */
export function DOMAIN_PERSPECTIVE_SOURCE(kind: ScenarioKind): readonly {
  kind: ViewpointKind; available: boolean; reason: string | null;
}[] {
  const capability = SCENARIO_CAPABILITIES[kind];
  const all: readonly ViewpointKind[] = [
    'ANCHORED_HUMAN', 'DRIVER_POV', 'SCIENTIST_POV', 'OPERATOR_POV', 'RESPONDER_POV', 'OBSERVER', 'WIDE', 'MACRO',
  ];
  return all.map((viewpoint) => {
    const available = capability?.viewpoints.includes(viewpoint) ?? false;
    return {
      kind: viewpoint,
      available,
      reason: available ? null : (capability?.notModelled[0] ?? 'this scenario has no model behind it yet'),
    };
  });
}

export type ResolutionStatus = 'READY' | 'NEEDS_INPUT' | 'NOT_MODELLED' | 'REFUSED';

export interface ScenarioRunPlan {
  readonly kind: ScenarioKind;
  readonly family: ScenarioFamily;
  readonly binding: ScenarioEngineBinding;
  readonly ticks: number;
  readonly unit: TemporalUnit;
  readonly viewpoint: Viewpoint;
  readonly comparison: boolean;
  readonly cinematic: boolean;
}

export interface ScenarioResolution {
  readonly status: ResolutionStatus;
  readonly request: StructuredScenarioRequest;
  /** Aspects the sentence never stated — only meaningful for NEEDS_INPUT. */
  readonly missing: readonly UnresolvedAspect[];
  /** Capabilities Genesis lacks, phrased for a human — only for NOT_MODELLED. */
  readonly notModelled: readonly string[];
  /** Why the request was declined — only for REFUSED. */
  readonly refusal: string | null;
  /** Populated only when status is READY. */
  readonly plan: ScenarioRunPlan | null;
}

export function resolveScenarioRequest(request: StructuredScenarioRequest): ScenarioResolution {
  const empty = { request, missing: [] as readonly UnresolvedAspect[], notModelled: [] as readonly string[], refusal: null, plan: null };

  // The safety boundary is checked first and unconditionally: a weapon-
  // development request is declined whether or not the rest of it parses.
  if (request.safety === 'WEAPON_DEVELOPMENT') {
    return {
      ...empty,
      status: 'REFUSED',
      refusal:
        `This reads as ${request.safetySignals.join(' and ')}, which Genesis does not do. ` +
        'It models the consequences of catastrophic events — affected areas and populations, ' +
        'infrastructure damage, exposure, evacuation and emergency response — and not the design, ' +
        'synthesis, optimisation or targeting of a weapon. Ask about consequences and response and ' +
        'it will help.',
    };
  }

  const blocking = request.unresolved.filter((aspect) => aspect === 'FAMILY' || aspect === 'TIME_SPAN');
  if (blocking.length > 0 || !request.kind || !request.family || !request.span) {
    return { ...empty, status: 'NEEDS_INPUT', missing: request.unresolved };
  }

  const capability = SCENARIO_CAPABILITIES[request.kind];
  if (!capability) {
    return {
      ...empty,
      status: 'NOT_MODELLED',
      notModelled: [`${request.kind.replace(/_/g, ' ').toLowerCase()} is not simulated: ${FAMILY_GAP[request.family]}`],
    };
  }

  const notModelled: string[] = [];
  if (!capability.viewpoints.includes(request.viewpoint.kind)) {
    notModelled.push(
      `${request.kind.replace(/_/g, ' ').toLowerCase()} has no world supporting the ${request.viewpoint.kind} viewpoint — ${capability.notModelled[0]}`,
    );
  }

  const span = request.span;
  if (!capability.units.includes(span.unit)) {
    // A unit the model does not advance in is not a rounding problem: a
    // century of an epidemic model is not an epidemic model run for longer.
    notModelled.push(
      `${request.kind.replace(/_/g, ' ').toLowerCase()} is not modelled over ${span.unit.toLowerCase()}s (it advances in ${capability.units.join('/').toLowerCase()}s)`,
    );
  } else {
    const max = capability.maxSpan[span.unit];
    if (max !== undefined && span.amount > max) {
      notModelled.push(
        `${request.kind.replace(/_/g, ' ').toLowerCase()} is only meaningful up to ${max} ${span.unit.toLowerCase()}s; the request asked for ${span.amount}`,
      );
    }
  }

  if (notModelled.length > 0) return { ...empty, status: 'NOT_MODELLED', notModelled };

  return {
    ...empty,
    status: 'READY',
    plan: {
      kind: request.kind,
      family: request.family,
      binding: capability.binding,
      ticks: spanToTicks(span, capability.ticksPerUnit),
      unit: span.unit,
      viewpoint: request.viewpoint,
      comparison: request.comparison,
      cinematic: request.cinematic,
    },
  };
}

/**
 * The nearest request Genesis COULD honour, so a refusal comes with a door
 * rather than only a wall. Null when nothing close enough exists, which is
 * itself an honest answer.
 */
export function nearestSupportedAlternative(resolution: ScenarioResolution): string | null {
  if (resolution.status !== 'NOT_MODELLED' || !resolution.request.kind) return null;
  const capability = SCENARIO_CAPABILITIES[resolution.request.kind];
  if (!capability) {
    // The whole kind is unmodelled: point at what the Looking Glass does run.
    const runnable = (Object.keys(SCENARIO_CAPABILITIES) as ScenarioKind[]).map((kind) => kind.replace(/_/g, ' ').toLowerCase());
    return `Genesis can currently run: ${runnable.join(', ')}`;
  }
  const unit = capability.units[0];
  const max = capability.maxSpan[unit];
  if (max === undefined) return null;
  const viewpoint = capability.viewpoints.includes(resolution.request.viewpoint.kind)
    ? resolution.request.viewpoint.kind
    : capability.viewpoints[0];
  return `${resolution.request.kind.replace(/_/g, ' ').toLowerCase()} over up to ${max} ${unit.toLowerCase()}s, viewed as ${viewpoint}`;
}
