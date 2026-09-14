import { canonicalJson, fnv1a } from '../events/hash';
import { runA2Analysis, type A2CandidateReport } from './a2OzempicSubstitute';
import { LOWER_HARM_PREREGISTRATION, LOWER_HARM_SCENARIO_ID, type LowerHarmVerdictLabel } from './govDrugLowerHarmPreregistration';

/**
 * LOWER-HARM CANDIDATE RE-RANKING — mandate step 10, part 2. Consumes
 * `runA2Analysis()`'s output UNMODIFIED and re-ranks it under the sealed
 * `LOWER_HARM_PREREGISTRATION` decision rule. No new candidate is generated,
 * no new datum is fetched, no new veto is invented. This is a re-ranking
 * layer, not a second discovery engine.
 *
 * REUSED VERBATIM: `report.score.vetoed` and `report.score.vetoReason` (A2's
 * existential safety veto), `report.score.safetyScore` /
 * `.evidenceStrengthScore` / `.uncertaintyPenalty` / `.conflictPenalty`
 * (A2's own per-dimension scores from `scoreCandidate`), and
 * `report.efficacy[].candidateArm.meanChangePp` (the candidate's own
 * absolute HbA1c change, already extracted from real trial data). Nothing
 * here recomputes a risk ratio or re-reads a trial file.
 *
 * KNOWN, DISCLOSED LIMITATION (not silently accepted): `runA2Analysis()`
 * computes every candidate's veto under `HISTORICAL_NO_EVIDENCE_CLASS` (see
 * `a2OzempicSubstitute.ts`'s own comment on that call site, and D-046). The
 * evidence-class-gated re-adjudication done for tirzepatide's diarrhea veto
 * (D-046) is a SEPARATE, deliberately isolated result and is NOT applied
 * here — doing so only for the one candidate where it happens to help would
 * be exactly the "choose the rule that produces a preferable outcome"
 * failure this mandate forbids. Applying the same rigour to every candidate
 * (finding and verifying additional direct evidence per candidate, the way
 * SURPASS-2 was found and verified for tirzepatide) is real future work,
 * not something this file can do by fiat.
 */

export const LOWER_HARM_RANKING_CONTRACT_VERSION = '1.0.0';

export type LowerHarmEfficacyFloorStatus = 'MEETS_FLOOR' | 'BELOW_FLOOR' | 'NO_HBA1C_EVIDENCE';

export interface LowerHarmEfficacyFloorEvaluation {
  readonly status: LowerHarmEfficacyFloorStatus;
  /** null only when status is NO_HBA1C_EVIDENCE. */
  readonly fraction: number | null;
}

/**
 * The candidate's OWN absolute HbA1c change (`candidateArm.meanChangePp`),
 * not `deltaVsSemaglutidePp` — the floor is about retained effect, not about
 * beating the reference. Both quantities are typically negative (HbA1c
 * lowering); the ratio is positive exactly when the candidate lowers HbA1c
 * in the same direction as the reference, and its magnitude is the fraction
 * of the reference's own effect retained.
 */
export function evaluateEfficacyFloor(report: A2CandidateReport): LowerHarmEfficacyFloorEvaluation {
  const hba1cEvidence = report.efficacy.find((e) => e.outcomeMetric === 'HBA1C');
  if (hba1cEvidence === undefined) return { status: 'NO_HBA1C_EVIDENCE', fraction: null };

  const floor = LOWER_HARM_PREREGISTRATION.efficacyFloor;
  const fraction = hba1cEvidence.candidateArm.meanChangePp / floor.referenceEffectPp;
  return { status: fraction >= floor.minFractionOfReferenceEffect ? 'MEETS_FLOOR' : 'BELOW_FLOOR', fraction };
}

/**
 * The declared departure from A2: safety-dominant weighting over the SAME
 * per-dimension scores `scoreCandidate` already computed. `efficacyScore`
 * (A2's own -1..1 normalised efficacy statistic) stands in for "efficacy
 * margin above the floor" — the floor gate above already removed every
 * candidate for whom this would matter as an elimination criterion, so here
 * it only ever acts as the declared, small tie-breaking weight.
 */
export function computeLowerHarmScore(report: A2CandidateReport): number {
  const w = LOWER_HARM_PREREGISTRATION.rankingWeights;
  const s = report.score;
  return w.safety * s.safetyScore + w.efficacyMarginAboveFloor * s.efficacyScore + w.evidenceStrength * s.evidenceStrengthScore + w.uncertaintyPenalty * s.uncertaintyPenalty + w.conflictPenalty * s.conflictPenalty;
}

export interface LowerHarmCandidateResult {
  readonly report: A2CandidateReport;
  readonly efficacyFloor: LowerHarmEfficacyFloorEvaluation;
  /** null exactly when the candidate is eliminated — either by the safety veto or by the efficacy floor. */
  readonly lowerHarmScore: number | null;
  readonly eliminationReason: string | null;
}

