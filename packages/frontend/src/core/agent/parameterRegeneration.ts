/**
 * PARAMETER REGENERATION — the missing half of `deriveAlternativeCriteria`,
 * named and measured (not yet wired) in `AUTONOMOUS_DISCOVERY_ROADMAP.md`
 * §10.3–10.5: MECHANISM revises after a clean falsification
 * (`worldCounterfactual.ts::deriveAlternativeCriteria`, wired into
 * `discoveryLoop.ts`'s round loop by P3); PARAMETER/CALIBRATION cannot —
 * measured across every real fixture checked, including total falsification,
 * the set of hypothesis ids that ever appears is EXACTLY the declared set.
 * When every candidate is falsified, `inquiryLoop.ts` and
 * `worldParameterCalibration.ts` can only say *"the real value is not among
 * the values anyone proposed"* and stop. This module is the honest mechanical
 * derivation that would let a PARAMETER-shaped loop propose ONE new candidate
 * instead — built standalone and unwired, the same order `competingModels.ts`,
 * `worldParameterCalibration.ts` and `mechanismInteraction.ts` were each
 * proven before any orchestrator or round-loop wiring.
 *
 * ## The one derivation this module will make, and the one it refuses
 *
 * PARAMETER hypotheses claim a VALUE, and a claimed value predicts a metric
 * through the real solver — never through a formula this module knows. So the
 * only honest derivation available without inventing a model is INTERPOLATION:
 * if the real observation falls BETWEEN two falsified hypotheses' own
 * predictions, linear interpolation between their CLAIMED VALUES, weighted by
 * how far the observation sits between their PREDICTIONS, proposes a new
 * claimed value — a mechanical reading of numbers already measured, not a
 * new physical model. `deriveAlternativeCriteria`'s own restraint is the
 * precedent: `RELATION_FLIP` and `TOLERANCE_WIDENED` are arithmetic on
 * real numbers, never a guess about the underlying mechanism.
 *
 * When the observation does NOT fall between any two falsified predictions —
 * every candidate over- or under-shot it in the SAME direction — this is
 * EXTRAPOLATION, not interpolation, and this module refuses rather than
 * guess how far past the declared range the real value sits. That refusal is
 * not a limitation to work around later: nothing in a single interpolation
 * step could honestly bound an extrapolated value, and inventing one would be
 * exactly the overclaim `deriveAlternativeCriteria` itself refuses when a
 * falsification is not clean.
 *
 * ## Scope this first increment does NOT cover, stated rather than faked
 *
 * `ParameterHypothesis.claimedValues` (`inquiryLoop.ts`) is a
 * `Record<string, number>` — the Arrhenius fixture claims TWO values at once
 * (`activationEnergyKJ`, `preExponentialLog10`). Interpolating a single
 * bracketing pair in a MULTI-dimensional claimed-value space is not a
 * well-defined mechanical reading the way a 1-D interpolation is — which
 * point along a 2-D line between two hypotheses is "the" interpolated one
 * depends on an assumption this module has no basis for. So this primitive is
 * declared and tested for the SINGLE-scalar case only
 * (`WorldParameterCalibration`'s own `claimedValue: number`, and any Fabric
 * system whose `claimedValues` carries exactly one key) — a real, current
 * limit of what can be derived honestly, not a stub standing in for the
 * general case. A multi-dimensional generator is genuinely harder work and is
 * not invented here to look more complete than it is.
 *
 * ## The anti-HARK guard, and why it needs no new field here
 *
 * `discoveryLoop.ts`'s `excludedStrengths` exists because a MECHANISM lever
 * can be re-tested at the SAME strength under a different criterion, so the
 * loop must be told explicitly which magnitudes would replay the falsifying
 * run. PARAMETER has no equivalent gap to guard: `inquiryLoop.ts`'s
 * `triedProbes` (and `worldParameterCalibration.ts`'s `tried` ticks) are
 * GLOBAL — once a setting is measured, `selectNextProbe` never offers it
 * again to ANY hypothesis, declared or derived. A derived candidate is
 * therefore structurally guaranteed its first test happens at an untried
 * setting, by the loop's own existing bookkeeping, with nothing new to add.
 */

export const PARAMETER_REGENERATION_CONTRACT_VERSION = '1.0.0';

/** One falsified hypothesis's own claimed value and its real prediction at the setting that falsified it. */
export interface FalsifiedParameterPoint {
  readonly hypothesisId: string;
  readonly claimedValue: number;
  readonly predicted: number;
}

export interface DerivedParameterCandidate {
  readonly contractVersion: string;
  /** The interpolated claimed value — a new candidate to preregister and test at an untried setting. */
  readonly claimedValue: number;
  /** The two falsified hypotheses the derivation bracketed between. */
  readonly lowerBound: FalsifiedParameterPoint;
  readonly upperBound: FalsifiedParameterPoint;
  /** Where the real observation sat between the two predictions, 0 = exactly at lowerBound's prediction, 1 = exactly at upperBound's. */
  readonly interpolationFraction: number;
  readonly rationale: string;
}

/**
 * Derives ONE new candidate claimed value from real falsified predictions
 * that bracket the real observation — or returns `null` when no pair
 * brackets it, refusing to extrapolate.
 *
 * `falsified` need not be sorted; every adjacent-by-prediction pair is
 * checked, not just the two nearest by claimed value, because a solver's
 * response need not be monotonic in the claimed value (and this module makes
 * no assumption that it is — it only ever interpolates between two points
 * whose OWN predictions actually bracket the real number).
 */
export function deriveInterpolatedParameterValue(
  falsified: readonly FalsifiedParameterPoint[],
  observed: number,
): DerivedParameterCandidate | null {
  for (let i = 0; i < falsified.length; i++) {
    for (let j = i + 1; j < falsified.length; j++) {
      const a = falsified[i]!;
      const b = falsified[j]!;
      if (a.predicted === b.predicted) continue; // no bracket: a degenerate pair brackets nothing
      const brackets = (a.predicted <= observed && observed <= b.predicted)
        || (b.predicted <= observed && observed <= a.predicted);
      if (!brackets) continue;
      const lowerBound = a.predicted <= b.predicted ? a : b;
      const upperBound = a.predicted <= b.predicted ? b : a;
      const interpolationFraction = (observed - lowerBound.predicted) / (upperBound.predicted - lowerBound.predicted);
      const claimedValue = lowerBound.claimedValue + interpolationFraction * (upperBound.claimedValue - lowerBound.claimedValue);
      return {
        contractVersion: PARAMETER_REGENERATION_CONTRACT_VERSION,
        claimedValue,
        lowerBound,
        upperBound,
        interpolationFraction,
        rationale: `The real observation (${observed}) falls between "${lowerBound.hypothesisId}"'s prediction (${lowerBound.predicted}, claimed value ${lowerBound.claimedValue}) and "${upperBound.hypothesisId}"'s prediction (${upperBound.predicted}, claimed value ${upperBound.claimedValue}) — linear interpolation at fraction ${interpolationFraction.toFixed(4)} proposes claimed value ${claimedValue} as an untested candidate, mechanically read from these two falsified measurements, not a new model.`,
      };
    }
  }
  return null;
}
