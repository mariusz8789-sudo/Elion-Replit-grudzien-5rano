/**
 * OBJECTIVE REDUCER — the DECLARATION of how a run's outcome is measured.
 *
 * WHAT THIS FIXES. Every objective in this codebase was, structurally, "the
 * value of metric X on entity E at tick H": `discoveryLoop.ts`'s `objectiveAt`
 * and `decisionSupport.ts`'s `objectiveValueAt` are the same single scrub,
 * written twice. That is the right answer for "is the water lower at the end",
 * and it cannot express the questions an epidemic actually raises — the PEAK
 * infected count, the DAY the peak falls on, the TOTAL burden, the time until a
 * threshold is crossed. None of those live at one tick, and asking for them at
 * the horizon quietly answers a different question: by day 200 two SEIRD arms
 * have both burnt out to near zero, so the horizon reads "no difference" about
 * an intervention that halved the peak.
 *
 * WHY THE TYPE LIVES HERE AND THE EXECUTION DOES NOT. Declaring how an outcome
 * is measured is substrate-neutral — it belongs next to `FalsificationCriterion`,
 * which carries it, so a preregistered question states its measurement the same
 * way it states its relation. SCANNING a trajectory is not neutral: it needs a
 * `TemporalEngine`, which is WorldGraph-only, and `experimentFabric` must never
 * import `worldModel` (the dependency runs one way, and only one way). The scan
 * therefore lives in `worldModel/discovery/objectiveTrajectory.ts` and imports
 * this type, never the reverse.
 *
 * WHAT THIS DELIBERATELY IS NOT. Not a second Discovery engine, and not a
 * change to what a verdict means. A reducer decides WHICH TWO NUMBERS the
 * existing `evaluateTwoArmRelation` compares; that function already takes two
 * plain scalars and is untouched, as are the relation vocabulary, the belief
 * ladder and the round loop.
 *
 * PREREGISTRATION COMES FOR FREE. `FalsificationCriterion` is part of the
 * preregistered question, and `worldCounterfactualQuestionFingerprint` already
 * hashes that whole question. So a reducer cannot be chosen after seeing the
 * result any more than a relation can — no new fingerprinting code, and no new
 * way to HARK.
 *
 * WHY THESE FIVE AND NO MORE. Each answers a question a real Genesis domain has
 * asked. `MIN`/`ARGMIN` are their obvious mirror images and are NOT here:
 * nothing has needed them yet, and this repository already carries one
 * capability written against a shape nobody consumes
 * (`generateAlternativeHypotheses`). A sixth kind arrives with the domain that
 * needs it, not before.
 */

export const OBJECTIVE_REDUCER_CONTRACT_VERSION = '1.0.0';

export type ObjectiveReducer =
  /**
   * The value at the last scanned tick. The historical behaviour of every
   * objective in Genesis, and the default when a criterion declares nothing.
   * Reads exactly one tick — never a scan — so it stays byte-identical to the
   * single-tick readers it replaces, at the same cost.
   */
  | { readonly kind: 'AT_HORIZON' }
  /** The largest value reached anywhere in the scanned range. "Peak infected." */
  | { readonly kind: 'MAX' }
  /** The TICK the maximum falls on — a tick number, not a metric value. "Peak day." */
  | { readonly kind: 'ARGMAX' }
  /**
   * The sum of the per-tick samples. NOT a time integral: no `dt` factor is
   * applied, because nothing here is told one and inventing a quadrature rule
   * would be a physical claim with no basis. Two arms scanned over the same
   * tick range stay comparable — all a falsification relation needs — but the
   * number is not in physical units and must not be reported as if it were.
   */
  | { readonly kind: 'SUM' }
  /**
   * The first tick at which the metric crosses `threshold` in `direction`.
   * Null when it never crosses, which is a real answer and routes to the
   * existing INCONCLUSIVE path rather than to a fabricated tick.
   */
  | { readonly kind: 'FIRST_CROSSING'; readonly threshold: number; readonly direction: 'above' | 'below' };

export type ObjectiveReducerKind = ObjectiveReducer['kind'];

/** The default when a criterion declares no reducer: today's behaviour, named. */
export const AT_HORIZON: ObjectiveReducer = { kind: 'AT_HORIZON' };

/** What a reducer produced on ONE arm, with enough context to explain a null. */
export interface ObjectiveReduction {
  readonly reducerKind: ObjectiveReducerKind;
  readonly value: number | null;
  /** Ticks that yielded a finite number for this metric on this entity. */
  readonly samplesRead: number;
  readonly ticksScanned: number;
  /** Why `value` is null, when it is. Carried verbatim into the assessment message. */
  readonly reason: string | null;
}
