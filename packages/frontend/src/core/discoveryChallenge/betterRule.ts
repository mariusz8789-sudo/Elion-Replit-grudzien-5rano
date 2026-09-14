import { preRegister, freeze, type FrozenProtocol } from '../agent/genesisAdjudicationProtocol';
import type { BetterRule, BaselineRecord, ChallengeCandidate } from './contracts';

/**
 * D-062 "BETTER THAN BASELINE" RULE — frozen BEFORE any result is seen
 * (brief §5). Every numeric term (`minObservations`, `minStrong`) is
 * INHERITED from an existing, already-sealed preregistration
 * (`LOWER_HARM_PREREGISTRATION.fingerprint` / `A2_PREREGISTRATION.fingerprint`,
 * recorded in `inheritedFrom` — see `orchestrator/d062Ports.ts`'s caller).
 * This module does not choose those numbers; it only freezes the
 * conjunction and evaluates it.
 */

export function buildBetterRule(
  baseline: BaselineRecord,
  minObservations: number,
  minStrong: number,
  safetyConditions: readonly string[],
  inheritedFrom: readonly string[],
): BetterRule {
  return Object.freeze({
    efficacyRelation: '>=' as const,
    harmRelation: '<' as const,
    minObservations,
    minStrong,
    safetyConditions,
    metricNames: Object.keys(baseline.knownOutcomeMetrics),
    inheritedFrom,
  });
}

export function freezeBetterRule(rule: BetterRule, subjectId: string, now: string): FrozenProtocol<BetterRule> {
  return freeze(
    preRegister({
      protocolId: 'CHALLENGE-BETTER-RULE',
      subjectId,
      question: 'candidate is better than baseline iff efficacy >= baseline AND harm < baseline AND evidence minimum clears',
      rule,
      declaredAt: now,
    }),
    now,
  );
}

export interface BetterEvaluation {
  readonly better: boolean;
  readonly reasons: readonly string[];
}

/**
 * Evaluated ONLY on the candidate's OWN real fields (`observationCount`,
 * `evidenceClass`) — never on the baseline's or on a caller-supplied
 * scalar. A candidate that has not itself accumulated the required
 * evidence does not clear this rule no matter how strong the baseline's
 * own evidence is.
 */
export function evaluateBetter(rule: BetterRule, baseline: BaselineRecord, c: ChallengeCandidate, strongCount: number): BetterEvaluation {
  const reasons: string[] = [];
  const baselineEfficacy = baseline.knownOutcomeMetrics['efficacy'];
  const baselineHarm = baseline.knownOutcomeMetrics['harm'];
  if (baselineEfficacy === undefined || baselineHarm === undefined) {
    return { better: false, reasons: ['baseline is missing efficacy/harm outcome metrics'] };
  }
  if (!(c.efficacy >= baselineEfficacy)) reasons.push(`efficacy ${c.efficacy.toFixed(4)} below frozen baseline ${baselineEfficacy.toFixed(4)}`);
  if (!(c.harm < baselineHarm)) reasons.push(`harm ${c.harm.toFixed(4)} not strictly lower than baseline ${baselineHarm.toFixed(4)}`);
  if (c.observationCount < rule.minObservations) reasons.push(`observations ${c.observationCount} < required ${rule.minObservations}`);
  if (strongCount < rule.minStrong) reasons.push(`strong-evidence observations ${strongCount} < required ${rule.minStrong}`);
  return { better: reasons.length === 0, reasons };
}