function rankOneCandidate(report: A2CandidateReport): LowerHarmCandidateResult {
  const efficacyFloor = evaluateEfficacyFloor(report);

  if (report.score.vetoed) {
    return { report, efficacyFloor, lowerHarmScore: null, eliminationReason: report.score.vetoReason };
  }
  if (efficacyFloor.status === 'NO_HBA1C_EVIDENCE') {
    return { report, efficacyFloor, lowerHarmScore: null, eliminationReason: 'INSUFFICIENT_EVIDENCE: no HbA1c efficacy evidence available to evaluate against the efficacy floor.' };
  }
  if (efficacyFloor.status === 'BELOW_FLOOR') {
    const pct = (efficacyFloor.fraction! * 100).toFixed(1);
    const floorPct = (LOWER_HARM_PREREGISTRATION.efficacyFloor.minFractionOfReferenceEffect * 100).toFixed(0);
    return { report, efficacyFloor, lowerHarmScore: null, eliminationReason: `Efficacy floor not met: retains ${pct}% of the reference effect, floor is ${floorPct}%.` };
  }
  return { report, efficacyFloor, lowerHarmScore: computeLowerHarmScore(report), eliminationReason: null };
}

/** Ranked descending by `lowerHarmScore`; eliminated candidates (`lowerHarmScore === null`) sort last, in their original order. */
export function rankForLowerHarm(reports: readonly A2CandidateReport[]): readonly LowerHarmCandidateResult[] {
  return reports.map(rankOneCandidate).sort((a, b) => {
    if (a.lowerHarmScore === null && b.lowerHarmScore === null) return 0;
    if (a.lowerHarmScore === null) return 1;
    if (b.lowerHarmScore === null) return -1;
    return b.lowerHarmScore - a.lowerHarmScore;
  });
}

/**
 * Per `CONFLICTING_EVIDENCE_POLICY`: true when the candidate that ranks best
 * on safety differs from the one that ranks best on efficacy margin among
 * floor-qualifying candidates — neither dominates both dimensions.
 */
function hasConflictingEvidence(qualifying: readonly LowerHarmCandidateResult[]): boolean {
  if (qualifying.length < 2) return false;
  const bySafety = [...qualifying].sort((a, b) => b.report.score.safetyScore - a.report.score.safetyScore)[0];
  const byEfficacyMargin = [...qualifying].sort((a, b) => b.report.score.efficacyScore - a.report.score.efficacyScore)[0];
  return bySafety.report.summary.moleculeChemblId !== byEfficacyMargin.report.summary.moleculeChemblId;
}

export interface LowerHarmVerdict {
  readonly label: LowerHarmVerdictLabel;
  readonly reason: string;
  readonly winnerId: string | null;
}

export function decideLowerHarmVerdict(ranked: readonly LowerHarmCandidateResult[]): LowerHarmVerdict {
  if (ranked.length === 0) return { label: 'INSUFFICIENT_EVIDENCE', reason: 'No candidate in the mechanism-derived space.', winnerId: null };

  const qualifying = ranked.filter((r): r is LowerHarmCandidateResult & { lowerHarmScore: number } => r.lowerHarmScore !== null);
  if (qualifying.length === 0) {
    const allVetoed = ranked.every((r) => r.report.score.vetoed);
    const allBelowFloor = ranked.every((r) => r.efficacyFloor.status === 'BELOW_FLOOR');
    const reason = allVetoed
      ? 'Every candidate with usable efficacy evidence fails the existential safety veto.'
      : allBelowFloor
        ? 'No candidate retains enough of the reference effect to clear the preregistered efficacy floor.'
        : 'No candidate both clears the efficacy floor and passes the safety veto.';
    return { label: 'NO_WINNER', reason, winnerId: null };
  }

  if (hasConflictingEvidence(qualifying)) {
    return { label: 'CONFLICTING_EVIDENCE', reason: LOWER_HARM_PREREGISTRATION.conflictingEvidencePolicy, winnerId: null };
  }

  const winner = qualifying[0];
  return {
    label: 'WINNER',
    reason: `${winner.report.summary.prefName} (${winner.report.summary.moleculeChemblId}) ranks best under the LOWER-HARM safety-dominant rule among candidates that clear the efficacy floor and pass the safety veto.`,
    winnerId: winner.report.summary.moleculeChemblId,
  };
}

export interface LowerHarmAnalysisReport {
  readonly scenarioId: string;
  readonly preregistrationFingerprint: string;
  readonly ranked: readonly LowerHarmCandidateResult[];
  readonly verdict: LowerHarmVerdict;
  readonly fingerprint: string;
}

/**
 * The full re-ranking, composed from real, unmodified A2 output. Reused
 * verbatim: `runA2Analysis()`. New here: only the ranking and verdict logic
 * above, applied to that output.
 */
export function runLowerHarmAnalysis(): LowerHarmAnalysisReport {
  const a2 = runA2Analysis();
  const ranked = rankForLowerHarm(a2.candidateReports);
  const verdict = decideLowerHarmVerdict(ranked);

  const fingerprint = fnv1a(canonicalJson({
    scenarioId: LOWER_HARM_SCENARIO_ID,
    preregistrationFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint,
    a2AnalysisFingerprint: a2.analysisFingerprint,
    ranked: ranked.map((r) => ({ id: r.report.summary.moleculeChemblId, lowerHarmScore: r.lowerHarmScore, eliminationReason: r.eliminationReason })),
    verdict,
  }));

  return { scenarioId: LOWER_HARM_SCENARIO_ID, preregistrationFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint, ranked, verdict, fingerprint };
}
