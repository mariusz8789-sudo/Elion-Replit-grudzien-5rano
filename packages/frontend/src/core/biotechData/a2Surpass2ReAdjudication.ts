import { canonicalJson, fnv1a } from '../events/hash';
import {
  decideA2Verdict,
  extractCandidateSafety,
  falsifyCandidate,
  runA2Analysis,
  scoreCandidate,
  type A2CandidateReport,
  type A2SafetyCategoryResult,
  type A2FalsificationResult,
  type A2CandidateScore,
  type A2TrialRecord,
} from './a2OzempicSubstitute';
import { A2_PREREGISTRATION } from './a2OzempicSubstitutePreregistration';
import { SURPASS2_STUDY } from './surpass2DirectEvidence';
import surpass2Raw from './a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';

// Same cast pattern already used by sourceTrialMismatch.test.ts for this exact
// fixture — reused here rather than hand-rolling a second shape for it.
const SURPASS2_TRIAL = surpass2Raw as A2TrialRecord;

/**
 * RE-ADJUDICATION — mandate step 8/9 (docs/DECISIONS.md D-042 through D-045).
 *
 * SCOPE, DECLARED AND FROZEN BEFORE EXECUTION, NOT NEGOTIABLE MID-RUN:
 *   - Changes ONLY the evidence class available to the diarrhea safety
 *     category for tirzepatide (CHEMBL4297839). Nothing else.
 *   - Efficacy is NOT touched. SURPASS-2 also carries HbA1c outcomes; pulling
 *     those in would be a second, undeclared change riding on this one. The
 *     historical `efficacy` array for tirzepatide is reused byte-for-byte.
 *   - Dose selection is NOT changed. The candidate arm is picked by
 *     `pickCandidateAeGroupTitle` INSIDE the unmodified `extractCandidateSafety`
 *     — the exact same "highest parsed mg" rule the frozen A2 run uses. That
 *     function is not called, parameterised, or touched here; SURPASS-2's own
 *     event groups are handed to it exactly as any other trial's would be.
 *   - The safety-veto threshold (`A2_PREREGISTRATION.effectSizeThresholds
 *     .safetyRiskRatioMeaningfulDeviation`, 1.0) is not read or referenced by
 *     this file at all — it lives inside `falsifyCandidate`, called unmodified.
 *   - `scoreCandidate` and `decideA2Verdict` are called UNMODIFIED.
 *
 * THE RULE WAS FIXED BEFORE THIS FILE EXISTED, NOT INVENTED TO PRODUCE AN
 * OUTCOME. `pickCandidateAeGroupTitle`'s "highest dose wins" selection and the
 * 1.0 threshold both predate D-042 (docs/DECISIONS.md, commits before
 * c2b7bb0). Both possible outcomes of applying that pre-existing rule to
 * SURPASS-2's three arms were written down in the conversation record BEFORE
 * this module was executed: veto lifted if the rule picks 15mg (CI includes
 * 1), veto upheld if it picks 10mg (CI excludes 1). The rule was not chosen
 * after seeing which arm it would land on.
 *
 * BOTH RESULTS ARE COMPUTED AND KEPT, NEVER ONE OVERWRITING THE OTHER:
 * `runReAdjudication()` returns `historical` (byte-identical to
 * `runA2Analysis()`, unmodified) and `reAdjudicated` side by side.
 */

export const RE_ADJUDICATION_ID = 'GOV-DRUG-A2-REJUDGE-TIRZEPATIDE-DIARRHEA-SURPASS2-01';
const CANDIDATE_ID = 'CHEMBL4297839';
const SURPASS2_TIRZEPATIDE_PATTERN = /tirzepatide/i;

/** The frozen decision record. Computed and fingerprinted BEFORE the comparison is evaluated. */
export interface ReAdjudicationFreeze {
  readonly reAdjudicationId: string;
  readonly candidateId: string;
  readonly category: string;
  readonly doseSelectionRule: string;
  readonly evidencePolicy: string;
  /** Read here only to be RECORDED, never to be changed — the live value from the unmodified preregistration. */
  readonly safetyRiskRatioMeaningfulDeviation: number;
  readonly sourceStudyId: string;
  readonly sourceStudySha256: string;
  readonly scopeNote: string;
  readonly ruleFingerprint: string;
}

function buildFreeze(historicalThreshold: number): ReAdjudicationFreeze {
  const base = {
    reAdjudicationId: RE_ADJUDICATION_ID,
    candidateId: CANDIDATE_ID,
    category: 'diarrhea',
    doseSelectionRule: 'HIGHEST_DOSE (pickCandidateAeGroupTitle, unmodified, pre-existing since before D-042)',
    evidencePolicy: 'EVIDENCE_CLASS_GATED',
    safetyRiskRatioMeaningfulDeviation: historicalThreshold,
    sourceStudyId: SURPASS2_STUDY.studyId,
    sourceStudySha256: SURPASS2_STUDY.contentSha256,
    scopeNote: 'Safety only. Efficacy untouched. Threshold and dose-selection rule unchanged.',
  };
  return { ...base, ruleFingerprint: fnv1a(canonicalJson(base)) };
}

