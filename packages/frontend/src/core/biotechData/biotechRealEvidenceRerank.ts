import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { PredictionVerification } from '../agent/predictionVerification';
import type { CandidateDiscoveryReport } from '../biotechDiscoveryContract';

/**
 * REAL-EVIDENCE-DRIVEN RERANK — the missing loop closure.
 *
 * Genesis already has a fully built, tested comparator for judging a
 * prediction against a real or cited measurement —
 * `verifyPredictionAgainstRealExperiment` (`core/agent/predictionVerification.ts`)
 * — and Dome World already consumes it autonomously. What was missing: that
 * verdict never fed back into candidate ranking (`CandidateRanking` in
 * `core/biotechDiscoveryContract.ts`) or into which candidate gets pursued
 * next. A candidate with a high simulated `score` could still be recommended
 * even after real/cited evidence had falsified it.
 *
 * This module closes exactly that gap, and nothing more: it does not compute
 * `PredictionVerification` (the caller supplies it, already computed by the
 * existing comparator), does not invent a new status vocabulary (reuses
 * `HypothesisAssessment` verbatim, the same discipline `cyberTestPlanner.ts`
 * and `substitutionPlanner.ts` already follow), and never modifies a
 * `CandidateDiscoveryReport` or its `ranking` — both are read-only inputs.
 */

export type RealEvidenceRecommendation = 'PROMOTE' | 'KEEP' | 'DROP';

export interface RealEvidenceRerankResult {
  readonly candidateId: string;
  readonly reportId: string;
  /** `report.ranking?.score` — read only, never modified. `null` when the report carries no ranking. */
  readonly simulatedScore: number | null;
  /** The real/cited evidence's own assessment for this candidate, if any exists yet. */
  readonly realAssessment: HypothesisAssessment | null;
  readonly recommendation: RealEvidenceRecommendation;
  readonly why: string;
}

/**
 * Reranks candidates by folding in real/cited evidence, one candidate at a
 * time, from a caller-supplied map of already-computed `PredictionVerification`
 * results (keyed by `candidateId`).
 *
 * Rules (none negotiable — this is the same "never fabricate a result"
 * discipline `substitutionInvestigation.ts` already documents):
 *  - No entry in `realEvidence` for a candidate: `realAssessment: null`,
 *    `recommendation: 'KEEP'` — the simulated ranking stands unchanged
 *    because no real evidence has arrived yet.
 *  - `assessment === 'FALSIFIED_WITHIN_PROTOCOL'`: ALWAYS `'DROP'`,
 *    regardless of how high `simulatedScore` was. Real/cited falsifying
 *    evidence beats a simulated score unconditionally — this is never
 *    averaged away, and applies even when the report carries no `ranking`
 *    at all (falsification does not require a prior simulated score to be
 *    valid).
 *  - `assessment === 'SUPPORTED_WITHIN_PROTOCOL'`: `'PROMOTE'`.
 *  - `assessment === 'INCONCLUSIVE'`: `'KEEP'` — the evidence didn't
 *    resolve anything, same as having none.
 */
export function rerankWithRealEvidence(
  reports: readonly CandidateDiscoveryReport[],
  realEvidence: ReadonlyMap<string, PredictionVerification>,
): readonly RealEvidenceRerankResult[] {
  return reports.map((report): RealEvidenceRerankResult => {
    const simulatedScore = report.ranking?.score ?? null;
    const verification = realEvidence.get(report.candidateId);

    if (verification === undefined) {
      return {
        candidateId: report.candidateId, reportId: report.reportId, simulatedScore,
        realAssessment: null, recommendation: 'KEEP',
        why: 'no real or cited evidence submitted for this candidate yet — simulated ranking stands unchanged',
      };
    }

    const { assessment, predictedValue, observedValue, criterion } = verification;
    const scoreNote = simulatedScore === null ? 'no simulatedScore (report carries no ranking)' : `despite simulatedScore=${simulatedScore}`;

    if (assessment === 'FALSIFIED_WITHIN_PROTOCOL') {
      return {
        candidateId: report.candidateId, reportId: report.reportId, simulatedScore,
        realAssessment: assessment, recommendation: 'DROP',
        why: `FALSIFIED_WITHIN_PROTOCOL: predicted=${predictedValue} observed=${observedValue ?? 'n/a'} (criterion metric=${criterion.metric}) — dropped ${scoreNote}`,
      };
    }
    if (assessment === 'SUPPORTED_WITHIN_PROTOCOL') {
      return {
        candidateId: report.candidateId, reportId: report.reportId, simulatedScore,
        realAssessment: assessment, recommendation: 'PROMOTE',
        why: `SUPPORTED_WITHIN_PROTOCOL: predicted=${predictedValue} observed=${observedValue ?? 'n/a'} (criterion metric=${criterion.metric}) — promoted ${scoreNote}`,
      };
    }
    return {
      candidateId: report.candidateId, reportId: report.reportId, simulatedScore,
      realAssessment: assessment, recommendation: 'KEEP',
      why: `${assessment}: the real/cited evidence did not resolve this candidate (predicted=${predictedValue}, observed=${observedValue ?? 'n/a'}) — treated the same as no evidence`,
    };
  });
}

export interface NextRealEvidenceSelection {
  readonly selectedCandidateId: string | null;
  readonly why: string;
  readonly whyNotAlternative: string;
}

/**
 * Adaptive selection: which candidate should get real/cited evidence
 * collected next. Eligible only if not already dropped, not already
 * resolved by evidence, and not already awaiting a request — spending
 * effort on a falsified or already-resolved candidate would not be
 * adaptive. Mirrors the exact selection pattern already accepted in
 * `cyberTestPlanner.ts::selectNextTest` and
 * `substitutionPlanner.ts::selectNextValidationCandidate`: highest score
 * wins, ties broken by `candidateId` for determinism.
 */
export function selectNextRealEvidenceCandidate(
  rerankResults: readonly RealEvidenceRerankResult[],
  alreadyRequested: ReadonlySet<string>,
): NextRealEvidenceSelection {
  const eligible = rerankResults.filter(
    (r) => r.recommendation !== 'DROP' && r.realAssessment === null && !alreadyRequested.has(r.candidateId),
  );
  if (eligible.length === 0) {
    const anyDropped = rerankResults.some((r) => r.recommendation === 'DROP');
    const anyResolved = rerankResults.some((r) => r.realAssessment !== null);
    const why = rerankResults.length === 0
      ? 'no candidates — nothing to select from'
      : anyDropped || anyResolved
        ? 'all qualifying candidates already have real evidence or an outstanding request; the rest are already dropped'
        : 'no candidates — all were dropped';
    return { selectedCandidateId: null, why, whyNotAlternative: 'n/a' };
  }
  const sorted = [...eligible].sort(
    (a, b) => (b.simulatedScore ?? 0) - (a.simulatedScore ?? 0) || a.candidateId.localeCompare(b.candidateId),
  );
  const best = sorted[0]!;
  const runner = sorted[1];
  return {
    selectedCandidateId: best.candidateId,
    why: `highest simulatedScore (${best.simulatedScore ?? 0}) among candidates without real evidence or an outstanding request`,
    whyNotAlternative: runner ? `${runner.candidateId} simulatedScore=${runner.simulatedScore ?? 0} — lower` : 'no alternative candidate',
  };
}
