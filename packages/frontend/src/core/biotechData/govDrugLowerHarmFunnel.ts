import { canonicalJson, fnv1a } from '../events/hash';
import {
  generateDifferentiatingExperiment,
  type DiscriminatingExperimentSpec,
  type GenerateDifferentiatingExperimentResult,
} from '../agent/differentiatingExperimentGenerator';
import { TAU_DISCRIMINABILITY } from '../agent/observationGap';
import {
  evaluatePracticalCandidate,
  surfaceFor,
  type CandidateEvidence,
  type GatedCandidate,
  type GateDecision,
} from '../agent/practicalCandidateGate';
import type { PracticalCandidate } from '../agent/discoveryCampaign';
import { runA2Analysis, type A2CandidateReport } from './a2OzempicSubstitute';
import { rankForLowerHarm, type LowerHarmCandidateResult } from './govDrugLowerHarmRanking';
import { LOWER_HARM_PREREGISTRATION, LOWER_HARM_SCENARIO_ID } from './govDrugLowerHarmPreregistration';
import { buildFinalistPredictions, type CandidateReportView } from './govDrugDiscoveryCampaign';

/**
 * LOWER-HARM FUNNEL — mandate step 10, part 3: TOP10 -> TOP2 -> frozen
 * falsification -> G2 -> adjudication -> comparison -> WINNER | NO_WINNER.
 *
 * NO SECOND ENGINE. Every decision-making step below calls an EXISTING,
 * unmodified function:
 *   - hard filter / ranking: `rankForLowerHarm` (D-049), unchanged.
 *   - falsification: `generateDifferentiatingExperiment` (Phase G, G2),
 *     unchanged; `TAU_DISCRIMINABILITY` imported, not redefined.
 *   - the sigma-from-published-CI glue: `buildFinalistPredictions`, exported
 *     from govDrugDiscoveryCampaign.ts for this reuse rather than
 *     re-derived here — same formula, same Z_95 constant, one definition.
 *   - safety/governance adjudication: `evaluatePracticalCandidate` /
 *     `surfaceFor` (the SAME gate A2's own winner path uses), unchanged.
 * This file supplies only the GLUE connecting them for the LOWER-HARM
 * candidate space and its own frozen ranking rule (D-048/D-049) — no new
 * veto, no new discriminability statistic, no new safety criterion.
 */

export const LOWER_HARM_FUNNEL_CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// STAGE: DIVERSITY / REDUNDANCY CHECK
// ---------------------------------------------------------------------------

export interface MechanismSignature {
  readonly candidateId: string;
  /** Sorted target keys with a real, qualifying binding measurement — a structural fact from A2's own generation, not a new classification. */
  readonly engagedTargets: readonly string[];
}

export interface DiversityReport {
  readonly signatures: readonly MechanismSignature[];
  readonly distinctMechanismClasses: number;
  /** Candidate ids sharing an IDENTICAL engaged-target signature with at least one other qualifier — reported, never silently collapsed, because sharing a primary target does not make two real molecules the same candidate. */
  readonly sameSignatureGroups: readonly (readonly string[])[];
}

function mechanismSignature(report: A2CandidateReport): MechanismSignature {
  const t = report.summary.medianPotencyNMByTarget;
  const engaged = (['glp1r', 'gipr', 'gcgr'] as const).filter((k) => t[k] !== null);
  return { candidateId: report.summary.moleculeChemblId, engagedTargets: [...engaged].sort() };
}

/**
 * Reports mechanism diversity among candidates that already passed the hard
 * filter. Does NOT eliminate: two molecules sharing a target-engagement
 * signature (e.g. both GLP-1R-only mono-agonists) are still genuinely
 * different candidates with different potency, evidence, and safety
 * profiles — collapsing them would be exactly the fabricated-diversity
 * failure this check exists to catch in the OTHER direction. What this
 * check makes visible is the reverse honest finding: when EVERY qualifier
 * shares one signature, that is a real limit on how differentiated the
 * shortlist actually is, and it is disclosed, not hidden.
 */
