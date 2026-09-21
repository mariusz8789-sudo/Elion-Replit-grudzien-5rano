import {
  audit,
  compare,
  execute,
  freeze,
  preRegister,
  readjudicate,
  type AuditedEvidenceRecord,
  type AuditedProtocol,
  type ComparisonNarrative,
} from '../agent/genesisAdjudicationProtocol';
import {
  classifyComparisonEvidenceClass,
  rankingFingerprint,
  DEFAULT_EVIDENCE_CLASS_RANK,
  type CountedOutcomeObservation,
  type SourceStudyIdentity,
} from '../agent/evidenceProvenance';
import {
  runA2Analysis,
  type A2CandidateReport,
  type A2FalsificationResult,
  type A2CandidateScore,
  type A2SafetyCategoryResult,
} from './a2OzempicSubstitute';
import { A2_PREREGISTRATION } from './a2OzempicSubstitutePreregistration';
import { runReAdjudication } from './a2Surpass2ReAdjudication';

/**
 * REFERENCE IMPLEMENTATION #1 of the Genesis Adjudication Protocol
 * (core/agent/genesisAdjudicationProtocol.ts) — SURPASS-2 / tirzepatide
 * diarrhea, the case docs/DECISIONS.md D-042 through D-046 already ran by
 * hand. This file makes NO new scientific decision: it wraps the exact same,
 * already-verified computation in `a2Surpass2ReAdjudication.ts` in the
 * generic protocol's phase machine, so the discipline that computation
 * followed by convention is now enforced by code.
 *
 * DECISION LOGIC REUSED UNMODIFIED (not re-derived here): `runA2Analysis`,
 * `decideA2Verdict` (imported for typing only in this file — the actual call
 * happens inside `runReAdjudication`), and, transitively through
 * `runReAdjudication`, `extractCandidateSafety`, `falsifyCandidate`,
 * `scoreCandidate`. This file adds zero new veto rules and zero new scoring.
 *
 * EVIDENCE-CLASS LAYER GENUINELY WIRED IN, DECISION-INERT (finding L,
 * docs/DECISIONS.md D-046): `classifyComparisonEvidenceClass` and
 * `rankingFingerprint` from `evidenceProvenance.ts` ARE called here, on the
 * real pinned counts, to build the AUDIT record's evidence-class annotation.
 * They do not feed back into `falsifyCandidate` or `scoreCandidate` — the
 * veto/score decision still runs entirely on the pre-existing
 * `A2ComparisonType` vocabulary inside `a2OzempicSubstitute.ts`, unchanged.
 * This is real integration for audit/classification purposes; it is NOT a
 * second decision engine, and this file does not claim to be one.
 */

const PROTOCOL_ID = 'GENESIS-ADJUDICATION-A2-SURPASS2-DIARRHEA-01';
const CANDIDATE_ID = 'CHEMBL4297839';

interface A2ProtocolRule {
  readonly candidateId: string;
  readonly category: string;
  readonly threshold: number;
  readonly doseSelectionRule: string;
  readonly evidencePolicy: 'HISTORICAL_NO_EVIDENCE_CLASS' | 'EVIDENCE_CLASS_GATED';
}

interface A2AdjudicationResult {
  readonly safety: readonly A2SafetyCategoryResult[];
  readonly falsification: A2FalsificationResult;
  readonly score: A2CandidateScore;
  readonly overallVerdict: string;
}

/** From `a2-ozempic-substitute/meta.json` — the pinned file holding NCT03322631 (whole-file granularity; this repo's custody records are per-file, not per-trial). */
const TIRZEPATIDE_TRIALS_FILE_SHA256 = 'a06d2b8575c0724c4c316c601fe334a8505f44015cbff073c20910a14598c4dd';
/** From the same manifest — SURPASS-2's narrowed-file hash, also used by `surpass2DirectEvidence.ts`. */
const SURPASS2_NARROW_SHA256 = '385c58a1b7a19bedac0bb303846a8cffb23242d912edd7fc91fa93d5b278a8b0';

function studyIdentity(studyId: string, randomised: boolean): SourceStudyIdentity {
  return {
    registry: 'CLINICALTRIALS_GOV',
    studyId,
    title: studyId,
    sourceUrl: `https://clinicaltrials.gov/api/v2/studies/${studyId}`,
    contentSha256: studyId === 'NCT03987919' ? SURPASS2_NARROW_SHA256 : TIRZEPATIDE_TRIALS_FILE_SHA256,
    contentBytes: 0,
    retrievedAt: '2026-09-13T13:45:36.656Z',
    randomised,
  };
}

