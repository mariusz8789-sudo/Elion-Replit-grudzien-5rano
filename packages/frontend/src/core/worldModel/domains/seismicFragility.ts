/**
 * PHASE 8.3 — SEISMIC FRAGILITY: the machinery, and an honestly empty catalogue.
 *
 * The task was to find REAL published fragility functions and implement a real
 * damage assessment, with a standing instruction: after three genuine attempts,
 * document precisely what is missing rather than guess curves. Three attempts
 * were made. All three failed, for two different reasons, and the second reason
 * matters more than the first.
 *
 * ## Attempt 1 — FEMA Hazus, the authoritative and public-domain source
 *
 * The Hazus Earthquake Model Technical Manual (6.1, July 2024) contains the
 * structural fragility tables, and as a US federal work it carries no licensing
 * obstacle. `https://www.fema.gov/sites/default/files/documents/fema_hazus-earthquake-model-technical-manual-6-1.pdf`
 * is **blocked by this environment's network egress proxy** (EGRESS_BLOCKED on
 * www.fema.gov). The numbers were not obtainable here.
 *
 * ## Attempt 2 — GEM Global Vulnerability Model, the open global set
 *
 * `github.com/gem/global_vulnerability_model` is real, comprehensive (1000+
 * building classes) and downloadable, but licensed **CC BY-NC-SA 4.0**. The
 * NonCommercial clause makes vendoring it into this repository a licensing
 * problem, not a technical one. Rejected deliberately rather than quietly used.
 *
 * ## Attempt 3 — third-party reproductions, and the finding that actually blocks this
 *
 * Partial values are reachable second-hand (e.g. lanl-ansi/generalized-fragility-model
 * quotes Hazus table 5.9a: W1M extensive 5.04, beta 0.85; C1M 9.0, beta 0.68;
 * S2M 10.8, beta 0.68) — one damage state, three classes, no repository licence
 * visible. Too partial to build on, but enough to confirm the real blocker:
 *
 * > **Hazus building fragility is indexed on SPECTRAL DISPLACEMENT, not PGA.**
 *
 * Reaching a spectral displacement needs a capacity curve for the building type
 * and a demand spectrum — spectral accelerations at ~0.3 s and ~1.0 s —
 * intersected by the capacity-spectrum method. This world model produces **one
 * synthetic, explicitly non-calibrated PGA** (`hazard/earthquake/earthquakeModel.ts`
 * says so itself). Feeding a real fragility curve from that number would require
 * inventing a spectral shape to convert PGA into Sd — a second fabrication
 * layered on an already-uncalibrated input, and the result would carry the
 * authority of a published curve while resting on neither real ground motion nor
 * a real conversion. That is exactly the failure this consolidation exists to
 * prevent, so it was not done.
 *
 * ## What this file therefore is
 *
 * The **machinery**, with **no parameters built in**. The lognormal exceedance
 * function is a mathematical definition, not data, so implementing it invents
 * nothing. Everything that would be data — medians, betas, building classes — is
 * absent, and `FRAGILITY_MODELS` is deliberately empty.
 *
 * A `FragilityModel` cannot exist without a citation and a licence, and cannot be
 * evaluated against an intensity measure it was not derived for. That last check
 * is tonight's finding turned into code: a PGA-indexed hazard handed to an
 * Sd-indexed curve is refused, not silently unit-matched. The day a real,
 * appropriately-licensed set arrives with a hazard model that produces the right
 * intensity measure, registering it is all that is required — and until then the
 * refusal states which of the two is missing.
 */

/**
 * What a fragility function is conditioned on. Keeping these distinct is the
 * whole point: they are not interchangeable, and silently treating one as
 * another is how a damage number acquires unearned authority.
 */
