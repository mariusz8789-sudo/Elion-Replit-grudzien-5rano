/**
 * EARTHQUAKE MODULE — Damage Assessment stage (structural damage/casualty
 * disclosure, NOT a damage model).
 *
 * `ImpactResult` (earthquakeImpact.ts) answers "how strongly did the ground
 * shake at this site" — a hazard-intensity projection. It deliberately says
 * nothing about what a building actually DOES under that shaking: whether it
 * is damaged, how badly, whether it collapses, or whether anyone is hurt.
 * That is a fundamentally different, much harder scientific question
 * requiring inputs Genesis does not have:
 *
 *   - a building inventory with structural typology (system, era, code
 *     compliance, story count) per exposure site — `ExposureSite` carries
 *     only `assetLabel`/`vulnerabilityClass`/`x`/`y`;
 *   - calibrated fragility/vulnerability curves relating an engineering
 *     demand parameter to a probability of each damage state, reviewed
 *     against real damage/loss data (e.g. HAZUS-style curves) — Genesis has
 *     none, and `syntheticPeakGroundAcceleration` is explicitly uncalibrated
 *     (see earthquakeModel.ts);
 *   - engineering demand parameters beyond a single synthetic PGA value
 *     (e.g. spectral acceleration at the structure's period, duration,
 *     site-response amplification);
 *   - occupancy/population-at-time-of-event data and a casualty-given-damage
 *     relationship, for any casualty estimate;
 *   - a utility/transport network topology, for any infrastructure-cascade
 *     estimate;
 *   - domain-expert (structural engineer / seismologist) review of whatever
 *     model would consume the above, before its output could be labeled
 *     anything other than illustrative.
 *
 * None of this exists. `computeDamageAssessments` therefore returns, for
 * every site, a `DamageAssessment` whose `status` is unconditionally
 * `'NOT_MODELED'` — there is no branch, flag, or code path in this file that
 * can produce any other value. This is the honest alternative to inventing a
 * damage number: a structured, versioned, provenance-linked disclosure a
 * downstream consumer (e.g. a future Command Center panel or City3D overlay,
 * neither of which this file imports or knows about) can render truthfully
 * instead of assuming silence means "not applicable."
 */
import type { DamageAssessment, DamageAssessmentRequirement, HazardRun, ImpactResult } from '../contracts';
import { EARTHQUAKE_MODEL_VERSION } from './earthquakeModel';

export const EARTHQUAKE_DAMAGE_ASSESSMENT_MODEL_VERSION = 'earthquake-damage-not-modeled-v1';

/**
 * The concrete, named gap between what Genesis has today and a trustworthy
 * damage/casualty model — not a vague "more research needed" placeholder.
 * Frozen so no caller can mutate what this module discloses as missing.
 */
export const EARTHQUAKE_DAMAGE_REQUIRED_DATA: readonly DamageAssessmentRequirement[] = Object.freeze([
  Object.freeze({
    requirement: 'building-inventory-with-structural-typology',
    rationale: 'ExposureSite carries only assetLabel/vulnerabilityClass/x/y — no structural system, construction era, code-compliance status, or story count, so no fragility function could even be selected per site.',
  }),
  Object.freeze({
    requirement: 'calibrated-fragility-or-vulnerability-curves',
    rationale: 'No engineering-demand-parameter -> damage-state relationship calibrated against real damage/loss data exists in Genesis; syntheticPeakGroundAcceleration is explicitly a non-calibrated illustrative attenuation, not a validated ground-motion prediction equation.',
  }),
  Object.freeze({
    requirement: 'engineering-demand-parameters-beyond-single-pga-value',
    rationale: 'Structural damage estimation typically needs spectral acceleration/displacement at the structure\'s own period, shaking duration, and site-response amplification — this module outputs one synthetic peak-ground-acceleration scalar per site.',
  }),
  Object.freeze({
    requirement: 'occupancy-and-casualty-model',
    rationale: 'No population/occupancy-at-time-of-event data or casualty-given-damage-state relationship exists; SYNTHETIC_EXPOSURE_SITES carries no occupancy field at all.',
  }),
  Object.freeze({
    requirement: 'infrastructure-network-topology',
    rationale: 'No utility/transport network graph or interdependency model exists in Genesis to assess cascading infrastructure damage.',
  }),
  Object.freeze({
    requirement: 'domain-expert-review',
    rationale: 'Even given all of the above, a structural-engineer/seismologist-reviewed damage model would be required before any output could be labeled as anything other than NOT_MODELED.',
  }),
]);

const NOT_MODELED_REASON =
  'Genesis has no calibrated fragility/vulnerability model, no building inventory, no occupancy data and no domain-expert-reviewed damage model. '
  + 'A structural-damage, collapse, casualty, or infrastructure-damage claim cannot be honestly derived from the existing ground-shaking ImpactResult alone.';

function damageAssessmentId(hazardRunId: string, siteId: string): string {
  return `damage_${hazardRunId}_${siteId}`;
}

/**
 * One `DamageAssessment` per `ImpactResult`, always `status: 'NOT_MODELED'`.
 * Pure and deterministic: given the same run and impacts, produces byte-identical
 * output every time — no randomness, no wall-clock, no I/O.
 */
export function computeDamageAssessments(run: HazardRun, impacts: readonly ImpactResult[]): readonly DamageAssessment[] {
  return impacts.map((impact) => Object.freeze({
    damageAssessmentId: damageAssessmentId(run.hazardRunId, impact.siteId),
    hazardRunId: run.hazardRunId,
    impactResultId: impact.impactResultId,
    siteId: impact.siteId,
    status: 'NOT_MODELED' as const,
    notModeledReason: NOT_MODELED_REASON,
    requiredData: EARTHQUAKE_DAMAGE_REQUIRED_DATA,
    datasetStatus: 'NOT_MODELED' as const,
    provenance: Object.freeze({ hazardRunId: run.hazardRunId, hazardModuleVersion: EARTHQUAKE_MODEL_VERSION }),
  }));
}