export function checkDiversity(qualifying: readonly LowerHarmCandidateResult[]): DiversityReport {
  const signatures = qualifying.map((q) => mechanismSignature(q.report));
  const bySignature = new Map<string, string[]>();
  for (const s of signatures) {
    const key = s.engagedTargets.join('+') || '(none)';
    const list = bySignature.get(key) ?? [];
    list.push(s.candidateId);
    bySignature.set(key, list);
  }
  return {
    signatures,
    distinctMechanismClasses: bySignature.size,
    sameSignatureGroups: [...bySignature.values()].filter((ids) => ids.length > 1),
  };
}

// ---------------------------------------------------------------------------
// STAGE: TOP10 / TOP2
// ---------------------------------------------------------------------------

export interface Top10Result {
  readonly cap: number;
  readonly candidates: readonly LowerHarmCandidateResult[];
  readonly filled: number;
}

/** Caps to `LOWER_HARM_PREREGISTRATION`-implied 10 — this mandate step does not itself declare a cap constant, so it reuses the campaign's own convention (a cap, never padded to reach it). */
export const LOWER_HARM_TOP10_CAP = 10;
export const LOWER_HARM_TOP2_CAP = 2;

export function selectTop10(qualifying: readonly LowerHarmCandidateResult[]): Top10Result {
  const candidates = qualifying.slice(0, LOWER_HARM_TOP10_CAP);
  return { cap: LOWER_HARM_TOP10_CAP, candidates, filled: candidates.length };
}

export interface Top2Result {
  readonly candidates: readonly LowerHarmCandidateResult[];
  readonly excluded: readonly { readonly candidateId: string; readonly reason: string }[];
}

export function selectTop2(top10: Top10Result): Top2Result {
  const candidates = top10.candidates.slice(0, LOWER_HARM_TOP2_CAP);
  const excluded = top10.candidates.slice(LOWER_HARM_TOP2_CAP).map((c) => ({
    candidateId: c.report.summary.moleculeChemblId,
    reason: `Ranked outside the top ${LOWER_HARM_TOP2_CAP} by lowerHarmScore (${c.lowerHarmScore?.toFixed(4) ?? 'n/a'}) among ${top10.candidates.length} floor-qualifying, non-vetoed candidate(s).`,
  }));
  return { candidates, excluded };
}

// ---------------------------------------------------------------------------
// STAGE: FREEZE FALSIFICATION CRITERIA — before G2 sees the pair
// ---------------------------------------------------------------------------

export interface FrozenFalsificationCriteria {
  readonly scenarioId: string;
  readonly top2Ids: readonly string[];
  readonly discriminabilityThreshold: number;
  readonly falsificationMethod: 'G2_DIFFERENTIATING_EXPERIMENT';
  readonly safetyGateMethod: 'PRACTICAL_CANDIDATE_GATE';
  /** A WINNER must agree with the PRE-EXPERIMENT (lowerHarmScore) ranking — G2 cannot promote a candidate the ranking rule did not already prefer. Frozen here so it cannot be relaxed after seeing which candidate G2 favours. */
  readonly winnerRequiresPreRankAgreement: true;
  readonly fingerprint: string;
}

/**
 * Computed from the TOP2 identities and pre-existing constants only —
 * `TAU_DISCRIMINABILITY` is read, never chosen. Fingerprinted BEFORE
 * `runG2Falsification` is called; a test proves calling this twice on the
 * same TOP2 produces the identical fingerprint, and that reordering the
 * pair does not change it.
 */
export function freezeFalsificationCriteria(top2: Top2Result): FrozenFalsificationCriteria {
  const top2Ids = top2.candidates.map((c) => c.report.summary.moleculeChemblId).sort();
  const base = {
    scenarioId: LOWER_HARM_SCENARIO_ID,
    top2Ids,
    discriminabilityThreshold: TAU_DISCRIMINABILITY,
    falsificationMethod: 'G2_DIFFERENTIATING_EXPERIMENT' as const,
    safetyGateMethod: 'PRACTICAL_CANDIDATE_GATE' as const,
    winnerRequiresPreRankAgreement: true as const,
  };
  return { ...base, fingerprint: fnv1a(canonicalJson(base)) };
}

// ---------------------------------------------------------------------------
// STAGE: G2 FALSIFICATION
// ---------------------------------------------------------------------------

/** Wraps each TOP2 candidate as the minimal shape `buildFinalistPredictions` reads — no new prediction logic, the same sigma-from-published-CI derivation the campaign already uses. */
function asReportViews(top2: Top2Result): readonly CandidateReportView[] {
  return top2.candidates.map((c) => ({ report: c.report }));
}