export const INTENSITY_MEASURE = {
  /** Peak ground acceleration, g. What this world model's hazard side produces. */
  PGA_G: 'PGA_G',
  /** 5%-damped spectral acceleration at 0.3 s, g. */
  SA_03S_G: 'SA_03S_G',
  /** 5%-damped spectral acceleration at 1.0 s, g. */
  SA_10S_G: 'SA_10S_G',
  /** Spectral displacement, inches. What Hazus building fragility actually uses. */
  SD_IN: 'SD_IN',
  /** Peak ground velocity, cm/s. */
  PGV_CMS: 'PGV_CMS',
  /** Permanent ground displacement, inches — ground-failure fragility. */
  PGD_IN: 'PGD_IN',
} as const;
export type IntensityMeasure = (typeof INTENSITY_MEASURE)[keyof typeof INTENSITY_MEASURE];

/** Damage states, in the conventional Hazus ordering. Ordinal: each implies the ones below it. */
export const DAMAGE_STATE = { NONE: 0, SLIGHT: 1, MODERATE: 2, EXTENSIVE: 3, COMPLETE: 4 } as const;
export type DamageStateCode = (typeof DAMAGE_STATE)[keyof typeof DAMAGE_STATE];

export const DAMAGE_STATE_LABELS = ['DAMAGE_NONE', 'DAMAGE_SLIGHT', 'DAMAGE_MODERATE', 'DAMAGE_EXTENSIVE', 'DAMAGE_COMPLETE'] as const;
export type DamageStateLabel = (typeof DAMAGE_STATE_LABELS)[number];

/** Total function: an out-of-range code still lands inside the allowlist. */
export function damageStateLabel(code: number): DamageStateLabel {
  return DAMAGE_STATE_LABELS[code] ?? 'DAMAGE_NONE';
}

/**
 * One curve: the probability of reaching or exceeding `damageState` as a
 * lognormal function of the intensity measure.
 */
export interface FragilityFunction {
  readonly damageState: DamageStateCode;
  /** Median intensity at which this damage state is reached, in the model's own intensity measure units. */
  readonly medianIM: number;
  /** Lognormal standard deviation (beta) of the natural log of the intensity. */
  readonly betaLn: number;
}

/**
 * A set of curves for one building class.
 *
 * `citation` and `license` are REQUIRED and are checked at registration, not
 * documented and hoped for: an uncited fragility set is indistinguishable from
 * an invented one once it is in the code, which is precisely the situation this
 * file exists to prevent.
 */
export interface FragilityModel {
  readonly id: string;
  /** e.g. a Hazus class such as 'W1' or 'C1M'. Free-form, since taxonomies differ between sources. */
  readonly buildingClass: string;
  readonly intensityMeasure: IntensityMeasure;
  /** Where these numbers come from, specifically enough to check. */
  readonly citation: string;
  /** The licence they are usable under. */
  readonly license: string;
  readonly functions: readonly FragilityFunction[];
}

/**
 * **Deliberately empty.** See the module doc: no fragility set was obtainable
 * here that was both licence-compatible and indexed on an intensity measure this
 * world model actually produces. It is empty rather than seeded with plausible
 * numbers, and a test asserts it stays empty until a real, cited, licensed set is
 * added — so filling it is a visible decision rather than a drift.
 */
export const FRAGILITY_MODELS: readonly FragilityModel[] = Object.freeze([]);

