import { GENESIS_EVENT_CONTRACT_VERSION } from '../../events/genesisEvent';
import {
  classifySeverity,
  EARTHQUAKE_MODEL_VERSION,
  hypocentralDistanceKm,
  syntheticPeakGroundAcceleration,
  vulnerabilityMultiplier,
} from '../../hazard/earthquake/earthquakeModel';
import { EARTHQUAKE_DAMAGE_REQUIRED_DATA } from '../../hazard/earthquake/earthquakeDamageAssessment';
import { assessStructuralDamage, FragilityRegistry, FRAGILITY_REQUIRED_DATA, INTENSITY_MEASURE, type DamageAssessment } from './seismicFragility';
import type { Observation } from '../../world/scientificWorldState';
import { defineCrossDomainCoupling, type CrossDomainCoupling } from '../crossDomain/crossDomainCoupling';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import { WorldGraph } from '../ecs/worldGraph';
import { applyInterventionWithEvent } from '../events/worldEventRules';
import type { DomainSolver, SolverResult } from '../solvers/solverRouter';
import type { TemporalEngine } from '../temporal/temporalEngine';

/**
 * PHASE 6 — SEISMIC GROUND SHAKING (integration of `core/hazard/`).
 *
 * **This is not a structural domain, and it is not named one.** The phase was
 * scoped as "integrate what `core/hazard/` already has, not new science", and
 * what it has is a ground-motion vertical slice. There is no structural
 * mechanics anywhere in this repository — no fragility curves, no member
 * analysis, no material model — so nothing here computes what a building DOES
 * under shaking. Calling this a structural solver would be the exact failure
 * mode this consolidation exists to prevent.
 *
 * WHAT IS INTEGRATED, VERBATIM: `hazard/earthquake/earthquakeModel.ts`'s
 * attenuation (`syntheticPeakGroundAcceleration`), hypocentral distance,
 * vulnerability multiplier and severity classification. Not reimplemented, not
 * re-tuned — imported and called. The functions are pure and deterministic
 * (they even round for cross-engine reproducibility), which is what makes them
 * safe to run inside a replayable tick.
 *
 * HONESTY, INHERITED RATHER THAN RESET — the source module is blunt about
 * itself and that assessment travels with it:
 *
 * - the attenuation is **explicitly not a calibrated GMPE**. It is not fit to
 *   any earthquake catalog and has not been reviewed by a seismologist. It
 *   reproduces the right qualitative behaviour (magnitude and depth raise
 *   shaking, distance attenuates it) and nothing stronger. Every output the
 *   hazard module produces is tagged `datasetStatus: 'SCENARIO'` for this
 *   reason, so shaking here is `UNGROUNDED_APPROXIMATION` — NOT
 *   `MODEL_ESTIMATE`, which would claim a validity this model does not have.
 *   Compare Phase 5's rainfall runoff, which IS `MODEL_ESTIMATE` because the
 *   rational method is a real standard method. The difference is the point.
 * - **structural damage is NOT_MODELLED, unconditionally.** There is no branch
 *   in this file that can report otherwise, exactly as there is none in
 *   `earthquakeDamageAssessment.ts`. Damage, collapse, casualties and
 *   infrastructure cascades all require inputs Genesis does not have; the
 *   named list is re-exported below rather than summarised, so a consumer can
 *   read what is actually missing.
 * - **Genesis does not predict earthquakes.** A rupture happens only because a
 *   scenario or a human intervention says so — never spontaneously, never on a
 *   recurrence model. Same discipline as Phase 5's rainfall intensity.
 *
 * WHY INTEGRATE IT AT ALL, THEN: because the NOT_MODELLED disclosure is worth
 * more inside the world model than beside it. Before this, an exposed building
 * in a C3 world said nothing about seismic damage, and silence reads as "not
 * applicable". Now every exposed structure publishes a numeric damage-state
 * code that means "not modelled", every tick, on the same channel C2 already
 * reads — so the gap is visible instead of absent.
 */
