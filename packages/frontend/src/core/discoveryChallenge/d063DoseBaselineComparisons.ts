import { surpass2Observation, surpass2OutcomeTerms } from '../biotechData/surpass2DirectEvidence';
import { surpass2BaselineArmTitle, surpass2DoseStrata } from '../biotechData/d062SurpassDoseStrata';
import { D062_BASELINE, D062_BETTER_RULE } from '../orchestrator/d062Discovery';
import { compareAgainstBaseline, type BaselineComparisonRecord } from './baselineComparison';

/**
 * D-063 — THE REAL CALLER of `baselineComparison.ts`, on the real pinned
 * SURPASS-2 counts.
 *
 * `compareAgainstBaseline` is a primitive; a primitive nothing runs is the
 * `core/agent/domeWorld/` shape this repo's own `moduleReachability.test.ts`
 * exists to refuse. This module is its real consumer: for every dose stratum
 * D-062 already discovered (5/10/15 mg tirzepatide) it computes the real
 * candidate-vs-baseline risk ratio against the FROZEN semaglutide baseline
 * arm, on real arm-level counts from the same randomised trial.
 *
 * WHICH TERMS, AND WHY NOT A CHOSEN ONE. The term list is
 * `surpass2OutcomeTerms()` — the trial's OWN pre-defined ≥5% adverse-event
 * set, complete and in registry order. No term is selected, dropped or
 * reordered here, because "pick the outcome that makes the candidate look
 * good" is precisely the outcome-reporting bias a baseline comparison exists
 * to make impossible. A term is skipped ONLY when one of the two arms
 * reports zero events, where `compareCountedOutcomes` honestly returns no
 * risk ratio at all (a zero-event arm supports no interval; the skip is
 * reported in `skipped`, never silently absorbed).
 *
 * WHY EFFICACY IS ABSENT. SURPASS-2's efficacy endpoint is a CONTINUOUS
 * HbA1c mean change, not a counted outcome — it has no numerator/denominator
 * to build a risk ratio from. `compareAgainstBaseline` is therefore called
 * with no efficacy input and reports `efficacy: null`, exactly the honest
 * state its contract documents. D-062's own pipeline compares efficacy on
 * that separate continuous channel (`extractCandidateEfficacy`), unchanged.
 *
 * THIS DECIDES NOTHING. The D-062 verdict, the D-057 gate and the Recipe
 * Engine are untouched by this module; `runDiscoveryChallenge` never calls
 * it. It is a projection an auditor (and the panel) can read to see the
 * per-term arithmetic behind "is this dose safer than the baseline".
 */

export const D063_DOSE_BASELINE_COMPARISON_VERSION = '1.0.0';

export interface DoseTermComparison {
  readonly doseId: string;
  readonly doseMg: number;
  readonly armTitle: string;
  readonly term: string;
  readonly record: BaselineComparisonRecord;
}

export interface SkippedDoseTerm {
  readonly doseId: string;
  readonly term: string;
  readonly reason: string;
}

export interface DoseBaselineComparisonSet {
  readonly baselineArmTitle: string;
  readonly baselineId: string;
  readonly ruleMinObservations: number;
  readonly comparisons: readonly DoseTermComparison[];
  readonly skipped: readonly SkippedDoseTerm[];
}

/**
 * Real, computed, non-cherry-picked. Every returned record came out of the
 * unmodified Katz log-risk-ratio estimator via `compareAgainstBaseline`; the
 * baseline and the better-rule are D-062's own frozen ones, re-imported, not
 * re-declared.
 */
export function d063DoseBaselineComparisons(): DoseBaselineComparisonSet {
  const baselineArmTitle = surpass2BaselineArmTitle();
  const comparisons: DoseTermComparison[] = [];
  const skipped: SkippedDoseTerm[] = [];

  for (const stratum of surpass2DoseStrata()) {
    for (const term of surpass2OutcomeTerms()) {
      const exposed = surpass2Observation(term, stratum.armTitle);
      const reference = surpass2Observation(term, baselineArmTitle);
      if (exposed.numAffected === 0 || reference.numAffected === 0) {
        skipped.push({
          doseId: stratum.doseId,
          term,
          reason: `zero events in ${exposed.numAffected === 0 ? stratum.armTitle : baselineArmTitle} — no risk ratio is honestly computable`,
        });
        continue;
      }
      comparisons.push({
        doseId: stratum.doseId,
        doseMg: stratum.doseMg,
        armTitle: stratum.armTitle,
        term,
        record: compareAgainstBaseline({ candidateId: stratum.doseId, baseline: D062_BASELINE, rule: D062_BETTER_RULE, harm: { exposed, reference } }),
      });
    }
  }

  return Object.freeze({
    baselineArmTitle,
    baselineId: D062_BASELINE.baselineId,
    ruleMinObservations: D062_BETTER_RULE.minObservations,
    comparisons: Object.freeze(comparisons),
    skipped: Object.freeze(skipped),
  });
}

/**
 * The single worst (highest) harm risk ratio each dose carries across the
 * trial's own term set — the number a safety reviewer asks for first.
 * `null` for a dose whose every term was skipped for want of events.
 */
export function worstHarmPerDose(set: DoseBaselineComparisonSet): readonly { readonly doseId: string; readonly term: string; readonly riskRatio: number }[] {
  const byDose = new Map<string, { doseId: string; term: string; riskRatio: number }>();
  for (const c of set.comparisons) {
    const current = byDose.get(c.doseId);
    if (current === undefined || c.record.harm.riskRatio > current.riskRatio) {
      byDose.set(c.doseId, { doseId: c.doseId, term: c.term, riskRatio: c.record.harm.riskRatio });
    }
  }
  return Object.freeze([...byDose.values()]);
}