/** Exactly what is missing, named — not "more research needed". */
export const FRAGILITY_REQUIRED_DATA: readonly { requirement: string; rationale: string }[] = Object.freeze([
  Object.freeze({
    requirement: 'a licence-compatible published fragility set',
    rationale: 'FEMA Hazus (public domain, authoritative) is unreachable from this environment: fema.gov is blocked by the network egress proxy. The GEM Global Vulnerability Model is reachable and comprehensive but CC BY-NC-SA 4.0, whose NonCommercial clause rules out vendoring it here.',
  }),
  Object.freeze({
    requirement: 'a ground-motion model producing the intensity measure the curves need',
    rationale: 'Hazus building fragility is conditioned on SPECTRAL DISPLACEMENT. This world model produces a single synthetic, explicitly non-calibrated PGA. Converting one to the other needs a capacity curve plus a demand spectrum (Sa at ~0.3 s and ~1.0 s) via the capacity-spectrum method — none of which exists here, and inventing a spectral shape to bridge the gap would fabricate the answer.',
  }),
  Object.freeze({
    requirement: 'a calibrated GMPE rather than the synthetic attenuation',
    rationale: 'Even with real curves and the right intensity measure, a damage probability computed from a non-calibrated attenuation inherits that non-calibration. `assessDamage` therefore reports the grounding of the WEAKEST link in the chain, never the grounding of the curve alone.',
  }),
  Object.freeze({
    requirement: 'a building inventory with structural typology per exposure site',
    rationale: 'A fragility set is selected per building class (system, era, code level, storeys). Structural sites here carry only a coarse vulnerability class, which is not enough to pick a curve.',
  }),
]);

/**
 * Standard normal CDF, via the Zelen & Severo rational approximation
 * (Abramowitz & Stegun 26.2.17, |error| < 7.5e-8). A mathematical function, not
 * domain data — implementing it invents nothing.
 */
export function standardNormalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/**
 * P(damage >= ds | IM) = Phi( ln(IM / median) / beta ).
 *
 * The standard lognormal fragility form. Zero or negative intensity gives 0 —
 * no shaking, no damage — rather than -Infinity from the logarithm.
 */
export function exceedanceProbability(fn: FragilityFunction, intensity: number): number {
  if (!Number.isFinite(intensity) || intensity <= 0) return 0;
  if (!(fn.medianIM > 0) || !(fn.betaLn > 0)) return 0;
  return standardNormalCdf(Math.log(intensity / fn.medianIM) / fn.betaLn);
}

export type DamageAssessment =
  | {
    readonly ok: true;
    /** P(damage >= ds), one per curve, in ascending damage-state order. */
    readonly exceedance: readonly { damageState: DamageStateCode; probability: number }[];
    /** P(damage == ds) — the differences between successive exceedances, which is what sums to 1. */
    readonly discrete: readonly { damageState: DamageStateCode; probability: number }[];
    readonly modelId: string;
    readonly citation: string;
    /** The weakest link in the chain, never the curve's own tier alone. */
    readonly grounding: 'MODEL_ESTIMATE' | 'UNGROUNDED_APPROXIMATION';
  }
  | { readonly ok: false; readonly reason: string };

export interface DamageAssessmentRequest {
  readonly model: FragilityModel;
  /** What the hazard model actually produced. */
  readonly hazardIntensityMeasure: IntensityMeasure;
  readonly hazardIntensity: number;
  /**
   * Whether the ground motion came from a calibrated model. False for this
   * world's synthetic attenuation, and that is what holds the result at
   * `UNGROUNDED_APPROXIMATION` no matter how good the curve is.
   */
  readonly hazardCalibrated: boolean;
}

/**
 * Evaluates a fragility model against a hazard intensity, or refuses and says
 * why. The refusals are the useful part today.
 */
export function assessDamage(request: DamageAssessmentRequest): DamageAssessment {
  const { model, hazardIntensityMeasure, hazardIntensity, hazardCalibrated } = request;

  // The check that encodes tonight's finding. A PGA handed to a curve derived for
  // spectral displacement is not a unit conversion away from correct — it is a
  // different physical quantity, and bridging it needs a capacity curve and a
  // demand spectrum that do not exist here.
  if (model.intensityMeasure !== hazardIntensityMeasure) {
    return {
      ok: false,
      reason: `intensity_measure_mismatch: fragility model '${model.id}' is conditioned on ${model.intensityMeasure}, but the hazard model produced ${hazardIntensityMeasure}. Converting between them requires a capacity curve and a demand spectrum, neither of which exists here; assuming a spectral shape would fabricate the result.`,
    };
  }
  if (model.functions.length === 0) {
    return { ok: false, reason: `empty_fragility_model: '${model.id}' declares no damage-state curves.` };
  }

  const ordered = [...model.functions].sort((a, b) => a.damageState - b.damageState);
  const exceedance = ordered.map((fn) => ({ damageState: fn.damageState, probability: exceedanceProbability(fn, hazardIntensity) }));

  // P(exactly ds) = P(>= ds) - P(>= next ds). Clamped at zero: a non-monotone
  // curve set (a real data-entry error) must not produce a negative probability.
  const discrete = exceedance.map((entry, i) => ({
    damageState: entry.damageState,
    probability: Math.max(0, entry.probability - (exceedance[i + 1]?.probability ?? 0)),
  }));

  return {
    ok: true,
    exceedance,
    discrete,
    modelId: model.id,
    citation: model.citation,
    // Weakest link. A published curve does not launder an uncalibrated input.
    grounding: hazardCalibrated ? 'MODEL_ESTIMATE' : 'UNGROUNDED_APPROXIMATION',
  };
}