export const SEISMIC_SOURCE_SOLVER_ID = 'seismic-source-synthetic-attenuation';
export const STRUCTURAL_SITE_SOLVER_ID = 'structural-site-shaking-exposure';
export const SEISMIC_DOMAIN_ID = 'seismic-ground-motion';
export const STRUCTURAL_EXPOSURE_DOMAIN_ID = 'structural-exposure';

export const SEISMIC_RUPTURE_EVENT_TYPE = 'hazard.earthquake.rupture';
export const STRUCTURE_SHAKEN_EVENT_TYPE = 'structure.groundshaking.exposed';

/** The concrete, named data gaps between this and a trustworthy damage model — re-exported from the hazard module, never re-worded into something vaguer. */
export { EARTHQUAKE_DAMAGE_REQUIRED_DATA, FRAGILITY_REQUIRED_DATA };

/** Rule 3: numeric. A source is quiescent until something ruptures it; it never ruptures itself. */
export const SEISMIC_SOURCE_STATE_CODE = { QUIESCENT: 0, RUPTURED: 1 } as const;

/** Rule 3: numeric severity, mapped 1:1 from the hazard module's own `classifySeverity` bands. */
export const SHAKING_SEVERITY_CODE = { NONE: 0, MINOR: 1, MODERATE: 2, SEVERE: 3 } as const;

/**
 * The only value this domain can currently publish for structural damage.
 *
 * It is a one-member enum on purpose: there is no calibrated fragility model, so
 * there is no honest second value to report. If a real damage model is ever
 * added, this enum grows and every consumer keeps compiling — which is why the
 * gap is encoded as a value rather than as a missing field.
 *
 * PHASE 8.3 UPDATE: this is no longer a hardcoded constant standing in for an
 * absent capability. `domains/seismicFragility.ts` now implements the real
 * lognormal fragility machinery, and `structuralDamageAssessment()` below
 * actually ASKS it. It answers NOT_MODELLED because the catalogue is empty and
 * because a PGA-indexed hazard cannot be fed to spectral-displacement-indexed
 * curves — a checked refusal that names which piece is missing, not an
 * assumption. See that module for why all three attempts to obtain real curves
 * failed.
 */
export const STRUCTURAL_DAMAGE_STATE_CODE = { NOT_MODELLED: 0 } as const;

/** The catalogue the damage question is asked against. Empty today — deliberately, and visibly. */
const FRAGILITY = new FragilityRegistry();

/**
 * Asks the fragility machinery whether this site's damage can be assessed.
 *
 * Exported so the refusal is inspectable rather than buried: a caller can show
 * exactly why no damage number exists, instead of only seeing a NOT_MODELLED
 * code. The ground motion is passed as non-calibrated, which is the truth about
 * this hazard model and which would hold the answer at
 * `UNGROUNDED_APPROXIMATION` even if the curves existed.
 */
export function structuralDamageAssessment(site: WorldModelEntity): DamageAssessment {
  const state: StructuralSiteParams = { ...STRUCTURAL_SITE_DEFAULTS, ...(site.domainState as Partial<StructuralSiteParams> | undefined) };
  return assessStructuralDamage(
    FRAGILITY,
    vulnerabilityClassOf(state.vulnerabilityClassCode),
    INTENSITY_MEASURE.PGA_G,
    state.peakGroundAccelerationG,
    false,
  );
}

/** Closed allowlist of `statusLabel` values this domain emits. */
export const SEISMIC_STATES = [
  'SEISMIC_QUIESCENT',
  'SEISMIC_RUPTURED',
  'SHAKING_NONE',
  'SHAKING_MINOR',
  'SHAKING_MODERATE',
  'SHAKING_SEVERE',
] as const;
export type SeismicState = (typeof SEISMIC_STATES)[number];

/** Vulnerability class as a number, since `domainState` carries numbers only. Values match the hazard module's own three classes. */
export const VULNERABILITY_CLASS_CODE = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
const VULNERABILITY_BY_CODE = ['LOW', 'MEDIUM', 'HIGH'] as const;