export function runG2Falsification(top2: Top2Result): GenerateDifferentiatingExperimentResult {
  const { hypotheses, observables } = buildFinalistPredictions(asReportViews(top2));
  return generateDifferentiatingExperiment({
    hypotheses,
    observables,
    campaignId: LOWER_HARM_SCENARIO_ID,
    round: 1,
  });
}

/** Lower predicted value is better for every observable this funnel's inputs produce (efficacy delta: more negative = stronger effect; safety log-RR: lower = less risk) — both directions already encoded by `buildFinalistPredictions`'s own sign convention, not re-decided here. */
function g2FavouredCandidateId(spec: DiscriminatingExperimentSpec): string {
  return [...spec.expectedOutcomePerHypothesis].sort((a, b) => a.expectedOutcome - b.expectedOutcome)[0].hypothesisId;
}

// ---------------------------------------------------------------------------
// STAGE: ADJUDICATION — the real safety/governance gate, per candidate
// ---------------------------------------------------------------------------

function buildGatedCandidate(candidate: LowerHarmCandidateResult, g2Result: GenerateDifferentiatingExperimentResult, runFingerprint: string): GatedCandidate {
  const report = candidate.report;
  const id = report.summary.moleculeChemblId;
  const observationIds = report.efficacy.map((e) => `ctgov:${e.nctId}`);

  // Real, not hardcoded []: a G2 pair this candidate is party to and that
  // G2 could NOT separate at >=TAU_DISCRIMINABILITY is a genuine unresolved
  // disagreement in the evidence, not a general evidence-quality caveat —
  // that distinction is deliberate (see module header).
  const unresolvedContradictions: string[] =
    g2Result.outcome === 'EXPERIMENT_SELECTED'
      ? g2Result.spec.unresolvedPairs.filter((p) => p.hypothesisA === id || p.hypothesisB === id).map((p) => `G2 could not separate ${p.hypothesisA} from ${p.hypothesisB} on "${g2Result.spec.observableId}" (${p.discriminability?.toFixed(2) ?? 'n/a'} sigma, threshold ${TAU_DISCRIMINABILITY}).`)
      : g2Result.outcome === 'NO_DISCRIMINATING_EXPERIMENT_AVAILABLE'
        ? g2Result.unresolvedPairs.filter((p) => p.hypothesisA === id || p.hypothesisB === id).map((p) => `No available observable separates ${p.hypothesisA} from ${p.hypothesisB}: ${g2Result.reason}`)
        : [];

  const practicalCandidate: PracticalCandidate = {
    derivedFromModelFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint,
    statement: `Population-level LOWER-HARM finding on ${report.summary.prefName} (${id}): retains ${((candidate.efficacyFloor.fraction ?? 0) * 100).toFixed(1)}% of the reference HbA1c effect, ranks in the TOP2 under the safety-dominant LOWER-HARM ranking rule.`,
    constraints: [
      `Applies only to the trial populations and doses examined (${report.efficacy.map((e) => e.nctId).join(', ')}).`,
      'Does not establish safety, tolerability, cost, or real-world adherence equivalence beyond the categories numerically compared.',
      'Evaluated under the LOWER-HARM ranking rule (safety-dominant among floor-qualifying candidates) — not the A2 efficacy-and-safety-equal rule.',
    ],
    requiredValidation: ['Institutional/regulatory review before any policy or guidance is drawn from this finding.', 'Independent statistical review of the LOWER-HARM ranking and G2 falsification methodology.'],
    proposedProtocol: null,
    protocolWithheldReason: 'This candidate is a population-level research finding. This system does not emit an individual clinical protocol, dose, or substitution instruction.',
  };

  const evidence: CandidateEvidence = {
    observationIds,
    replayFingerprint: runFingerprint,
    provenance: { sourceUrl: 'ChEMBL Web Services + ClinicalTrials.gov API v2 (see a2-ozempic-substitute/meta.json for per-file URLs and SHA-256 hashes)', sourceVersion: '2026-09-13' },
    unresolvedContradictions,
    epistemicStatus: 'EVIDENCE_GRADED_POPULATION_FINDING',
  };

  return {
    candidate: practicalCandidate,
    candidateClass: 'intervention',
    safetyClass: 'POPULATION',
    notProven: [
      'Individual patient safety or tolerability equivalence.',
      'Cost-effectiveness, public value, or funding readiness — deliberately out of scope for this stage.',
      'Efficacy or safety outside the trial populations and doses studied.',
      'Superiority over every candidate eliminated at the hard-filter stage — only a TOP2 comparison, not an exhaustive one.',
    ],
    handoff: { recipient: 'INSTITUTION', boundary: 'Government Research plane only. Any policy action requires human/institutional authorisation through core/governance — this module authorises nothing.' },
    evidence,
  };
}

