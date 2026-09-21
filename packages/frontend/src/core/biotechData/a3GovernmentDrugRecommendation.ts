import { canonicalJson, fnv1a } from '../events/hash';
import {
  A3_PREREGISTRATION,
  A3_POPULATION_CONDITION_PATTERNS,
  A3_POLICY_DIMENSIONS_WITHOUT_SOURCE,
  type A3PopulationSpec,
  type A3SafetyLabel,
} from './a3GovernmentPreregistration';
import {
  runA2Analysis,
  selfFalsifyWinner,
  type A2AnalysisReport,
  type A2CandidateReport,
  type A2Verdict,
  type A2SelfFalsificationResult,
} from './a2OzempicSubstitute';
import type { GatedCandidate, GateDecision } from '../agent/practicalCandidateGate';
import trialConditionsRaw from './a3-government/trial-conditions.json';

/**
 * A3 — GENESIS GOVERNMENT RESEARCH: AUTONOMOUS SEMAGLUTIDE-SUBSTITUTE
 * RECOMMENDATION.
 *
 * This is a DECISION layer over A2's already-real, already-sealed candidate
 * space and analysis (`a2OzempicSubstitute.ts`) — it re-runs no fetch, adds
 * no candidate, and re-derives no efficacy/safety number. What it adds is
 * everything the government mandate asked for that A2 did not need: a
 * required population input (hard-refused when absent), real per-trial
 * population tagging, a government decision score kept SEPARATE from the
 * scientific ranking, a controlled safety-language vocabulary, and the
 * AnswerRecord (TRUTH) / ActionRecord (POLICY) split in the final report.
 *
 * THE HARD GATE THIS INVOCATION ITSELF HITS. The government mandate that
 * produced this module named no population. Per its own §1 rule ("Jeżeli
 * populacja nie została podana: NIE ZGADUJ. Zwróć REQUIRED_POLICY_INPUT."),
 * calling `runA3GovernmentRecommendation()` with no argument — which is what
 * this session's own request maps to — returns REQUIRED_POLICY_INPUT
 * WITHOUT running A2's analysis at all. This is not a placeholder path: it
 * is the literal, correct answer to the request as asked.
 */

export const A3_ANALYSIS_CONTRACT_VERSION = '1.0.0';

const TRIAL_CONDITIONS: Readonly<Record<string, readonly string[]>> = trialConditionsRaw as Readonly<Record<string, readonly string[]>>;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a trial's own REAL, structured `conditions` field (never a briefTitle guess) against the requested population. */
export function trialMatchesPopulation(nctId: string, population: A3PopulationSpec): boolean {
  const conditionsText = (TRIAL_CONDITIONS[nctId] ?? []).join(' | ');
  const t2dPattern = new RegExp(A3_POPULATION_CONDITION_PATTERNS.T2D, 'i');
  const obesityPattern = new RegExp(A3_POPULATION_CONDITION_PATTERNS.OBESITY, 'i');
  if (population.kind === 'T2D') return t2dPattern.test(conditionsText);
  if (population.kind === 'OBESITY') return obesityPattern.test(conditionsText);
  if (population.kind === 'T2D_AND_OBESITY') return t2dPattern.test(conditionsText) || obesityPattern.test(conditionsText);
  return population.conditionKeywords.some((kw) => new RegExp(escapeRegExp(kw), 'i').test(conditionsText));
}

