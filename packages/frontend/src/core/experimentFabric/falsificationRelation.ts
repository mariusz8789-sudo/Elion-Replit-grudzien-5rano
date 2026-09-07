import type { FalsificationCriterion } from './scientificDiscovery';

/**
 * TWO-ARM FALSIFICATION RELATION — the one place a preregistered criterion is
 * decided against a baseline/variant pair.
 *
 * A `FalsificationCriterion` is evaluated in two genuinely different settings
 * in this codebase, and they are not interchangeable:
 *
 *   - TWO ARMS, ONE VALUE EACH — a baseline number and a variant number.
 *     `discovery/discoveryConclusion.ts` does this, and so does the
 *     world-model counterfactual layer: a branch diff yields exactly one
 *     baseline scalar and one intervention scalar per metric. That is what
 *     this module decides.
 *
 *   - A SERIES OF ARMS WITH REPETITIONS — `experimentFabric/scientificExecutor.ts`
 *     takes the MEAN of each arm's repetitions and can evaluate a whole sweep,
 *     so it supports the monotonic relations this module must refuse. It is
 *     deliberately NOT folded in here: collapsing repetitions to a mean is a
 *     methodological choice belonging to that protocol, not a shared primitive.
 *
 * Nothing here decides a verdict about the world. It reports whether real
 * numbers met a criterion that was declared before the numbers existed.
 */

/**
 * Relations that need a series of points to mean anything. With two arms
 * there is no ordering to be monotonic along, so the honest answer is "not
 * applicable", never a `met: false` that would read as a falsification.
 */
export const SERIES_ONLY_RELATIONS: readonly FalsificationCriterion['relation'][] = [
  'monotonic-increase',
  'monotonic-decrease',
];

export interface TwoArmRelationOutcome {
  /**
   * False when the relation cannot be decided from two arms at all — a
   * series-only relation, or a criterion missing the tolerance it requires.
   * `met` is then meaningless and must not be read as a falsification.
   */
  readonly applicable: boolean;
  readonly met: boolean;
  /** The value the variant was actually compared against. */
  readonly reference: number;
  readonly explanation: string;
}

/**
 * Decides `criterion` against one baseline value and one variant value.
 *
 * When the criterion declares no `expectedValue`, the baseline itself is the
 * reference — the criterion is then a statement about the DIRECTION of the
 * change, which is exactly what a counterfactual pair can support.
 */
export function evaluateTwoArmRelation(
  criterion: FalsificationCriterion,
  baseline: number,
  variant: number,
): TwoArmRelationOutcome {
  if (SERIES_ONLY_RELATIONS.includes(criterion.relation)) {
    return {
      applicable: false,
      met: false,
      reference: baseline,
      explanation: `Relacja „${criterion.relation}" wymaga serii punktów (sweepu), a nie porównania dwóch ramion.`,
    };
  }
  const reference = criterion.expectedValue ?? baseline;
  const referenceLabel = criterion.expectedValue === undefined ? 'wartości bazowej' : String(criterion.expectedValue);
  switch (criterion.relation) {
    case 'greater-than':
      return {
        applicable: true,
        met: variant > reference,
        reference,
        explanation: `Wariant ${variant} wobec ${referenceLabel} (${reference}): oczekiwano większej wartości.`,
      };
    case 'less-than':
      return {
        applicable: true,
        met: variant < reference,
        reference,
        explanation: `Wariant ${variant} wobec ${referenceLabel} (${reference}): oczekiwano mniejszej wartości.`,
      };
    case 'equal-within-tolerance': {
      if (criterion.tolerance === undefined) {
        return {
          applicable: false,
          met: false,
          reference,
          explanation: 'Kryterium równości wymaga prerejestrowanej tolerancji.',
        };
      }
      const diff = Math.abs(variant - reference);
      return {
        applicable: true,
        met: diff <= criterion.tolerance,
        reference,
        explanation: `|${variant} − ${reference}| = ${diff}; tolerancja ${criterion.tolerance}.`,
      };
    }
    default:
      return {
        applicable: false,
        met: false,
        reference,
        explanation: `Nieobsługiwana relacja „${criterion.relation}".`,
      };
  }
}