function observation(study: SourceStudyIdentity, groupId: string, numAffected: number, numAtRisk: number): CountedOutcomeObservation {
  return { observationId: `${study.studyId}:${groupId}:diarrhoea`, study, arm: { groupId, title: groupId, nAtRisk: numAtRisk }, term: 'Diarrhoea', numAffected, numAtRisk, codingSystem: null, population: 'GLP-1/GIP T2D trial population' };
}

/** Builds the AUDIT-layer evidence record for one comparison, via the real `evidenceProvenance.ts` classifier. Decision-inert: this label is never consulted by `falsifyCandidate`. */
function buildAuditedEvidenceRecord(label: string, exposed: CountedOutcomeObservation, reference: CountedOutcomeObservation): AuditedEvidenceRecord {
  const evidenceClass = classifyComparisonEvidenceClass(exposed, reference);
  return {
    source: 'ClinicalTrials.gov',
    sourceId: label,
    hash: exposed.study.contentSha256,
    custodyStatus: 'PINNED_VERIFIED',
    evidenceClass,
    classificationMethod: 'evidenceProvenance.ts::classifyComparisonEvidenceClass',
    rankingFingerprint: rankingFingerprint(DEFAULT_EVIDENCE_CLASS_RANK),
  };
}

// The two comparisons this reference case rests on, in the same pinned
// counts already verified byte-for-byte in sourceTrialMismatch.test.ts and
// surpass2DirectEvidence.test.ts. Built here only to CLASSIFY, not to decide.
const NCT03322631 = studyIdentity('NCT03322631', true);
const NCT03987919 = studyIdentity('NCT03987919', true);
const HISTORICAL_EVIDENCE: readonly AuditedEvidenceRecord[] = [
  buildAuditedEvidenceRecord('NCT03322631 cohort-2 (5/16) vs NCT03987919 semaglutide arm (54/469)', observation(NCT03322631, 'EG002', 5, 16), observation(NCT03987919, 'EG003', 54, 469)),
];
const GATED_EVIDENCE: readonly AuditedEvidenceRecord[] = [
  ...HISTORICAL_EVIDENCE,
  buildAuditedEvidenceRecord('NCT03987919 15mg tirzepatide (65/470) vs NCT03987919 semaglutide arm (54/469), same trial', observation(NCT03987919, 'EG002', 65, 470), observation(NCT03987919, 'EG003', 54, 469)),
];

function toResult(report: A2CandidateReport, overallVerdict: string): A2AdjudicationResult {
  return { safety: report.safety, falsification: report.falsification, score: report.score, overallVerdict };
}

/** Runs the historical rule via the real, unmodified pipeline. Deterministic — `runA2Analysis()` re-derives from the pinned fixtures each call, so `execute()`'s double-run check is genuine. */
function runHistorical(): A2AdjudicationResult {
  const analysis = runA2Analysis();
  const report = analysis.candidateReports.find((r) => r.summary.moleculeChemblId === CANDIDATE_ID);
  if (report === undefined) throw new Error(`${CANDIDATE_ID} not in the historical A2 candidate space.`);
  return toResult(report, analysis.verdict.label);
}

/** Runs the gated rule via the real, unmodified `runReAdjudication()`. Also re-derived fresh each call. */
function runGated(): A2AdjudicationResult {
  const r = runReAdjudication();
  return { safety: r.reAdjudicated.safety, falsification: r.reAdjudicated.falsification, score: r.reAdjudicated.score, overallVerdict: r.reAdjudicated.overallVerdict };
}