export function describePopulation(population: A3PopulationSpec): string {
  if (population.kind === 'T2D') return 'Type 2 Diabetes';
  if (population.kind === 'OBESITY') return 'Obesity';
  if (population.kind === 'T2D_AND_OBESITY') return 'Type 2 Diabetes and/or Obesity';
  return `Risk group matching condition keyword(s): ${population.conditionKeywords.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Per-candidate population view (§1 real tagging, never a briefTitle guess)
// ---------------------------------------------------------------------------

export type A3PopulationCoverage = 'DIRECT_EVIDENCE_FOR_POPULATION' | 'NO_DIRECT_EVIDENCE_FOR_POPULATION' | 'NO_EFFICACY_EVIDENCE';

export interface A3CandidatePopulationView {
  readonly matchingTrialNctIds: readonly string[];
  readonly nonMatchingTrialNctIds: readonly string[];
  readonly populationCoverage: A3PopulationCoverage;
}

function buildPopulationView(report: A2CandidateReport, population: A3PopulationSpec): A3CandidatePopulationView {
  const nctIds = report.efficacy.map((e) => e.nctId);
  if (nctIds.length === 0) return { matchingTrialNctIds: [], nonMatchingTrialNctIds: [], populationCoverage: 'NO_EFFICACY_EVIDENCE' };
  const matching = nctIds.filter((id) => trialMatchesPopulation(id, population));
  const nonMatching = nctIds.filter((id) => !matching.includes(id));
  return { matchingTrialNctIds: matching, nonMatchingTrialNctIds: nonMatching, populationCoverage: matching.length > 0 ? 'DIRECT_EVIDENCE_FOR_POPULATION' : 'NO_DIRECT_EVIDENCE_FOR_POPULATION' };
}

// ---------------------------------------------------------------------------
// §7 — controlled safety-language vocabulary
// ---------------------------------------------------------------------------

/**
 * Never returns a bare "safe" claim. `null` means the candidate is VETOED on
 * a real measured worse-direction signal (see `report.falsification.worseSafetySignal`)
 * — no reassuring label from this vocabulary applies, and the report states
 * the measured numbers directly instead of reaching for a euphemism.
 */
export function deriveSafetyLabel(report: A2CandidateReport): A3SafetyLabel | null {
  if (report.score.vetoed) return null;
  const withCi = report.safety.filter((s): s is typeof s & { riskRatio: number; riskRatioCi95: { low: number; high: number } } => s.riskRatio !== null && s.riskRatioCi95 !== null);
  if (withCi.length === 0) return 'INSUFFICIENT_SAFETY_EVIDENCE';
  const allLowerWithCi = withCi.every((s) => s.riskRatio < 1 && s.riskRatioCi95.high < 1);
  if (allLowerWithCi) return 'SAFE_RELATIVE_TO_X';
  const anyLowerWithCi = withCi.some((s) => s.riskRatio < 1 && s.riskRatioCi95.high < 1);
  if (anyLowerWithCi) return 'LOWER_OBSERVED_RISK';
  return 'NO_SIGNAL_DETECTED';
}

// ---------------------------------------------------------------------------
// §9 — government decision score, kept SEPARATE from the scientific score
// ---------------------------------------------------------------------------

export interface A3GovernmentScoreBreakdown {
  readonly scientificWeightedScore: number;
  readonly policyDimensions: Readonly<Record<string, { readonly status: 'INSUFFICIENT_EVIDENCE'; readonly contribution: 0 }>>;
  readonly governmentWeightedScore: number;
}

/**
 * The scientific dimensions (efficacy/safety/evidenceStrength/uncertainty/
 * conflict) use IDENTICAL weights to A2 (see a3GovernmentPreregistration.ts
 * A3_GOVERNMENT_WEIGHTS) over the SAME evidence, so this is not a re-scoring
 * -- it is A2's own score, carried forward. The policy-only dimensions
 * (cost/availability/scalability/supplySecurity/manufacturingFeasibility/
 * populationCoverage) have no integrated real source in this session and
 * are scored INSUFFICIENT_EVIDENCE with a hard-coded zero contribution --
 * never a fabricated number, never silently dropped from the report. This
 * is why `governmentWeightedScore` currently equals `scientificWeightedScore`
 * for every candidate: that equality is a disclosed FACT about missing
 * policy data, not an assumption that cost/availability favor anyone.
 */
export function buildGovernmentScoreBreakdown(report: A2CandidateReport): A3GovernmentScoreBreakdown {
  const policyDimensions: Record<string, { status: 'INSUFFICIENT_EVIDENCE'; contribution: 0 }> = {};
  for (const key of A3_POLICY_DIMENSIONS_WITHOUT_SOURCE) policyDimensions[key] = { status: 'INSUFFICIENT_EVIDENCE', contribution: 0 };
  return {
    scientificWeightedScore: report.score.weightedScore,
    policyDimensions,
    governmentWeightedScore: report.score.weightedScore,
  };
}

// ---------------------------------------------------------------------------
// Combined per-candidate view
// ---------------------------------------------------------------------------

export interface A3CandidateView {
  readonly report: A2CandidateReport;
  readonly population: A3CandidatePopulationView;
  readonly safetyLabel: A3SafetyLabel | null;
  readonly governmentScore: A3GovernmentScoreBreakdown;
}

function buildCandidateView(report: A2CandidateReport, population: A3PopulationSpec): A3CandidateView {
  return {
    report,
    population: buildPopulationView(report, population),
    safetyLabel: deriveSafetyLabel(report),
    governmentScore: buildGovernmentScoreBreakdown(report),
  };
}

// ---------------------------------------------------------------------------
// §10 — self-falsification of the FINAL government recommendation, extending
// A2's own self-falsification round with government-specific concerns.
// ---------------------------------------------------------------------------

export interface A3SelfFalsification {
  readonly candidateId: string;
  readonly scientificFindings: readonly string[];
  readonly governmentFindings: readonly string[];
  readonly revisedScore: number;
}

function selfFalsifyGovernmentWinner(view: A3CandidateView, a2SelfFalsification: A2SelfFalsificationResult): A3SelfFalsification {
  const governmentFindings: string[] = [];
  if (view.population.populationCoverage === 'NO_DIRECT_EVIDENCE_FOR_POPULATION') {
    governmentFindings.push('No trial behind this candidate has real, structured conditions matching the requested population: every efficacy number comes from a different population than the one asked about.');
  }
  if (view.population.populationCoverage === 'NO_EFFICACY_EVIDENCE') {
    governmentFindings.push('This candidate has no usable efficacy evidence for any population.');
  }
  governmentFindings.push('No real, integrated public source exists in this analysis for cost, availability, supply security, or manufacturing feasibility -- these dimensions are INSUFFICIENT_EVIDENCE, never assumed favorable.');
  return {
    candidateId: a2SelfFalsification.candidateId,
    scientificFindings: a2SelfFalsification.findings,
    governmentFindings,
    revisedScore: a2SelfFalsification.revisedScore,
  };
}

// ---------------------------------------------------------------------------
// Top-level report: the hard REQUIRED_POLICY_INPUT gate + the answered path
// ---------------------------------------------------------------------------

export interface A3RequiredPolicyInput {
  readonly status: 'REQUIRED_POLICY_INPUT';
  readonly contractVersion: string;
  readonly governmentQuestion: string;
  readonly reason: string;
  readonly requiredInput: string;
  readonly preregistrationFingerprint: string;
}

export interface A3AnswerRecord {
  readonly targets: A2AnalysisReport['targets'];
  readonly totalCandidatesInSpace: number;
  readonly candidateViews: readonly A3CandidateView[];
  readonly scientificRanking: readonly A3CandidateView[];
  readonly governmentRanking: readonly A3CandidateView[];
  readonly rankingsDiverge: boolean;
  readonly recommendation: A2Verdict;
  readonly bestEfficacyCandidate: A3CandidateView | null;
  readonly safestSupportedCandidate: A3CandidateView | null;
  readonly bestOverallCandidate: A3CandidateView | null;
  readonly selfFalsification: A3SelfFalsification | null;
}

export interface A3ActionRecord {
  readonly gatedCandidate: GatedCandidate | null;
  readonly gateDecision: GateDecision | null;
  readonly surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE';
}

export interface A3AnsweredReport {
  readonly status: 'ANSWERED';
  readonly contractVersion: string;
  readonly governmentQuestion: string;
  readonly population: A3PopulationSpec;
  readonly populationDescription: string;
  readonly preregistrationFingerprint: string;
  /** TRUTH. Never edited by policy -- see module doc and answerRecordVsActionRecord in the preregistration. */
  readonly answerRecord: A3AnswerRecord;
  /** POLICY. May limit what is surfaced; can never alter a field already written into answerRecord. */
  readonly actionRecord: A3ActionRecord;
  readonly policyDimensionsWithoutSource: readonly string[];
  readonly decisionFingerprint: string;
}

export type A3Report = A3RequiredPolicyInput | A3AnsweredReport;

function decisionFingerprint(population: A3PopulationSpec, answerRecord: A3AnswerRecord): string {
  return fnv1a(canonicalJson({
    preregistrationFingerprint: A3_PREREGISTRATION.fingerprint,
    population,
    recommendation: answerRecord.recommendation.label,
    candidates: answerRecord.candidateViews.map((v) => ({ id: v.report.summary.moleculeChemblId, governmentScore: v.governmentScore.governmentWeightedScore, populationCoverage: v.population.populationCoverage })),
  }));
}

/**
 * Entry point. `population` is REQUIRED — omitting it (exactly what this
 * session's own government request did) returns REQUIRED_POLICY_INPUT
 * without touching A2's analysis at all, per the mandate's own §1 rule.
 */
export function runA3GovernmentRecommendation(population?: A3PopulationSpec): A3Report {
  if (population === undefined) {
    return {
      status: 'REQUIRED_POLICY_INPUT',
      contractVersion: A3_ANALYSIS_CONTRACT_VERSION,
      governmentQuestion: A3_PREREGISTRATION.governmentQuestion,
      reason: 'No population was specified (cukrzyca typu 2 / otyłość / otyłość + cukrzyca / określona grupa ryzyka). Per the government mandate\'s own rule, this is never guessed.',
      requiredInput: 'population: { kind: "T2D" | "OBESITY" | "T2D_AND_OBESITY" } | { kind: "RISK_GROUP", conditionKeywords: string[] }',
      preregistrationFingerprint: A3_PREREGISTRATION.fingerprint,
    };
  }

  const a2Report = runA2Analysis();
  const candidateViews = a2Report.candidateReports.map((r) => buildCandidateView(r, population));

  /**
   * A candidate with ZERO efficacy evidence against semaglutide cannot be a
   * "scientific winner" or "best overall option" for a SUBSTITUTE question,
   * however high its safety-only score is (real example found by testing:
   * MK-0893 has 8 favorable safety categories and 0 efficacy trials, which
   * alone drove it to the top of the unfiltered weightedScore ranking).
   * Mirrors A2's own decideA2Verdict, which restricts to `withEvidence`
   * before ranking for its verdict. `candidateViews` itself stays
   * UNFILTERED (every candidate, including zero-efficacy ones, remains
   * fully visible) -- only the WINNER/RANKING designations are restricted.
   */
  const withEfficacyViews = candidateViews.filter((v) => v.report.efficacy.length > 0);

  const scientificRanking = [...withEfficacyViews].sort((a, b) => b.report.score.weightedScore - a.report.score.weightedScore);
  const governmentRanking = [...withEfficacyViews].sort((a, b) => b.governmentScore.governmentWeightedScore - a.governmentScore.governmentWeightedScore);
  const rankingsDiverge = scientificRanking.map((v) => v.report.summary.moleculeChemblId).join(',') !== governmentRanking.map((v) => v.report.summary.moleculeChemblId).join(',');

  const bestEfficacyCandidate = withEfficacyViews.length === 0 ? null : withEfficacyViews.reduce((best, v) => (v.report.score.efficacyScore > best.report.score.efficacyScore ? v : best));

  /** Safety-only question, deliberately NOT restricted to withEfficacyViews: a candidate can genuinely have real safety data with no efficacy data at all (MK-0893), and that gap is itself worth disclosing, not hiding by excluding the candidate. */
  const nonVetoedWithSafety = candidateViews.filter((v) => !v.report.score.vetoed && v.report.safety.some((s) => s.riskRatio !== null));
  const safestSupportedCandidate = nonVetoedWithSafety.length === 0 ? null : nonVetoedWithSafety.reduce((best, v) => (v.report.score.safetyScore > best.report.score.safetyScore ? v : best));

  const nonVetoedGovernmentRanking = governmentRanking.filter((v) => !v.report.score.vetoed);
  const bestOverallCandidate = nonVetoedGovernmentRanking.length === 0 ? null : nonVetoedGovernmentRanking[0];

  const topWithEvidenceId = a2Report.selfFalsification?.candidateId ?? null;
  const topView = topWithEvidenceId === null ? null : (candidateViews.find((v) => v.report.summary.moleculeChemblId === topWithEvidenceId) ?? null);
  const selfFalsification = topView !== null && a2Report.selfFalsification !== null ? selfFalsifyGovernmentWinner(topView, a2Report.selfFalsification) : null;

  const answerRecord: A3AnswerRecord = {
    targets: a2Report.targets,
    totalCandidatesInSpace: a2Report.totalCandidatesInSpace,
    candidateViews,
    scientificRanking,
    governmentRanking,
    rankingsDiverge,
    recommendation: a2Report.verdict,
    bestEfficacyCandidate,
    safestSupportedCandidate,
    bestOverallCandidate,
    selfFalsification,
  };

  const actionRecord: A3ActionRecord = {
    gatedCandidate: a2Report.gatedCandidate,
    gateDecision: a2Report.gateDecision,
    surface: a2Report.surface,
  };

  return {
    status: 'ANSWERED',
    contractVersion: A3_ANALYSIS_CONTRACT_VERSION,
    governmentQuestion: A3_PREREGISTRATION.governmentQuestion,
    population,
    populationDescription: describePopulation(population),
    preregistrationFingerprint: A3_PREREGISTRATION.fingerprint,
    answerRecord,
    actionRecord,
    policyDimensionsWithoutSource: A3_POLICY_DIMENSIONS_WITHOUT_SOURCE,
    decisionFingerprint: decisionFingerprint(population, answerRecord),
  };
}

// re-export selfFalsifyWinner so callers/tests can cross-check against A2's own function without a second import path
export { selfFalsifyWinner };

// ---------------------------------------------------------------------------
// §14 — the exact government output format
// ---------------------------------------------------------------------------

function confidenceLabel(recommendation: A2Verdict): string {
  switch (recommendation.label) {
    case 'BEST_SUPPORTED_CANDIDATE': return 'HIGH (within the stated evidence limits below)';
    case 'PROMISING_BUT_UNCERTAIN': return 'MODERATE';
    case 'NO_SUPERIOR_CANDIDATE': return 'HIGH confidence that no candidate scores better than semaglutide';
    case 'NO_SAFE_SUPERIOR_CANDIDATE': return 'HIGH confidence that no candidate clears the safety veto';
    case 'CONFLICTING_EVIDENCE': return 'LOW -- the evidence itself disagrees';
    case 'INSUFFICIENT_EVIDENCE': return 'NONE -- no usable evidence exists';
  }
}

function describeCandidateLine(v: A3CandidateView): string {
  const eff = v.report.efficacy[0];
  const deltaText = eff?.deltaVsSemaglutidePp === null || eff?.deltaVsSemaglutidePp === undefined ? 'n/a' : `${eff.deltaVsSemaglutidePp.toFixed(2)}pp vs semaglutide (${eff.comparisonType})`;
  const safetyText = v.report.score.vetoed ? `VETOED (${v.report.score.vetoReason})` : (v.safetyLabel ?? 'INSUFFICIENT_SAFETY_EVIDENCE');
  return `${v.report.summary.prefName} [${v.report.summary.moleculeChemblId}] -- efficacy: ${deltaText}; safety: ${safetyText}; population evidence: ${v.population.populationCoverage} (${v.population.matchingTrialNctIds.join(', ') || 'none'}); government score: ${v.governmentScore.governmentWeightedScore.toFixed(3)}`;
}

/** Renders the exact 14-section GOVERNMENT DRUG DISCOVERY REPORT format the mandate specifies. */
export function printA3GovernmentReport(report: A3Report): string {
  const lines: string[] = ['GOVERNMENT DRUG DISCOVERY REPORT', ''];
  lines.push('QUESTION:', report.governmentQuestion, '');

  if (report.status === 'REQUIRED_POLICY_INPUT') {
    lines.push('POPULATION:', `NOT PROVIDED -- ${report.reason}`, '');
    lines.push('REQUIRED INPUT:', report.requiredInput, '');
    lines.push('PREREGISTRATION FINGERPRINT:', report.preregistrationFingerprint, '');
    lines.push('STATUS:', 'REQUIRED_POLICY_INPUT (no candidate analysis was run)');
    return lines.join('\n');
  }

  const { answerRecord: ar, actionRecord: acr } = report;
  lines.push('POPULATION:', report.populationDescription, '');
  lines.push('CANDIDATE SPACE:', `${ar.totalCandidatesInSpace} real molecules with qualifying ChEMBL binding data at GLP-1R/GIPR/GCGR; ${ar.candidateViews.length} with real posted-result ClinicalTrials.gov evidence. No drug name was the discovery query.`, '');

  const scientificWinner = ar.scientificRanking[0];
  lines.push('SCIENTIFIC WINNER:', scientificWinner === undefined ? 'NONE' : `${describeCandidateLine(scientificWinner)}${scientificWinner.report.score.vetoed ? ' -- does NOT qualify as the government recommendation (safety veto)' : ''}`, '');

  lines.push('SAFEST SUPPORTED OPTION:', ar.safestSupportedCandidate === null ? 'INSUFFICIENT_EVIDENCE -- no non-vetoed candidate has a numeric safety comparison to semaglutide.' : describeCandidateLine(ar.safestSupportedCandidate), '');
  lines.push('BEST EFFICACY OPTION:', ar.bestEfficacyCandidate === null ? 'INSUFFICIENT_EVIDENCE' : `${describeCandidateLine(ar.bestEfficacyCandidate)}${ar.bestEfficacyCandidate.report.score.vetoed ? ' -- WARNING: best efficacy does not mean recommended; this candidate is vetoed on safety' : ''}`, '');
  lines.push('BEST OVERALL OPTION:', ar.bestOverallCandidate === null ? 'NONE -- no non-vetoed candidate; see GOVERNMENT RECOMMENDATION.' : describeCandidateLine(ar.bestOverallCandidate), '');

  const vetoedLines = ar.candidateViews.filter((v) => v.report.score.vetoed).map((v) => `${v.report.summary.prefName}: ${v.report.score.vetoReason}`);
  lines.push('COUNTEREVIDENCE:', vetoedLines.length === 0 ? 'No candidate triggered the existential safety veto.' : vetoedLines.join('; '), '');

  lines.push('UNKNOWN / DATA GAPS:', `No real, integrated public source in this analysis for: ${report.policyDimensionsWithoutSource.join(', ')}. Scored INSUFFICIENT_EVIDENCE, contributing 0 to the government score -- never assumed favorable or neutral.`, '');

  lines.push('CONFLICTS:', ar.recommendation.label === 'CONFLICTING_EVIDENCE' ? ar.recommendation.reason : (ar.rankingsDiverge ? 'The scientific and government rankings order candidates differently.' : 'The scientific and government rankings agree on candidate order (no integrated policy-only data currently exists to move them apart).'), '');

  lines.push('CONFIDENCE:', confidenceLabel(ar.recommendation), '');

  const directCount = ar.candidateViews.filter((v) => v.report.efficacy.some((e) => e.comparisonType === 'DIRECT_HEAD_TO_HEAD')).length;
  lines.push('EVIDENCE STRENGTH:', `${directCount} of ${ar.candidateViews.length} candidates have a direct head-to-head trial against semaglutide; the rest rely on naive indirect comparisons across different trials/populations/doses (a real, disclosed, weaker evidence class -- never silently upgraded).`, '');

  lines.push('GOVERNMENT RECOMMENDATION:', ar.recommendation.label, '');
  lines.push('WHY:', ar.recommendation.reason, '');

  const changeItems = ar.selfFalsification === null ? ['A candidate with usable efficacy evidence would need to exist first.'] : [...ar.selfFalsification.scientificFindings, ...ar.selfFalsification.governmentFindings];
  lines.push('WHAT WOULD CHANGE THIS DECISION:', changeItems.map((f) => `- ${f}`).join('\n'), '');

  lines.push('NEXT BEST EXPERIMENT:', ar.bestOverallCandidate === null
    ? 'A real, randomized head-to-head trial of the best-scoring candidate against semaglutide in the exact requested population, plus integration of a real public cost/availability/supply-chain source.'
    : `A real, randomized head-to-head trial of ${ar.bestOverallCandidate.report.summary.prefName} against semaglutide in the exact requested population (${report.populationDescription}), plus integration of a real public cost/availability/supply-chain source for the government decision score.`, '');

  lines.push('FULL PROVENANCE:', 'ChEMBL Web Services (candidate space + potency) + ClinicalTrials.gov API v2 (efficacy/safety/adverse events + per-trial conditions). See a2-ozempic-substitute/meta.json and a3-government/meta.json for per-file URLs, retrieval timestamps, and SHA-256 hashes of every pinned fixture.', '');
  lines.push('REPLAY:', `Deterministic: re-running runA3GovernmentRecommendation() with the same population produces an identical decision fingerprint. Preregistration fingerprint: ${report.preregistrationFingerprint}.`, '');
  lines.push('DECISION FINGERPRINT:', report.decisionFingerprint, '');

  lines.push('STATUS:', `TRUTH: answerRecord established above, independent of policy. ACTION: ${acr.surface}${acr.gateDecision === null ? ' (no candidate proposed for action)' : ` (${acr.gateDecision.outcome})`}.`);

  return lines.join('\n');
}
