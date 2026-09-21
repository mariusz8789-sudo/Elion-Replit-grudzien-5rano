import { compareCountedOutcomes, classifyComparisonEvidenceClass, DEFAULT_EVIDENCE_CLASS_RANK, type CountedOutcomeObservation, type RiskRatioComparison, type EvidenceClass } from '../agent/evidenceProvenance';
import { fnv1a, canonicalJson } from '../events/hash';
import type { EvidenceInventoryItem } from '../orchestrator/winnerGate';
import type { BaselineRecord, BetterRule } from './contracts';

/**
 * D-063 — THE REAL CANDIDATE-VS-BASELINE COMPARISON PRIMITIVE.
 *
 * D-062's own pipeline already achieves this property end to end (real
 * `A2CandidateReport`s built for every candidate, `scoreCandidate`'s real
 * "vs semaglutide" scores, `execute()`'s real per-candidate observationCount
 * feeding the D-057 gate — see `orchestrator/d062Ports.ts`'s module header).
 * This module extracts the underlying primitive as its own explicit,
 * reusable, independently-tested function, for any FUTURE domain that
 * needs "does candidate X beat baseline B on a counted outcome" without
 * building a whole `A2CandidateReport`-shaped bundle to get there.
 *
 * ZERO NEW SCIENCE. `compareCountedOutcomes` (the real Katz log-risk-ratio
 * estimator) and `classifyComparisonEvidenceClass` (the real
 * same-trial-vs-different-trial computed classification) are called
 * UNMODIFIED. This file only assembles their output into the two shapes a
 * caller actually needs: a `BetterRule` evaluation input, and a real
 * `EvidenceInventoryItem[]` for `winnerGate.ts::canPromoteToWinnerRecord`.
 *
 * REAL CONTRACT, NOT THE STUBBED ONE. An earlier delivery of this module
 * assumed a `{events, total}` "CountArm" shape and cast it `as never` into
 * `compareCountedOutcomes` — that function's real parameter is
 * `CountedOutcomeObservation` (`study`, `arm`, `term`, `numAffected`,
 * `numAtRisk`, `codingSystem`, `population`), and its own `assertObservation`
 * guard reads `study.studyId`, `arm.groupId`, `arm.nAtRisk` and would throw
 * on a bare `{events,total}` object at runtime — a cast compiles, it does not
 * make the shape real. This version takes real `CountedOutcomeObservation`s.
 */

export interface CountedComparisonInput {
  readonly exposed: CountedOutcomeObservation;
  readonly reference: CountedOutcomeObservation;
}

export interface BaselineComparisonRecord {
  readonly candidateId: string;
  readonly baselineId: string;
  /** The counted-outcome comparison this challenge's harm axis is defined over (e.g. an adverse-event term). Required — "harm" cannot be asserted without one. */
  readonly harm: RiskRatioComparison;
  /** A counted-outcome comparison for the efficacy axis (e.g. "% achieving target"), when the domain has one. `null` means efficacy is compared on a separate (e.g. continuous-mean) channel this module does not touch. */
  readonly efficacy: RiskRatioComparison | null;
  /** The WEAKER of the two axes' computed evidence classes — never the stronger one "borrowed" across axes. */
  readonly evidenceClass: EvidenceClass;
  readonly observationCount: number;
  readonly betterPerFrozenRule: boolean;
  readonly ruleReasons: readonly string[];
  readonly fingerprint: string;
}

const weaker = (a: EvidenceClass, b: EvidenceClass): EvidenceClass => (DEFAULT_EVIDENCE_CLASS_RANK[a] <= DEFAULT_EVIDENCE_CLASS_RANK[b] ? a : b);

/**
 * Real, computed, fail-closed. Throws (never fabricates) if either
 * observation is malformed (`compareCountedOutcomes`'s own `assertObservation`
 * guard) or effectively empty; returns `null` HARM comparisons are refused
 * outright (harm is the axis this function exists to establish) while a
 * `null` efficacy comparison (zero events either side) is reported honestly
 * as `efficacy: null` rather than thrown, since a genuinely rare efficacy
 * event is real data, not a malformed input.
 */
export function compareAgainstBaseline(args: {
  readonly candidateId: string;
  readonly baseline: BaselineRecord;
  readonly rule: BetterRule;
  readonly harm: CountedComparisonInput;
  readonly efficacy?: CountedComparisonInput;
}): BaselineComparisonRecord {
  const harmComparison = compareCountedOutcomes(args.harm.exposed, args.harm.reference);
  if (harmComparison === null) {
    throw new Error('FAIL_CLOSED[MISSING_EXPERIMENT_RESULT]: the harm comparison has zero events on one side — no risk ratio can be honestly computed.');
  }

  const efficacyComparison = args.efficacy === undefined ? null : compareCountedOutcomes(args.efficacy.exposed, args.efficacy.reference);

  const harmClass = classifyComparisonEvidenceClass(args.harm.exposed, args.harm.reference);
  const efficacyClass = args.efficacy === undefined ? null : classifyComparisonEvidenceClass(args.efficacy.exposed, args.efficacy.reference);
  const evidenceClass = efficacyClass === null ? harmClass : weaker(harmClass, efficacyClass);

  const observationCount = harmComparison.totalEvents + (efficacyComparison?.totalEvents ?? 0);

  const reasons: string[] = [];
  // Harm axis: lower risk ratio is better — the frozen rule's harmRelation ('<') means strictly below 1 (candidate carries less harm than baseline).
  if (!(harmComparison.riskRatio < 1)) reasons.push(`harm risk ratio ${harmComparison.riskRatio.toFixed(4)} not strictly below the baseline (frozen rule: harm < baseline)`);
  // Efficacy axis (when present): higher rate-ratio is better — the frozen rule's efficacyRelation ('>=') means at or above 1 (candidate retains at least the baseline's rate).
  if (efficacyComparison !== null && !(efficacyComparison.riskRatio >= 1)) {
    reasons.push(`efficacy rate ratio ${efficacyComparison.riskRatio.toFixed(4)} below the baseline (frozen rule: efficacy >= baseline)`);
  }
  if (observationCount < args.rule.minObservations) reasons.push(`observations ${observationCount} < required ${args.rule.minObservations}`);

  const record: Omit<BaselineComparisonRecord, 'fingerprint'> = {
    candidateId: args.candidateId,
    baselineId: args.baseline.baselineId,
    harm: harmComparison,
    efficacy: efficacyComparison,
    evidenceClass,
    observationCount,
    betterPerFrozenRule: reasons.length === 0,
    ruleReasons: reasons,
  };
  return { ...record, fingerprint: fnv1a(canonicalJson(record)) };
}

/**
 * The real, non-inflated D-057 inventory this comparison's OWN evidence
 * supports — one item, the WEAKER-axis evidence class, the TOTAL real event
 * count across both axes. Never the baseline's own evidence class or a
 * caller-supplied scalar (the exact D-059 mistake this module's own history
 * refuses to repeat).
 */
export function toPromotionInventory(c: BaselineComparisonRecord): readonly EvidenceInventoryItem[] {
  return Object.freeze([{ evidenceClass: c.evidenceClass, observationCount: c.observationCount }]);
}