function describeDiff(oldResult: A2AdjudicationResult, newResult: A2AdjudicationResult): ComparisonNarrative {
  const oldDiarrhea = oldResult.safety.find((s) => s.key === 'diarrhea');
  const newDiarrheaRows = newResult.safety.filter((s) => s.key === 'diarrhea');
  const directDiarrhea = newDiarrheaRows.find((s) => s.comparisonType === 'DIRECT_HEAD_TO_HEAD' && s.riskRatio !== null);

  const remainingVetoes = newResult.score.vetoed && newResult.falsification.worseSafetySignal !== null
    ? [`${newResult.falsification.worseSafetySignal.label}: RR ${newResult.falsification.worseSafetySignal.riskRatio?.toFixed(4)} CI [${newResult.falsification.worseSafetySignal.riskRatioCi95?.low.toFixed(4)}, ${newResult.falsification.worseSafetySignal.riskRatioCi95?.high.toFixed(4)}] (${newResult.falsification.worseSafetySignal.comparisonType})`]
    : [];
  const removedVetoes = oldResult.score.vetoed && oldDiarrhea !== undefined && !remainingVetoes.some((v) => v.startsWith('Diarrhea'))
    ? [`Diarrhea: RR ${oldDiarrhea.riskRatio?.toFixed(4)} CI [${oldDiarrhea.riskRatioCi95?.low.toFixed(4)}, ${oldDiarrhea.riskRatioCi95?.high.toFixed(4)}] (${oldDiarrhea.comparisonType}, n=${oldDiarrhea.candidate?.numAtRisk}) — superseded by direct evidence, CI includes 1`]
    : [];

  return {
    whatChanged: `Diarrhea veto superseded: direct SURPASS-2 evidence (RR ${directDiarrhea?.riskRatio?.toFixed(4) ?? 'n/a'}, CI includes 1) replaces the n=16 cross-trial comparison (RR ${oldDiarrhea?.riskRatio?.toFixed(4) ?? 'n/a'}) that drove the historical veto.`,
    why: 'The evidence-class-gated policy admits only the strongest comparison per safety category; SURPASS-2 supplies a same-trial DIRECT comparison for diarrhea at the same (unchanged) highest-dose arm, outranking the cross-trial indirect one. The candidate still stays vetoed because the same trial also supplies a DIRECT comparison for a DIFFERENT category (structural serious adverse events) that independently clears the threshold — not engineered, a byproduct of reading the same trial once.',
    whatDidNotChange: [
      'Efficacy evidence (byte-identical)',
      'Dose-selection rule (highest parsed mg, unparameterised)',
      'Threshold (1.0, read from the sealed preregistration)',
      'scoreCandidate and decideA2Verdict logic',
      `Overall A2 verdict (${oldResult.overallVerdict})`,
    ],
    supersededEvidence: removedVetoes,
    remainingVetoes,
    removedVetoes,
  };
}

export function runA2AdjudicationReferenceCase(): AuditedProtocol<A2ProtocolRule, A2AdjudicationResult> {
  const declaredAt = '2026-09-14T02:00:00.000Z';

  const oldRule: A2ProtocolRule = { candidateId: CANDIDATE_ID, category: 'diarrhea', threshold: A2_PREREGISTRATION.effectSizeThresholds.safetyRiskRatioMeaningfulDeviation, doseSelectionRule: 'HIGHEST_DOSE', evidencePolicy: 'HISTORICAL_NO_EVIDENCE_CLASS' };
  const newRule: A2ProtocolRule = { ...oldRule, evidencePolicy: 'EVIDENCE_CLASS_GATED' };

  const oldFrozen = freeze(preRegister({ protocolId: `${PROTOCOL_ID}-HISTORICAL`, subjectId: CANDIDATE_ID, question: 'What is the diarrhea safety comparison for tirzepatide vs semaglutide, under the evidence available before SURPASS-2 direct arms were consulted?', rule: oldRule, declaredAt }), declaredAt);
  const newFrozen = freeze(preRegister({ protocolId: `${PROTOCOL_ID}-GATED`, subjectId: CANDIDATE_ID, question: 'Does admitting the strongest-available comparison per safety category change the diarrhea veto or the candidate\'s overall vetoed status?', rule: newRule, declaredAt }), declaredAt);

  const historicalExecuted = execute(oldFrozen, { rule: oldRule, evidenceUsed: HISTORICAL_EVIDENCE, runResult: runHistorical });
  const gatedExecuted = execute(newFrozen, { rule: newRule, evidenceUsed: GATED_EVIDENCE, runResult: runGated });

  const readjudicated = readjudicate<A2ProtocolRule, A2AdjudicationResult>(historicalExecuted, gatedExecuted, ['evidencePolicy']);
  const compared = compare(readjudicated, describeDiff);

  return audit(compared, {
    whatWasTested: 'Tirzepatide (CHEMBL4297839) diarrhea safety veto vs semaglutide, re-adjudicated under an evidence-class-gated policy using SURPASS-2 (NCT03987919) direct within-trial arms.',
    howEvidenceWasClassified: 'classifyComparisonEvidenceClass: same randomised study on both sides -> DIRECT_RANDOMISED; different studies -> INDIRECT_RANDOMISED (mirrors the pre-existing A2ComparisonType the production veto gate actually reads).',
    resultObtained: `Candidate remains vetoed=${gatedExecuted.result.score.vetoed} (overall verdict ${gatedExecuted.result.overallVerdict}); diarrhea-specific veto lifted, structural serious-AE veto stands.`,
  });
}