export interface AdjudicatedCandidate {
  readonly candidateId: string;
  readonly gated: GatedCandidate;
  readonly decision: GateDecision;
  readonly surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE';
}

export function runAdjudication(top2: Top2Result, g2Result: GenerateDifferentiatingExperimentResult, runFingerprint: string): readonly AdjudicatedCandidate[] {
  return top2.candidates.map((c) => {
    const gated = buildGatedCandidate(c, g2Result, runFingerprint);
    const decision = evaluatePracticalCandidate(gated);
    return { candidateId: c.report.summary.moleculeChemblId, gated, decision, surface: surfaceFor(decision.outcome, gated.safetyClass) };
  });
}

// ---------------------------------------------------------------------------
// STAGE: COMPARISON + WINNER / NO_WINNER
// ---------------------------------------------------------------------------

export type LowerHarmFunnelVerdictLabel = 'WINNER' | 'NO_WINNER';

export interface LowerHarmFunnelVerdict {
  readonly label: LowerHarmFunnelVerdictLabel;
  readonly winnerId: string | null;
  /** Every conjunct required for WINNER, and whether each held — the "why #1" / "why no winner" trace, never free prose alone. */
  readonly conjuncts: readonly { readonly criterion: string; readonly held: boolean; readonly detail: string }[];
  readonly reason: string;
}

/** Exported for direct testing with synthetic G2/adjudication inputs — the real pinned candidate space does not itself exercise every conjunct combination, and this function's own correctness must be provable independent of what today's data happens to produce. */
export function decideFunnelVerdict(top2: Top2Result, g2Result: GenerateDifferentiatingExperimentResult, adjudicated: readonly AdjudicatedCandidate[]): LowerHarmFunnelVerdict {
  const conjuncts: { criterion: string; held: boolean; detail: string }[] = [];

  const preRankFirst = top2.candidates[0]?.report.summary.moleculeChemblId ?? null;

  const g2Separated = g2Result.outcome === 'EXPERIMENT_SELECTED' && g2Result.spec.unresolvedPairs.length === 0;
  conjuncts.push({
    criterion: 'G2_SEPARATES_TOP2',
    held: g2Separated,
    detail: g2Result.outcome === 'EXPERIMENT_SELECTED'
      ? `"${g2Result.spec.observableId}" ${g2Separated ? 'separates' : 'does NOT fully separate'} the pair (${g2Result.spec.unresolvedPairs.length} unresolved pair(s), falsificationPower ${(g2Result.spec.falsificationPower * 100).toFixed(0)}%).`
      : `No discriminating experiment available: ${g2Result.reason}`,
  });

  const g2Favoured = g2Separated && g2Result.outcome === 'EXPERIMENT_SELECTED' ? g2FavouredCandidateId(g2Result.spec) : null;
  const agreesWithPreRank = g2Favoured !== null && g2Favoured === preRankFirst;
  conjuncts.push({
    criterion: 'AGREES_WITH_PRE_EXPERIMENT_RANK',
    held: agreesWithPreRank,
    detail: g2Favoured === null
      ? 'No G2-favoured candidate to compare (G2 did not separate the pair).'
      : `G2 favours ${g2Favoured}; pre-experiment TOP2 rank #1 was ${preRankFirst ?? '(none)'}. ${agreesWithPreRank ? 'Agree.' : 'DISAGREE — G2 cannot promote a candidate the frozen pre-experiment ranking did not already prefer.'}`,
  });

  const favouredAdjudication = g2Favoured !== null ? adjudicated.find((a) => a.candidateId === g2Favoured) ?? null : null;
  const gatePasses = favouredAdjudication !== null && favouredAdjudication.decision.outcome !== 'REFUSE';
  conjuncts.push({
    criterion: 'FAVOURED_CANDIDATE_PASSES_SAFETY_GATE',
    held: gatePasses,
    detail: favouredAdjudication === null
      ? 'No favoured candidate to gate.'
      : `${favouredAdjudication.candidateId} gate outcome: ${favouredAdjudication.decision.outcome}${favouredAdjudication.decision.outcome === 'REFUSE' ? ` (${favouredAdjudication.decision.reason})` : ''}.`,
  });

  const allHeld = conjuncts.every((c) => c.held);
  if (allHeld && g2Favoured !== null) {
    return { label: 'WINNER', winnerId: g2Favoured, conjuncts, reason: `${g2Favoured} satisfies every required conjunct: G2 separates the TOP2 pair, the separation agrees with the frozen pre-experiment ranking, and the favoured candidate's own safety/governance gate does not refuse it.` };
  }
  const failedCriteria = conjuncts.filter((c) => !c.held).map((c) => c.criterion);
  return { label: 'NO_WINNER', winnerId: null, conjuncts, reason: `Not every required conjunct held (failed: ${failedCriteria.join(', ')}). No candidate is promoted on a partial case.` };
}