function vulnerabilityClassOf(code: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  return VULNERABILITY_BY_CODE[code] ?? 'MEDIUM';
}

export function shakingSeverityCode(pgaG: number): number {
  switch (classifySeverity(pgaG)) {
    case 'MINOR': return SHAKING_SEVERITY_CODE.MINOR;
    case 'MODERATE': return SHAKING_SEVERITY_CODE.MODERATE;
    case 'SEVERE': return SHAKING_SEVERITY_CODE.SEVERE;
    default: return SHAKING_SEVERITY_CODE.NONE;
  }
}

/** Total function: an out-of-range code still lands inside the allowlist. */
export function shakingSeverityLabel(code: number): SeismicState {
  switch (code) {
    case SHAKING_SEVERITY_CODE.MINOR: return 'SHAKING_MINOR';
    case SHAKING_SEVERITY_CODE.MODERATE: return 'SHAKING_MODERATE';
    case SHAKING_SEVERITY_CODE.SEVERE: return 'SHAKING_SEVERE';
    default: return 'SHAKING_NONE';
  }
}

export interface SeismicSourceParams {
  magnitude: number;
  depthKm: number;
  epicenterXKm: number;
  epicenterYKm: number;
  sourceStateCode: number;
  /**
   * 1 once the solver has announced this rupture to the cascade chain.
   *
   * It lives in `domainState` rather than in a closure on purpose: the flag is
   * what stops the rupture event re-firing every tick, and a closure would make
   * that decision depend on how many times a solver instance had been called
   * rather than on the world's own state — which replay and `forkBranch` would
   * then get wrong. Same discipline as every other transition in this codebase.
   */
  ruptureAnnounced: number;
}

export const SEISMIC_SOURCE_DEFAULTS: SeismicSourceParams = {
  magnitude: 6.5,
  depthKm: 10,
  epicenterXKm: 0,
  epicenterYKm: 0,
  sourceStateCode: SEISMIC_SOURCE_STATE_CODE.QUIESCENT,
  ruptureAnnounced: 0,
};

export interface StructuralSiteParams {
  siteXKm: number;
  siteYKm: number;
  vulnerabilityClassCode: number;
  peakGroundAccelerationG: number;
  shakingSeverityCode: number;
  structuralDamageStateCode: number;
  /** 1 when a fragility model actually produced a damage assessment; 0 when the question was asked and refused. */
  damageAssessedCode: number;
}

export const STRUCTURAL_SITE_DEFAULTS: StructuralSiteParams = {
  siteXKm: 0,
  siteYKm: 0,
  vulnerabilityClassCode: VULNERABILITY_CLASS_CODE.MEDIUM,
  peakGroundAccelerationG: 0,
  shakingSeverityCode: SHAKING_SEVERITY_CODE.NONE,
  structuralDamageStateCode: STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED,
  damageAssessedCode: 0,
};

/**
 * Site-adjusted peak ground acceleration, in g — the hazard module's own
 * pipeline (`computeImpactResults`) reproduced call-for-call so a C3 world and
 * a standalone hazard run cannot drift apart.
 */
export function siteShakingG(source: Pick<SeismicSourceParams, 'magnitude' | 'depthKm' | 'epicenterXKm' | 'epicenterYKm'>, site: Pick<StructuralSiteParams, 'siteXKm' | 'siteYKm' | 'vulnerabilityClassCode'>): number {
  const distanceKm = hypocentralDistanceKm(
    { x: source.epicenterXKm, y: source.epicenterYKm },
    source.depthKm,
    { x: site.siteXKm, y: site.siteYKm },
  );
  return syntheticPeakGroundAcceleration(source.magnitude, distanceKm) * vulnerabilityMultiplier(vulnerabilityClassOf(site.vulnerabilityClassCode));
}

let stepCounter = 0;

/**
 * The seismic source. `dt` is irrelevant: this is not a time-evolving fault
 * model and there is no recurrence process here. The solver republishes the
 * source's parameters so they stay visible to C2, and that is all — the
 * transition to RUPTURED comes from outside, via `applySeismicRupture`.
 */