/**
 * The registry a real, cited, licensed set would be added to. Registration is
 * validated rather than trusted: a model without a citation or a licence, or
 * with a non-positive median or beta, is rejected — because once a number is in
 * the code an uncited one is indistinguishable from an invented one.
 */
export class FragilityRegistry {
  private readonly models = new Map<string, FragilityModel>();

  constructor(models: readonly FragilityModel[] = FRAGILITY_MODELS) {
    for (const model of models) this.register(model);
  }

  register(model: FragilityModel): void {
    if (!model.citation.trim()) throw new Error(`FragilityRegistry: '${model.id}' has no citation. An uncited fragility set is indistinguishable from an invented one.`);
    if (!model.license.trim()) throw new Error(`FragilityRegistry: '${model.id}' has no license. Published fragility data carries licensing terms that must travel with it.`);
    if (model.functions.length === 0) throw new Error(`FragilityRegistry: '${model.id}' declares no damage-state curves.`);
    for (const fn of model.functions) {
      if (!(fn.medianIM > 0)) throw new Error(`FragilityRegistry: '${model.id}' damage state ${fn.damageState} has a non-positive median intensity.`);
      if (!(fn.betaLn > 0)) throw new Error(`FragilityRegistry: '${model.id}' damage state ${fn.damageState} has a non-positive beta.`);
    }
    this.models.set(model.id, model);
  }

  get(id: string): FragilityModel | undefined {
    return this.models.get(id);
  }

  /** Models usable against a given hazard intensity measure — empty today, and honestly so. */
  forIntensityMeasure(im: IntensityMeasure): readonly FragilityModel[] {
    return [...this.models.values()].filter((model) => model.intensityMeasure === im);
  }

  get size(): number {
    return this.models.size;
  }
}

/**
 * The one call the seismic domain makes. With an empty catalogue it returns a
 * refusal naming what is missing — which is why structural damage still reports
 * NOT_MODELLED, now for a checked reason rather than a hardcoded constant.
 */
export function assessStructuralDamage(
  registry: FragilityRegistry,
  buildingClass: string,
  hazardIntensityMeasure: IntensityMeasure,
  hazardIntensity: number,
  hazardCalibrated: boolean,
): DamageAssessment {
  const candidates = registry.forIntensityMeasure(hazardIntensityMeasure).filter((model) => model.buildingClass === buildingClass);
  if (candidates.length === 0) {
    const usable = registry.forIntensityMeasure(hazardIntensityMeasure).length;
    return {
      ok: false,
      reason: registry.size === 0
        ? `no_fragility_model_available: the fragility catalogue is empty. Missing: ${FRAGILITY_REQUIRED_DATA.map((r) => r.requirement).join('; ')}.`
        : `no_fragility_model_for_class: no model for building class '${buildingClass}' conditioned on ${hazardIntensityMeasure} (${usable} model(s) exist for that intensity measure, none for this class).`,
    };
  }
  return assessDamage({ model: candidates[0], hazardIntensityMeasure, hazardIntensity, hazardCalibrated });
}