// ---------------------------------------------------------------------------
// THE FULL FUNNEL
// ---------------------------------------------------------------------------

export interface LowerHarmFunnelReport {
  readonly scenarioId: string;
  readonly candidatePool: { readonly total: number };
  readonly hardFilter: { readonly qualifying: readonly LowerHarmCandidateResult[]; readonly eliminated: readonly LowerHarmCandidateResult[] };
  readonly diversity: DiversityReport;
  readonly top10: Top10Result;
  readonly top2: Top2Result;
  readonly falsificationCriteria: FrozenFalsificationCriteria;
  readonly g2Result: GenerateDifferentiatingExperimentResult;
  readonly adjudicated: readonly AdjudicatedCandidate[];
  readonly verdict: LowerHarmFunnelVerdict;
  readonly runFingerprint: string;
}

/**
 * The full stage sequence. Throws (fail closed, never a silent skip) if
 * TOP2 has fewer than 2 candidates — there is no pair to falsify, and this
 * function does not decide a winner by default when only one, or zero,
 * candidates qualify (that case belongs to `runLowerHarmAnalysis`'s own
 * ranking-stage verdict, which already reports it honestly).
 */
export function runLowerHarmFunnel(): LowerHarmFunnelReport {
  const a2 = runA2Analysis();
  const ranked = rankForLowerHarm(a2.candidateReports);
  const qualifying = ranked.filter((r) => r.lowerHarmScore !== null);
  const eliminated = ranked.filter((r) => r.lowerHarmScore === null);

  const diversity = checkDiversity(qualifying);
  const top10 = selectTop10(qualifying);
  const top2 = selectTop2(top10);

  if (top2.candidates.length < 2) {
    throw new Error(`runLowerHarmFunnel: only ${top2.candidates.length} candidate(s) reached TOP2 — no pair exists to falsify. This is a real, reportable state (see runLowerHarmAnalysis()'s own verdict for the ranking-stage outcome), but this function's WINNER/NO_WINNER contract requires a real pair and refuses to guess one.`);
  }

  const falsificationCriteria = freezeFalsificationCriteria(top2);
  const g2Result = runG2Falsification(top2);

  const runFingerprint = fnv1a(canonicalJson({
    scenarioId: LOWER_HARM_SCENARIO_ID,
    preregistrationFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint,
    a2AnalysisFingerprint: a2.analysisFingerprint,
    falsificationCriteriaFingerprint: falsificationCriteria.fingerprint,
    g2Result,
  }));

  const adjudicated = runAdjudication(top2, g2Result, runFingerprint);
  const verdict = decideFunnelVerdict(top2, g2Result, adjudicated);

  return {
    scenarioId: LOWER_HARM_SCENARIO_ID,
    candidatePool: { total: a2.candidateReports.length },
    hardFilter: { qualifying, eliminated },
    diversity,
    top10,
    top2,
    falsificationCriteria,
    g2Result,
    adjudicated,
    verdict,
    runFingerprint,
  };
}