export function makeSeismicSourceSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<SeismicSourceParams> | undefined;
    const params: SeismicSourceParams = { ...SEISMIC_SOURCE_DEFAULTS, ...state };
    const ruptured = params.sourceStateCode === SEISMIC_SOURCE_STATE_CODE.RUPTURED;
    // The rupture event must be born INSIDE the tick chain, or the cascade layer
    // never sees it: `applySeismicRupture`'s own intervention event is recorded
    // outside `advance`, so a coupling keyed on it would silently never fire.
    // The state change comes from outside; the announcement is the solver's.
    const announcing = ruptured && params.ruptureAnnounced !== 1;
    const nextParams: SeismicSourceParams = { ...params, ruptureAnnounced: ruptured ? 1 : 0 };
    stepCounter += 1;

    return {
      patch: { domainState: { ...nextParams }, statusLabel: ruptured ? 'SEISMIC_RUPTURED' : 'SEISMIC_QUIESCENT' },
      // Not a calibrated GMPE and not a fault model: the weakest honest tier.
      grounding: 'UNGROUNDED_APPROXIMATION',
      event: {
        contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
        id: `seis-evt:${entity.id}:${ctx.tick}:${stepCounter}`,
        type: announcing ? SEISMIC_RUPTURE_EVENT_TYPE : 'hazard.earthquake.sourcestep',
        timestamp: ctx.tick,
        source: entity.ref,
        affectedEntities: [entity.ref],
        cause: announcing ? 'source-ruptured' : 'source-state-republish',
        parameters: { ...nextParams },
        provenance: {
          origin: 'model',
          modelId: SEISMIC_SOURCE_SOLVER_ID,
          notes: `${EARTHQUAKE_MODEL_VERSION}: synthetic, non-calibrated attenuation (datasetStatus SCENARIO). Genesis does not predict earthquakes — rupture is an input.`,
        },
      },
    };
  };
}

/**
 * An exposed structure. Publishes the shaking it is currently subject to and —
 * unconditionally, every tick — that its structural damage is not modelled.
 *
 * Note what it does NOT do: it never derives damage, occupancy loss, or a
 * repair cost from the PGA it holds. Those would need the data
 * `EARTHQUAKE_DAMAGE_REQUIRED_DATA` names and Genesis does not have any of it.
 */
export function makeStructuralSiteSolver(): DomainSolver {
  return (entity, ctx): SolverResult => {
    const state = entity.domainState as Partial<StructuralSiteParams> | undefined;
    const params: StructuralSiteParams = { ...STRUCTURAL_SITE_DEFAULTS, ...state };
    const severity = shakingSeverityCode(params.peakGroundAccelerationG);
    const assessment = structuralDamageAssessment(entity);
    stepCounter += 1;

    const observation: Observation = {
      observationId: `struct-obs:${entity.id}:${ctx.tick}`,
      tick: ctx.tick,
      statement: `${entity.label}: PGA=${params.peakGroundAccelerationG.toFixed(4)}g (${shakingSeverityLabel(severity)}); structural damage ${assessment.ok ? 'assessed' : `NOT MODELLED (${assessment.reason.split(':')[0]})`}`,
      measurements: [
        { key: 'peakGroundAccelerationG', value: params.peakGroundAccelerationG, tick: ctx.tick, entity: entity.ref, provenance: [`core/hazard/earthquake/earthquakeModel.ts#${EARTHQUAKE_MODEL_VERSION}`, 'datasetStatus:SCENARIO'] },
      ],
      provenance: ['domains/seismicShaking.ts', EARTHQUAKE_MODEL_VERSION, 'structural-damage:NOT_MODELLED'],
    };

    return {
      patch: {
        domainState: {
          ...params,
          shakingSeverityCode: severity,
          structuralDamageStateCode: STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED,
          // Rule 3: whether the damage question could be ANSWERED is itself a number, so a
          // consumer can distinguish "asked and refused" from "never asked". It is 0 today
          // because `structuralDamageAssessment` really runs the fragility machinery and really
          // refuses — empty catalogue, and a PGA cannot drive spectral-displacement curves. The
          // refusal reason travels in the observation alongside it.
          damageAssessedCode: assessment.ok ? 1 : 0,
        },
        statusLabel: shakingSeverityLabel(severity),
      },
      grounding: 'UNGROUNDED_APPROXIMATION',
      observation,
    };
  };
}