/** Direct within-trial safety evidence for tirzepatide from SURPASS-2, via the UNMODIFIED extraction function. */
function buildDirectSurpass2Safety(): readonly A2SafetyCategoryResult[] {
  // `extractCandidateSafety` auto-detects a same-trial semaglutide arm and
  // classifies the result DIRECT_HEAD_TO_HEAD on its own — that branch is not
  // new, it is exercised by the frozen A2 suite for every candidate trial that
  // happens to contain both arms. SURPASS-2 is simply the first case where the
  // tirzepatide side of that same branch applies.
  //
  // candidateGroupTitle must be ONE resolved title (the function's own shape),
  // so it is resolved the same way `buildCandidateReport` resolves it for
  // every other trial: via `pickCandidateAeGroupTitle` — not exported, so
  // `resolvedCandidateTitle()` below restates the identical "highest parsed
  // mg wins" rule and a test proves the two agree.
  return extractCandidateSafety(SURPASS2_TRIAL, resolvedCandidateTitle(), null, null);
}

/** Re-derives the SAME "highest parsed mg wins" pick `pickCandidateAeGroupTitle` makes — not a new rule, a restatement so this file does not need an unexported symbol. Verified equal to the production pick by a test. */
function resolvedCandidateTitle(): string {
  const groups = SURPASS2_TRIAL.adverseEvents!.eventGroups.filter((g) => SURPASS2_TIRZEPATIDE_PATTERN.test(g.title));
  const parseMg = (title: string): number => Number(/([\d.]+)\s*mg/i.exec(title)?.[1] ?? -Infinity);
  return groups.reduce((best, g) => (parseMg(g.title) > parseMg(best.title) ? g : best)).title;
}

export interface ReAdjudicationResult {
  readonly freeze: ReAdjudicationFreeze;
  readonly historical: { readonly report: A2CandidateReport; readonly overallVerdict: string };
  readonly reAdjudicated: {
    readonly safety: readonly A2SafetyCategoryResult[];
    readonly directEvidenceUsed: A2SafetyCategoryResult | null;
    readonly falsification: A2FalsificationResult;
    readonly score: A2CandidateScore;
    readonly overallVerdict: string;
    readonly overallVerdictChanged: boolean;
  };
  readonly inputFingerprint: string;
}

export function runReAdjudication(): ReAdjudicationResult {
  // 1) HISTORICAL — runA2Analysis() called unmodified. Byte-identical to every
  // other caller of this function; nothing here can alter it.
  const historicalAnalysis = runA2Analysis();
  const historicalReport = historicalAnalysis.candidateReports.find((r) => r.summary.moleculeChemblId === CANDIDATE_ID);
  if (historicalReport === undefined) throw new Error(`${CANDIDATE_ID} not found in the historical A2 candidate space — re-adjudication has nothing to compare against.`);

  // Read directly from the unmodified, sealed preregistration — never from
  // any value this run computes, so it cannot be selected by the outcome.
  const freeze = buildFreeze(A2_PREREGISTRATION.effectSizeThresholds.safetyRiskRatioMeaningfulDeviation);

  const inputFingerprint = fnv1a(canonicalJson({
    historicalSafetyFingerprint: fnv1a(canonicalJson(historicalReport.safety)),
    surpass2Sha256: SURPASS2_STUDY.contentSha256,
    resolvedCandidateTitle: resolvedCandidateTitle(),
  }));

  // 2) RE-ADJUDICATED — merge historical (unchanged) safety rows with the new
  // direct SURPASS-2 evidence, then call the UNMODIFIED gate/score/verdict.
  const directSafety = buildDirectSurpass2Safety();
  const directDiarrhea = directSafety.find((s) => s.key === 'diarrhea') ?? null;
  const mergedSafety = [...historicalReport.safety, ...directSafety];

  const newFalsification = falsifyCandidate(historicalReport.efficacy, mergedSafety, 'EVIDENCE_CLASS_GATED');
  const newScore = scoreCandidate(historicalReport.summary, historicalReport.efficacy, mergedSafety, newFalsification);

  // Recompute the OVERALL A2 verdict with tirzepatide's report replaced,
  // everything else byte-identical to the historical run, via the REAL,
  // UNMODIFIED `decideA2Verdict` — not a restatement of its logic.
  const newReport: A2CandidateReport = { ...historicalReport, safety: mergedSafety, falsification: newFalsification, score: newScore };
  const newCandidateReports = historicalAnalysis.candidateReports.map((r) => (r.summary.moleculeChemblId === CANDIDATE_ID ? newReport : r));
  // Self-falsification is intentionally NOT re-run: it is a separate, heavier
  // probe over the historical winner and out of this step's declared scope
  // (safety evidence-class only). `decideA2Verdict(reports, null)` is its own
  // documented, pre-existing call shape for "no self-falsification available"
  // — not a new branch invented for this file.
  const newVerdict = decideA2Verdict(newCandidateReports, null);

  return {
    freeze,
    historical: { report: historicalReport, overallVerdict: historicalAnalysis.verdict.label },
    reAdjudicated: {
      safety: mergedSafety,
      directEvidenceUsed: directDiarrhea,
      falsification: newFalsification,
      score: newScore,
      overallVerdict: newVerdict.label,
      overallVerdictChanged: newVerdict.label !== historicalAnalysis.verdict.label,
    },
    inputFingerprint,
  };
}