export interface AddSeismicSourceOptions {
  sourceId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<SeismicSourceParams>;
}

export function addSeismicSource(graph: WorldGraph, options: AddSeismicSourceOptions = {}): EntityId {
  const ref = { kind: 'seismic-source', id: options.sourceId ?? 'source-1' };
  const params: SeismicSourceParams = { ...SEISMIC_SOURCE_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Seismic Source',
    scale: { level: 'REGION', parentEntityId: options.parentEntityId },
    spatial: { position: { x: params.epicenterXKm, y: -params.depthKm, z: params.epicenterYKm } },
    domainState: { ...params },
    domainBinding: { solverId: SEISMIC_SOURCE_SOLVER_ID, domainId: SEISMIC_DOMAIN_ID },
    statusLabel: params.sourceStateCode === SEISMIC_SOURCE_STATE_CODE.RUPTURED ? 'SEISMIC_RUPTURED' : 'SEISMIC_QUIESCENT',
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

export interface AddStructuralSiteOptions {
  siteId?: string;
  label?: string;
  parentEntityId?: EntityId;
  params?: Partial<StructuralSiteParams>;
}

/**
 * Rule 1: the site gets a real absolute position, derived from its km
 * coordinates. Rule 2: the km values stay published in `domainState` alongside
 * it, so the frame is auditable in the hazard module's own units rather than
 * only in world units.
 */
export function addStructuralSite(graph: WorldGraph, options: AddStructuralSiteOptions = {}): EntityId {
  const ref = { kind: 'structural-site', id: options.siteId ?? 'site-1' };
  const params: StructuralSiteParams = { ...STRUCTURAL_SITE_DEFAULTS, ...options.params };
  const entity: WorldModelEntity = {
    id: entityId(ref),
    ref,
    label: options.label ?? 'Exposed Structure',
    scale: { level: 'BUILDING', parentEntityId: options.parentEntityId },
    spatial: { position: { x: params.siteXKm, y: 0, z: params.siteYKm } },
    domainState: { ...params },
    domainBinding: { solverId: STRUCTURAL_SITE_SOLVER_ID, domainId: STRUCTURAL_EXPOSURE_DOMAIN_ID },
    statusLabel: shakingSeverityLabel(params.shakingSeverityCode),
    grounding: 'UNGROUNDED_APPROXIMATION',
    updatedAtTick: 0,
  };
  graph.addEntity(entity);
  return entity.id;
}

/**
 * A rupture, as a real intervention. Genesis has no earthquake recurrence
 * model and will not pretend to: the fault moves when a scenario or a person
 * says it moves, and the journal records who asked.
 *
 * This only sets the source's state. The shaking follows on the NEXT tick,
 * when the source solver announces the transition into the cascade chain and
 * the coupling travels the `shakes` edges — so a caller must advance the world
 * to see any structure respond, exactly as with every other real cascade here.
 */
export function applySeismicRupture(engine: TemporalEngine, sourceEntityId: EntityId): WorldModelEntity {
  return applyInterventionWithEvent(
    engine,
    sourceEntityId,
    { 'domainState.sourceStateCode': SEISMIC_SOURCE_STATE_CODE.RUPTURED },
    { eventType: SEISMIC_RUPTURE_EVENT_TYPE, cause: 'scenario-rupture' },
  );
}

/**
 * The one coupling: a ruptured source shakes the structures it is related to
 * over a `shakes` edge. It computes ground motion and stops there — it does
 * not, and must not, continue into damage.
 */
export function buildSeismicShakingCoupling(): CrossDomainCoupling {
  return defineCrossDomainCoupling({
    id: 'seismic-source-to-structural-exposure',
    sourceDomain: SEISMIC_DOMAIN_ID,
    targetDomain: STRUCTURAL_EXPOSURE_DOMAIN_ID,
    triggerEventType: SEISMIC_RUPTURE_EVENT_TYPE,
    relationshipKind: 'shakes',
    direction: 'from',
    condition: 'The related seismic source ruptured',
    effect: 'Each exposed structure receives the site-adjusted synthetic peak ground acceleration for its own distance and vulnerability class. Structural damage is NOT derived from it.',
    // The attenuation is explicitly non-calibrated, so the coupling cannot be
    // stronger than its input no matter how real the arithmetic is.
    grounding: 'UNGROUNDED_APPROXIMATION',
    deriveEffect: (site, triggerEvent) => {
      const p = triggerEvent.parameters;
      const source: Pick<SeismicSourceParams, 'magnitude' | 'depthKm' | 'epicenterXKm' | 'epicenterYKm'> = {
        magnitude: typeof p.magnitude === 'number' ? p.magnitude : SEISMIC_SOURCE_DEFAULTS.magnitude,
        depthKm: typeof p.depthKm === 'number' ? p.depthKm : SEISMIC_SOURCE_DEFAULTS.depthKm,
        epicenterXKm: typeof p.epicenterXKm === 'number' ? p.epicenterXKm : SEISMIC_SOURCE_DEFAULTS.epicenterXKm,
        epicenterYKm: typeof p.epicenterYKm === 'number' ? p.epicenterYKm : SEISMIC_SOURCE_DEFAULTS.epicenterYKm,
      };
      const current: StructuralSiteParams = { ...STRUCTURAL_SITE_DEFAULTS, ...(site.domainState as Partial<StructuralSiteParams> | undefined) };
      const pgaG = siteShakingG(source, current);
      if (pgaG <= current.peakGroundAccelerationG) return undefined; // already shaken at least this hard — no re-fire
      return {
        patch: {
          domainState: {
            ...current,
            peakGroundAccelerationG: pgaG,
            shakingSeverityCode: shakingSeverityCode(pgaG),
            structuralDamageStateCode: STRUCTURAL_DAMAGE_STATE_CODE.NOT_MODELLED,
          },
        },
        eventType: STRUCTURE_SHAKEN_EVENT_TYPE,
        cause: 'seismic-rupture-exposure',
      };
    },
  });
}

export interface SeismicShakingWorld {
  graph: WorldGraph;
  sourceId: EntityId;
  siteIds: readonly EntityId[];
  coupling: CrossDomainCoupling;
}

/**
 * A small reference world: one source and three structures at increasing
 * distance, in the hazard module's own km frame. Mirrors the shape of
 * `SYNTHETIC_EXPOSURE_SITES` without importing the fixture, since those sites
 * are a standalone hazard-slice fixture rather than entities of any C3 world.
 */
export function buildSeismicShakingWorld(params: Partial<SeismicSourceParams> = {}): SeismicShakingWorld {
  const graph = new WorldGraph();
  const sourceId = addSeismicSource(graph, { params });
  const siteIds = [
    addStructuralSite(graph, { siteId: 'near', label: 'Near-field Structure', params: { siteXKm: 2, siteYKm: 1, vulnerabilityClassCode: VULNERABILITY_CLASS_CODE.HIGH } }),
    addStructuralSite(graph, { siteId: 'mid', label: 'Mid-field Structure', params: { siteXKm: 15, siteYKm: -10, vulnerabilityClassCode: VULNERABILITY_CLASS_CODE.MEDIUM } }),
    addStructuralSite(graph, { siteId: 'far', label: 'Far-field Structure', params: { siteXKm: 60, siteYKm: 40, vulnerabilityClassCode: VULNERABILITY_CLASS_CODE.LOW } }),
  ];
  for (const siteId of siteIds) graph.addRelationship(sourceId, siteId, 'shakes');
  return { graph, sourceId, siteIds, coupling: buildSeismicShakingCoupling() };
}
