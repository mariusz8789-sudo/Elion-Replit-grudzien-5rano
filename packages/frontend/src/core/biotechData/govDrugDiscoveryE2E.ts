import { canonicalJson, fnv1a } from '../events/hash';
import {
  E2E01_PREREGISTRATION,
  E2E01_GENERATION_METHOD,
  E2E01_TIER_CRITERIA,
  E2E01_FALSIFICATION_ATTACKS,
  E2E01_BANNED_OUTPUT_STRINGS,
  E2E01_REQUIRED_OUTPUT_FIELDS,
  E2E01_NO_ACCESS_LABEL,
  E2E01_PROBLEM,
  E2E01_POPULATION,
  type E2E01Outcome,
  type E2E01FalsificationAttack,
} from './govDrugDiscoveryE2EPreregistration';
import { A2_PREREGISTRATION } from './a2OzempicSubstitutePreregistration';
import type { A2CandidateReport } from './a2OzempicSubstitute';
import {
  runA3GovernmentRecommendation,
  describePopulation,
  type A3CandidateView,
} from './a3GovernmentDrugRecommendation';
import type { A3SafetyLabel, A3PopulationSpec } from './a3GovernmentPreregistration';

import generatedRaw from './gov-drug-discovery-e2e/generated-candidate-space.json';
import generatedMetaRaw from './gov-drug-discovery-e2e/meta.json';
import presuppliedRaw from './gov-drug-discovery-e2e/fixture_presupplied_candidates.json';
import missingSourceRaw from './gov-drug-discovery-e2e/fixture_missing_source.json';
import injectedCounterevidenceRaw from './gov-drug-discovery-e2e/fixture_injected_counterevidence.json';

/**
 * GOV-DRUG-DISCOVERY-E2E-01 — the runnable funnel:
 *   GENERATION -> Tier-1 -> Tier-2 -> TOP3 -> deep falsification ->
 *   WINNER | honest non-winner -> research recipe (WINNER only) ->
 *   18-field government output.
 *
 * WHAT THIS ADDS OVER A2/A3, AND WHAT IT DELIBERATELY DOES NOT. It adds no
 * new scientific engine: every efficacy number, safety risk ratio,
 * existential veto and population tag is A2's and A3's, reused unchanged.
 * What it adds is the part those two could not demonstrate — that the
 * candidate space is CONSTRUCTED rather than chosen. A2 pinned the 20
 * molecules that survived its clinical-development gate; this module runs
 * the funnel over the FULL generated space that produced those 20, so the
 * reduction itself is the evidence.
 *
 * EVERY ELIMINATION IS LOGGED WITH ITS REASON AND ITS EVIDENCE. A funnel
 * that silently drops candidates proves nothing: the interesting claim is
 * not "3 survived" but "here is precisely why each of the others did not,
 * and here is the datum behind each rejection".
 *
 * A NON-WINNER IS A PASS. `selectWinner` has four ways to end without
 * naming a candidate, and the winner rule requires surviving all six
 * preregistered attacks — not merely topping a ranking. On this real
 * evidence the honest ending is expected to be one of the non-winner
 * outcomes; that is the demonstration, not a shortfall of it.
 */

export const E2E01_CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Generated space (Tier-0) — the pinned output of the mechanism query
// ---------------------------------------------------------------------------

export interface E2E01CandidateProvenance {
  readonly source: string;
  readonly identifier: string;
  readonly retrievalTime: string;
  readonly hash: string;
}

export interface E2E01GeneratedCandidate {
  readonly moleculeChemblId: string;
  readonly prefName: string | null;
  readonly moleculeType: string | null;
  readonly maxPhase: number | null;
  readonly medianPotencyNMByTarget: { readonly glp1r: number | null; readonly gipr: number | null; readonly gcgr: number | null };
  readonly qualifyingAssayCounts: { readonly glp1r: number; readonly gipr: number; readonly gcgr: number };
  readonly distinctAssayCount: number;
  readonly generatedBy: string;
  readonly provenance: E2E01CandidateProvenance;
}

interface E2E01RawGeneratedCandidate extends Omit<E2E01GeneratedCandidate, 'provenance'> {
  readonly provenance: { readonly source: string; readonly identifier: string; readonly retrievalTime: string };
}

const GENERATED_FILE_SHA256 = (generatedMetaRaw as { files: Record<string, { narrowSha256: string }> }).files['generated-candidate-space.json'].narrowSha256;

/** The per-candidate provenance hash is the SHA-256 of the pinned file the candidate was read from — the handle a reader uses to prove the row was not edited after the fact. */
export function loadGeneratedCandidates(): readonly E2E01GeneratedCandidate[] {
  return (generatedRaw as readonly E2E01RawGeneratedCandidate[]).map((c) => ({
    ...c,
    provenance: { ...c.provenance, hash: GENERATED_FILE_SHA256 },
  }));
}

/** NEGATIVE CONTROL ONLY. Never an input to generation — loaded solely so T1 can prove the generated set is not this set. */
export function loadPresuppliedCandidateIds(): ReadonlySet<string> {
  return new Set((presuppliedRaw as { candidates: readonly { moleculeChemblId: string }[] }).candidates.map((c) => c.moleculeChemblId));
}

// ---------------------------------------------------------------------------
// T1 — generation, not selection
// ---------------------------------------------------------------------------

export interface E2E01GenerationCheck {
  readonly generatedCount: number;
  readonly presuppliedCount: number;
  readonly outsidePresuppliedCount: number;
  readonly equalsPresuppliedSet: boolean;
  readonly everyCandidateHasFullProvenance: boolean;
  readonly everyCandidateGeneratedByGenerator: boolean;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export function checkGenerationNotPinned(generated: readonly E2E01GeneratedCandidate[]): E2E01GenerationCheck {
  const presupplied = loadPresuppliedCandidateIds();
  const generatedIds = new Set(generated.map((c) => c.moleculeChemblId));
  const outside = [...generatedIds].filter((id) => !presupplied.has(id));
  const equalsPresupplied = generatedIds.size === presupplied.size && [...generatedIds].every((id) => presupplied.has(id));
  const everyHasProvenance = generated.every((c) =>
    E2E01_GENERATION_METHOD.requiredProvenanceFields.every((f) => {
      const value = (c.provenance as unknown as Record<string, unknown>)[f];
      return typeof value === 'string' && value.length > 0;
    }));
  const everyGeneratedBy = generated.every((c) => c.generatedBy === E2E01_GENERATION_METHOD.generatedByLabel);

  const failures: string[] = [];
  if (generated.length < E2E01_GENERATION_METHOD.minimumGeneratedSetSize) {
    failures.push(`Generated set has ${generated.length} candidates, below the preregistered minimum of ${E2E01_GENERATION_METHOD.minimumGeneratedSetSize}.`);
  }
  if (outside.length < E2E01_GENERATION_METHOD.minimumOutsidePinnedSetSize) {
    failures.push(`Only ${outside.length} generated candidates fall outside the pre-supplied list; the preregistered minimum is ${E2E01_GENERATION_METHOD.minimumOutsidePinnedSetSize}.`);
  }
  if (equalsPresupplied) failures.push('Generated set equals the pre-supplied list: this is selection from a list, not generation.');
  if (!everyHasProvenance) failures.push('At least one generated candidate is missing a required provenance field.');
  if (!everyGeneratedBy) failures.push(`At least one candidate is not labelled generatedBy=${E2E01_GENERATION_METHOD.generatedByLabel}.`);

  return {
    generatedCount: generated.length,
    presuppliedCount: presupplied.size,
    outsidePresuppliedCount: outside.length,
    equalsPresuppliedSet: equalsPresupplied,
    everyCandidateHasFullProvenance: everyHasProvenance,
    everyCandidateGeneratedByGenerator: everyGeneratedBy,
    passed: failures.length === 0,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Funnel stages — every elimination carries a reason AND its evidence
// ---------------------------------------------------------------------------

export interface E2E01Elimination {
  readonly moleculeChemblId: string;
  readonly prefName: string | null;
  readonly stage: string;
  readonly reason: string;
  readonly evidence: string;
}

export interface E2E01StageResult {
  readonly stage: string;
  readonly criterion: string;
  readonly inputCount: number;
  readonly outputCount: number;
  readonly survivorIds: readonly string[];
  readonly eliminated: readonly E2E01Elimination[];
}

export function runTier1(generated: readonly E2E01GeneratedCandidate[]): E2E01StageResult {
  const survivors: string[] = [];
  const eliminated: E2E01Elimination[] = [];
  for (const c of generated) {
    const hasMechanism = c.qualifyingAssayCounts.glp1r + c.qualifyingAssayCounts.gipr + c.qualifyingAssayCounts.gcgr > 0;
    if (!hasMechanism) {
      eliminated.push({
        moleculeChemblId: c.moleculeChemblId, prefName: c.prefName, stage: 'TIER_1',
        reason: 'No qualifying activity at any incretin-axis target.',
        evidence: `qualifyingAssayCounts glp1r=${c.qualifyingAssayCounts.glp1r} gipr=${c.qualifyingAssayCounts.gipr} gcgr=${c.qualifyingAssayCounts.gcgr}`,
      });
      continue;
    }
    if (c.maxPhase === null || c.maxPhase < E2E01_TIER_CRITERIA.tier1.dataAvailabilityMinMaxPhase) {
      eliminated.push({
        moleculeChemblId: c.moleculeChemblId, prefName: c.prefName, stage: 'TIER_1',
        reason: `No real human clinical development (ChEMBL max_phase ${c.maxPhase === null ? 'absent' : c.maxPhase} < ${E2E01_TIER_CRITERIA.tier1.dataAvailabilityMinMaxPhase}), so no posted efficacy or safety data could exist to compare against semaglutide.`,
        evidence: `ChEMBL ${c.moleculeChemblId} max_phase=${c.maxPhase === null ? 'null' : c.maxPhase}`,
      });
      continue;
    }
    survivors.push(c.moleculeChemblId);
  }
  return {
    stage: 'TIER_1',
    criterion: `${E2E01_TIER_CRITERIA.tier1.mechanismPlausibility} AND ChEMBL max_phase >= ${E2E01_TIER_CRITERIA.tier1.dataAvailabilityMinMaxPhase}.`,
    inputCount: generated.length,
    outputCount: survivors.length,
    survivorIds: survivors,
    eliminated,
  };
}

function hasComputableEfficacy(report: A2CandidateReport): boolean {
  return report.efficacy.some((e) => e.comparisonType !== 'NO_COMPARISON' && e.deltaVsSemaglutidePp !== null);
}

function hasComputableSafety(report: A2CandidateReport): boolean {
  return report.safety.some((s) => s.riskRatio !== null && s.riskRatioCi95 !== null);
}

export function runTier2(
  tier1SurvivorIds: readonly string[],
  generated: readonly E2E01GeneratedCandidate[],
  candidateViews: readonly A3CandidateView[],
): E2E01StageResult {
  const byId = new Map(generated.map((c) => [c.moleculeChemblId, c]));
  const viewById = new Map(candidateViews.map((v) => [v.report.summary.moleculeChemblId, v]));
  const survivors: string[] = [];
  const eliminated: E2E01Elimination[] = [];

  for (const id of tier1SurvivorIds) {
    const generatedCandidate = byId.get(id);
    const prefName = generatedCandidate?.prefName ?? null;
    const view = viewById.get(id);
    if (view === undefined) {
      eliminated.push({
        moleculeChemblId: id, prefName, stage: 'TIER_2',
        reason: 'No ClinicalTrials.gov study with posted results was found for this molecule in the sealed populations, so neither evidence gate can be evaluated.',
        evidence: 'Absent from a2-ozempic-substitute/candidates-with-trials.json (the real search result over Type 2 Diabetes and Obesity, completed studies with posted results).',
      });
      continue;
    }
    const efficacyOk = hasComputableEfficacy(view.report);
    const safetyOk = hasComputableSafety(view.report);
    if (!efficacyOk) {
      eliminated.push({
        moleculeChemblId: id, prefName, stage: 'TIER_2',
        reason: 'Trials exist, but none yields a numerically computable efficacy comparison against semaglutide.',
        evidence: view.report.efficacy.length === 0
          ? 'No usable HbA1c or body-weight outcome measure matched this molecule\'s own arm in any of its pinned trials.'
          : `Efficacy records present but not comparable: ${view.report.efficacy.map((e) => `${e.nctId}=${e.comparisonType}`).join(', ')}.`,
      });
      continue;
    }
    if (!safetyOk) {
      eliminated.push({
        moleculeChemblId: id, prefName, stage: 'TIER_2',
        reason: 'No adverse-event category yields a computable risk ratio with a 95% CI against the semaglutide reference arm.',
        evidence: `${view.report.safety.length} safety category record(s), none with both a risk ratio and a CI.`,
      });
      continue;
    }
    survivors.push(id);
  }

  return {
    stage: 'TIER_2',
    criterion: `${E2E01_TIER_CRITERIA.tier2.efficacyEvidenceGate} AND ${E2E01_TIER_CRITERIA.tier2.safetyEvidenceGate}`,
    inputCount: tier1SurvivorIds.length,
    outputCount: survivors.length,
    survivorIds: survivors,
    eliminated,
  };
}

// ---------------------------------------------------------------------------
// TOP3 — ranked, with the safety veto recorded but NEVER used to hide a candidate
// ---------------------------------------------------------------------------

export interface E2E01Top3Entry {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly rank: number;
  readonly weightedScore: number;
  /** The candidate's best (most negative = best) real efficacy delta vs semaglutide, in percentage points. Null when no numeric delta exists. This, NOT the composite score, is what "direction relative to semaglutide" means. */
  readonly bestEfficacyDeltaPp: number | null;
  readonly vetoed: boolean;
  readonly vetoReason: string | null;
  readonly safetyLabel: A3SafetyLabel | null;
  readonly populationCoverage: string;
  readonly whySurvived: string;
}

export function selectTop3(tier2SurvivorIds: readonly string[], candidateViews: readonly A3CandidateView[]): readonly E2E01Top3Entry[] {
  const viewById = new Map(candidateViews.map((v) => [v.report.summary.moleculeChemblId, v]));
  const ranked = tier2SurvivorIds
    .map((id) => viewById.get(id))
    .filter((v): v is A3CandidateView => v !== undefined)
    .sort((a, b) => b.report.score.weightedScore - a.report.score.weightedScore)
    .slice(0, E2E01_TIER_CRITERIA.top3Size);

  return ranked.map((v, i) => {
    const efficacy = v.report.efficacy.filter((e) => e.deltaVsSemaglutidePp !== null);
    const bestDelta = efficacy.length === 0 ? null : efficacy.reduce((best, e) => ((e.deltaVsSemaglutidePp ?? 0) < (best.deltaVsSemaglutidePp ?? 0) ? e : best));
    const whySurvived = [
      `Passed Tier-1 (ChEMBL max_phase ${v.report.summary.maxPhase} >= ${E2E01_TIER_CRITERIA.tier1.dataAvailabilityMinMaxPhase}) and Tier-2 (computable efficacy AND safety comparison).`,
      bestDelta === null
        ? 'No numeric efficacy delta available.'
        : `Best efficacy evidence: ${bestDelta.nctId} delta ${bestDelta.deltaVsSemaglutidePp?.toFixed(2)}pp vs semaglutide (${bestDelta.comparisonType}).`,
      `Evidence-weighted score ${v.report.score.weightedScore.toFixed(3)} placed it at rank ${i + 1} of the Tier-2 survivors.`,
      v.report.score.vetoed
        ? `Carried forward VISIBLY despite the existential safety veto (${v.report.score.vetoReason}) — the veto blocks it from winning, it does not erase it from the record.`
        : 'Not vetoed by the existential safety rule.',
      `Population evidence for the requested population: ${v.population.populationCoverage}.`,
    ].join(' ');

    return {
      moleculeChemblId: v.report.summary.moleculeChemblId,
      prefName: v.report.summary.prefName,
      rank: i + 1,
      weightedScore: v.report.score.weightedScore,
      bestEfficacyDeltaPp: bestDelta?.deltaVsSemaglutidePp ?? null,
      vetoed: v.report.score.vetoed,
      vetoReason: v.report.score.vetoReason,
      safetyLabel: v.safetyLabel,
      populationCoverage: v.population.populationCoverage,
      whySurvived,
    };
  });
}

// ---------------------------------------------------------------------------
// Deep falsification — six preregistered attacks, run on every TOP3 candidate
// ---------------------------------------------------------------------------

export interface E2E01AttackResult {
  readonly attack: E2E01FalsificationAttack;
  readonly survived: boolean;
  readonly counterevidence: string | null;
  readonly evidenceRefs: readonly string[];
}

export interface E2E01DeepFalsification {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly attacks: readonly E2E01AttackResult[];
  readonly unresolvedCounterevidence: readonly string[];
  readonly survivedAll: boolean;
}

export function deepFalsify(view: A3CandidateView, population: A3PopulationSpec): E2E01DeepFalsification {
  const report = view.report;
  const nctIds = report.efficacy.map((e) => e.nctId);
  const attacks: E2E01AttackResult[] = [];

  // 1. EFFICACY — is the candidate actually worse, or only "not shown to be better"?
  const worse = report.efficacy.filter((e) => e.diffCiEntirelyOutsideMargin === true && (e.deltaVsSemaglutidePp ?? 0) > 0);
  const allIndirect = report.efficacy.every((e) => e.comparisonType !== 'DIRECT_HEAD_TO_HEAD');
  attacks.push({
    attack: 'EFFICACY',
    survived: worse.length === 0 && !allIndirect,
    counterevidence: worse.length > 0
      ? `${worse.length} trial(s) place this candidate WORSE than semaglutide with the CI entirely outside the preregistered margin: ${worse.map((e) => `${e.nctId} delta ${e.deltaVsSemaglutidePp?.toFixed(2)}pp`).join(', ')}.`
      : allIndirect
        ? 'Every efficacy number is a naive indirect comparison across different trials, populations and doses — no randomized head-to-head against semaglutide exists in this evidence set.'
        : null,
    evidenceRefs: nctIds,
  });

  // 2. SAFETY — any measured worse-direction signal whose CI excludes 1.
  const worseSafety = report.safety.filter((s) => s.riskRatio !== null && s.riskRatioCi95 !== null && s.riskRatio > 1 && s.riskRatioCi95.low > 1);
  attacks.push({
    attack: 'SAFETY',
    survived: worseSafety.length === 0,
    counterevidence: worseSafety.length > 0
      ? `Measured worse-direction adverse-event signal(s): ${worseSafety.map((s) => `${s.label} risk ratio ${s.riskRatio?.toFixed(2)} (95% CI [${s.riskRatioCi95?.low.toFixed(2)}, ${s.riskRatioCi95?.high.toFixed(2)}])`).join('; ')}.`
      : null,
    evidenceRefs: ['ctgov:NCT03987919 (semaglutide reference arm)', ...nctIds],
  });

  // 3. SUBGROUP — does the evidence cover the requested population, and more than one setting?
  const matched = view.population.matchingTrialNctIds;
  attacks.push({
    attack: 'SUBGROUP',
    survived: matched.length > 0 && report.efficacy.length > 1,
    counterevidence: matched.length === 0
      ? 'No trial behind this candidate carries structured conditions matching the requested population: subgroup applicability is unestablished.'
      : report.efficacy.length <= 1
        ? 'All efficacy evidence comes from a single trial, so no subgroup or setting-to-setting consistency can be assessed.'
        : null,
    evidenceRefs: matched.length > 0 ? matched : nctIds,
  });

  // 4. LONG_TERM — trial-window evidence only; development stage as a disclosed proxy.
  const approved = report.summary.maxPhase >= 4;
  attacks.push({
    attack: 'LONG_TERM',
    survived: false,
    counterevidence: approved
      ? 'Evidence is confined to the randomized trial window; no post-marketing or long-term outcome source is integrated in this run, so durability and rare-event risk remain unestablished.'
      : `Development stage is ChEMBL max_phase ${report.summary.maxPhase} (regulatory review has not concluded), and no long-term outcome source is integrated in this run.`,
    evidenceRefs: [`chembl:${report.summary.moleculeChemblId} max_phase=${report.summary.maxPhase}`, `fixture:${E2E01_NO_ACCESS_LABEL}:post-marketing-pharmacovigilance`],
  });

  // 5. EXPOSURE_OR_PUBLICATION_BIAS — arm sizes and replication.
  const smallArms = report.efficacy.filter((e) => e.candidateArm.n < A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison);
  const singleTrial = report.efficacy.length <= 1;
  attacks.push({
    attack: 'EXPOSURE_OR_PUBLICATION_BIAS',
    survived: smallArms.length === 0 && !singleTrial,
    counterevidence: smallArms.length > 0
      ? `${smallArms.length} contributing arm(s) fall below the preregistered minimum size of ${A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison}: ${smallArms.map((e) => `${e.nctId} n=${e.candidateArm.n}`).join(', ')}.`
      : singleTrial
        ? 'A single contributing trial cannot distinguish a real effect from a selectively reported one; no independent replication is present in this evidence set.'
        : null,
    evidenceRefs: nctIds,
  });

  // 6. CONFLICTING_TRIALS — does the candidate's own evidence disagree with itself?
  const deltas = report.efficacy.map((e) => e.deltaVsSemaglutidePp).filter((d): d is number => d !== null);
  const directions = new Set(deltas.map((d) => Math.sign(d)));
  attacks.push({
    attack: 'CONFLICTING_TRIALS',
    survived: directions.size <= 1,
    counterevidence: directions.size > 1
      ? `This candidate's own trials disagree in direction relative to semaglutide: ${report.efficacy.map((e) => `${e.nctId}=${e.deltaVsSemaglutidePp?.toFixed(2)}pp`).join(', ')}.`
      : null,
    evidenceRefs: nctIds,
  });

  const unresolved = attacks.filter((a) => !a.survived && a.counterevidence !== null).map((a) => `${a.attack}: ${a.counterevidence}`);
  void population;
  return {
    moleculeChemblId: report.summary.moleculeChemblId,
    prefName: report.summary.prefName,
    attacks,
    unresolvedCounterevidence: unresolved,
    survivedAll: attacks.every((a) => a.survived),
  };
}

// ---------------------------------------------------------------------------
// Injected counterevidence (adversarial FLIP control)
// ---------------------------------------------------------------------------

export interface E2E01InjectedCounterevidence {
  readonly attack: E2E01FalsificationAttack;
  readonly claim: string;
  readonly unresolved: boolean;
  readonly evidenceRef: string;
}

export function loadInjectedCounterevidence(): E2E01InjectedCounterevidence {
  const raw = (injectedCounterevidenceRaw as { injectedCounterevidence: { attack: string; claim: string; unresolved: boolean; evidenceRef: string } }).injectedCounterevidence;
  return { attack: raw.attack as E2E01FalsificationAttack, claim: raw.claim, unresolved: raw.unresolved, evidenceRef: raw.evidenceRef };
}

/** Applies the synthetic counterevidence to one candidate's falsification record, clearly labelled. Used only by the FLIP control. */
export function applyInjectedCounterevidence(falsification: E2E01DeepFalsification, injected: E2E01InjectedCounterevidence): E2E01DeepFalsification {
  const attacks = falsification.attacks.map((a) => (a.attack === injected.attack
    ? { ...a, survived: false, counterevidence: `${a.counterevidence === null ? '' : `${a.counterevidence} `}INJECTED (${injected.evidenceRef}): ${injected.claim}`, evidenceRefs: [...a.evidenceRefs, injected.evidenceRef] }
    : a));
  const unresolved = attacks.filter((a) => !a.survived && a.counterevidence !== null).map((a) => `${a.attack}: ${a.counterevidence}`);
  return { ...falsification, attacks, unresolvedCounterevidence: unresolved, survivedAll: attacks.every((a) => a.survived) };
}

// ---------------------------------------------------------------------------
// Winner selection — four of five outcomes end without naming a candidate
// ---------------------------------------------------------------------------

export interface E2E01WinnerDecision {
  readonly outcome: E2E01Outcome;
  readonly winnerId: string | null;
  readonly winnerName: string | null;
  readonly reason: string;
  readonly whyWinnerSurvivedFalsification: string | null;
}

export function selectWinner(
  top3: readonly E2E01Top3Entry[],
  falsifications: readonly E2E01DeepFalsification[],
  tier2SurvivorCount: number,
): E2E01WinnerDecision {
  if (tier2SurvivorCount === 0 || top3.length === 0) {
    return {
      outcome: 'INSUFFICIENT_EVIDENCE',
      winnerId: null, winnerName: null,
      reason: 'No candidate reached Tier-2: nothing in the generated space has both a computable efficacy comparison and a computable safety comparison against semaglutide.',
      whyWinnerSurvivedFalsification: null,
    };
  }

  const nonVetoed = top3.filter((c) => !c.vetoed);
  if (nonVetoed.length === 0) {
    return {
      outcome: 'NO_SAFE_WINNER',
      winnerId: null, winnerName: null,
      reason: `Every TOP3 candidate is blocked by the existential safety veto: ${top3.map((c) => `${c.prefName} (${c.vetoReason})`).join('; ')}.`,
      whyWinnerSurvivedFalsification: null,
    };
  }

  const falsificationById = new Map(falsifications.map((f) => [f.moleculeChemblId, f]));
  const clean = nonVetoed.filter((c) => falsificationById.get(c.moleculeChemblId)?.survivedAll === true && c.populationCoverage === 'DIRECT_EVIDENCE_FOR_POPULATION');

  /**
   * "Opposite directions relative to semaglutide" means exactly that: the
   * sign of the real efficacy delta, not the sign of the composite score.
   * Reading the composite score here produced a reason string the data did
   * not support (it aggregates safety and evidence strength too), so this
   * is measured from bestEfficacyDeltaPp directly.
   */
  const anyBetter = nonVetoed.some((c) => c.bestEfficacyDeltaPp !== null && c.bestEfficacyDeltaPp < 0);
  const anyWorse = nonVetoed.some((c) => c.bestEfficacyDeltaPp !== null && c.bestEfficacyDeltaPp > 0);
  const conflicting = anyBetter && anyWorse;

  if (clean.length === 1 && !conflicting) {
    const winner = clean[0];
    const f = falsificationById.get(winner.moleculeChemblId)!;
    return {
      outcome: 'WINNER',
      winnerId: winner.moleculeChemblId,
      winnerName: winner.prefName,
      reason: `${winner.prefName} is the only TOP3 candidate that is not vetoed on safety, carries trial evidence in the requested population, and survives all ${E2E01_FALSIFICATION_ATTACKS.length} preregistered attacks with no unresolved counterevidence.`,
      whyWinnerSurvivedFalsification: f.attacks.map((a) => `${a.attack}: survived`).join('; '),
    };
  }

  if (conflicting) {
    return {
      outcome: 'CONFLICTING_EVIDENCE',
      winnerId: null, winnerName: null,
      reason: `Eligible candidates point in opposite directions relative to semaglutide on their own efficacy evidence: ${nonVetoed.map((c) => `${c.prefName}=${c.bestEfficacyDeltaPp === null ? 'n/a' : `${c.bestEfficacyDeltaPp.toFixed(2)}pp`}`).join(', ')}. No candidate can be named without suppressing the disagreement.`,
      whyWinnerSurvivedFalsification: null,
    };
  }

  const leader = nonVetoed[0];
  const leaderFalsification = falsificationById.get(leader.moleculeChemblId);
  const leaderIsWorse = leader.bestEfficacyDeltaPp !== null && leader.bestEfficacyDeltaPp > 0;
  const vetoedBetter = top3.filter((c) => c.vetoed && c.bestEfficacyDeltaPp !== null && c.bestEfficacyDeltaPp < 0);
  return {
    outcome: 'NO_WINNER',
    winnerId: null, winnerName: null,
    reason: [
      `${leader.prefName} leads the candidates still eligible after the safety veto`,
      leaderIsWorse
        ? `, but its own efficacy evidence places it ${leader.bestEfficacyDeltaPp!.toFixed(2)}pp WORSE than semaglutide, not better`
        : '',
      `, and it carries ${leaderFalsification?.unresolvedCounterevidence.length ?? 0} unresolved counterevidence finding(s) after deep falsification`,
      leader.populationCoverage === 'DIRECT_EVIDENCE_FOR_POPULATION' ? '' : ', with no trial behind it matching the requested population',
      '. ',
      vetoedBetter.length > 0
        ? `The only candidate in this run with a real efficacy advantage (${vetoedBetter.map((c) => `${c.prefName} ${c.bestEfficacyDeltaPp!.toFixed(2)}pp`).join(', ')}) is blocked by the existential safety veto, so it cannot be named either. `
        : '',
      'Naming any candidate would require ignoring evidence this run actually found.',
    ].join(''),
    whyWinnerSurvivedFalsification: null,
  };
}

// ---------------------------------------------------------------------------
// Research recipe — emitted if and only if outcome === WINNER
// ---------------------------------------------------------------------------

export interface E2E01ResearchRecipe {
  readonly mechanism: string;
  readonly formulationConcept: string;
  readonly conceptualSynthesisRoute: string;
  readonly requiredProperties: readonly string[];
  readonly materialClasses: readonly string[];
  readonly provenance: string;
  readonly sources: readonly string[];
  readonly identifiers: readonly string[];
  readonly evidence: readonly string[];
  readonly replay: string;
  readonly dualUseGuard: 'ASSERTED';
}

/**
 * Research-grade and deliberately conceptual: a target mechanism, a
 * formulation concept, a route described at the level of chemistry a
 * reviewer can assess — never a dose, never a patient instruction, never
 * step-level operational detail for a controlled or hazardous substance.
 */
export function generateResearchRecipe(
  decision: E2E01WinnerDecision,
  view: A3CandidateView | undefined,
  replayFingerprint: string,
): E2E01ResearchRecipe | null {
  if (decision.outcome !== 'WINNER' || decision.winnerId === null || view === undefined) return null;
  const s = view.report.summary;
  const targets: string[] = [];
  if (s.medianPotencyNMByTarget.glp1r !== null) targets.push(`GLP-1R (median ${s.medianPotencyNMByTarget.glp1r} nM)`);
  if (s.medianPotencyNMByTarget.gipr !== null) targets.push(`GIPR (median ${s.medianPotencyNMByTarget.gipr} nM)`);
  if (s.medianPotencyNMByTarget.gcgr !== null) targets.push(`GCGR (median ${s.medianPotencyNMByTarget.gcgr} nM)`);

  return {
    mechanism: `Incretin-axis engagement at ${targets.join(', ')}, established from real ChEMBL binding/functional data rather than assumed from structural similarity to semaglutide.`,
    formulationConcept: `${s.moleculeType ?? 'Compound'} class agent intended for population-level metabolic control; formulation strategy must be selected by a qualified team from the required properties below, not inferred from this record.`,
    conceptualSynthesisRoute: 'CONCEPTUAL ONLY: route selection is left to a qualified synthetic chemistry team working under institutional oversight. This record intentionally contains no step-level procedure, no reagent quantities, and no operational parameters.',
    requiredProperties: [
      `Retained potency at the mechanism targets above (reference: the pinned ChEMBL medians for ${s.moleculeChemblId}).`,
      'Adverse-event profile at or below the semaglutide reference arm across every preregistered safety category.',
      'Exposure characteristics compatible with the dosing interval studied in the contributing trials.',
      'Manufacturability at national-programme scale — UNVERIFIED in this run, see NO_ACCESS_DECLARED sources.',
    ],
    materialClasses: [s.moleculeType ?? 'UNSPECIFIED_IN_SOURCE'],
    provenance: 'ChEMBL Web Services (mechanism, potency, development stage) + ClinicalTrials.gov API v2 (efficacy, adverse events, per-trial conditions). Per-file URLs, retrieval timestamps and SHA-256 hashes in the pinned meta.json files.',
    sources: ['ChEMBL Web Services', 'ClinicalTrials.gov API v2'],
    identifiers: [s.moleculeChemblId, ...view.report.efficacy.map((e) => e.nctId)],
    evidence: view.report.efficacy.map((e) => `${e.nctId}: delta ${e.deltaVsSemaglutidePp?.toFixed(2) ?? 'n/a'}pp vs semaglutide (${e.comparisonType})`),
    replay: replayFingerprint,
    dualUseGuard: 'ASSERTED',
  };
}

// ---------------------------------------------------------------------------
// NO_ACCESS_DECLARED
// ---------------------------------------------------------------------------

export interface E2E01NoAccessDeclaration {
  readonly sourceId: string;
  readonly whatItWouldAnswer: string;
  readonly whyUnavailable: string;
  readonly status: typeof E2E01_NO_ACCESS_LABEL;
  readonly dimensionsBlocked: readonly string[];
}

export function loadNoAccessDeclarations(): readonly E2E01NoAccessDeclaration[] {
  const raw = missingSourceRaw as { requiredButUnavailableSources: readonly { sourceId: string; whatItWouldAnswer: string; whyUnavailable: string; governmentDimensionsBlocked: readonly string[] }[] };
  return raw.requiredButUnavailableSources.map((s) => ({
    sourceId: s.sourceId,
    whatItWouldAnswer: s.whatItWouldAnswer,
    whyUnavailable: s.whyUnavailable,
    status: E2E01_NO_ACCESS_LABEL,
    dimensionsBlocked: s.governmentDimensionsBlocked,
  }));
}

// ---------------------------------------------------------------------------
// Truth-engine assertions
// ---------------------------------------------------------------------------

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') { out.push(value); return; }
  if (Array.isArray(value)) { for (const v of value) collectStrings(v, out); return; }
  if (value !== null && typeof value === 'object') { for (const v of Object.values(value)) collectStrings(v, out); }
}

export interface E2E01BannedStringHit { readonly banned: string; readonly inText: string; }

/** Walks EVERY string the run emits. Any hit fails the run — this is the build-failing check, not a lint suggestion. */
export function scanForBannedStrings(output: unknown): readonly E2E01BannedStringHit[] {
  const strings: string[] = [];
  collectStrings(output, strings);
  const hits: E2E01BannedStringHit[] = [];
  for (const text of strings) {
    const lower = text.toLowerCase();
    for (const banned of E2E01_BANNED_OUTPUT_STRINGS) {
      if (lower.includes(banned.toLowerCase())) hits.push({ banned, inText: text.slice(0, 160) });
    }
  }
  return hits;
}

export interface E2E01ActionPreference {
  readonly preferredWinnerId: string | null;
  readonly rationale: string;
}

export interface E2E01ActionPreferenceResult {
  readonly accepted: boolean;
  readonly reason: string;
  readonly answerRecordOutcomeAfter: E2E01Outcome;
  readonly answerRecordWinnerIdAfter: string | null;
}

/**
 * The Action layer may withhold or gate. It may never rewrite the
 * AnswerRecord. A preference naming a winner the evidence did not produce
 * is REJECTED, and the AnswerRecord is returned unchanged — the rejection
 * is the proof, not a promise in a comment.
 */
export function applyActionPreference(decision: E2E01WinnerDecision, preference: E2E01ActionPreference): E2E01ActionPreferenceResult {
  const contradicts = preference.preferredWinnerId !== null && preference.preferredWinnerId !== decision.winnerId;
  return {
    accepted: !contradicts,
    reason: contradicts
      ? `Action-layer preference names ${preference.preferredWinnerId} as winner, but the AnswerRecord outcome is ${decision.outcome} with winner ${decision.winnerId ?? 'none'}. Policy may limit what is acted on; it may never rewrite what was found. Preference rejected; AnswerRecord unchanged.`
      : 'Action-layer preference does not contradict the AnswerRecord.',
    answerRecordOutcomeAfter: decision.outcome,
    answerRecordWinnerIdAfter: decision.winnerId,
  };
}

// ---------------------------------------------------------------------------
// The 18-field government output
// ---------------------------------------------------------------------------

export interface E2E01GovernmentOutput {
  readonly problem: string;
  readonly candidateSpace: string;
  readonly method: string;
  readonly evidence: readonly string[];
  readonly top3: readonly E2E01Top3Entry[];
  readonly whyEachSurvived: readonly string[];
  readonly whyOthersFailed: readonly string[];
  readonly winner: string;
  readonly whyWinnerSurvivedFalsification: string;
  readonly counterevidence: readonly string[];
  readonly safetyProfile: readonly string[];
  readonly uncertainty: readonly string[];
  readonly whatWouldChangeVerdict: readonly string[];
  readonly researchRecipe?: E2E01ResearchRecipe;
  readonly nextExperiment: string;
  readonly governmentRecommendation: string;
  readonly fullProvenance: readonly string[];
  readonly replayFingerprint: string;
  readonly status: 'TRUTH' | 'ACTION';
}

export interface E2E01ScenarioResult {
  readonly scenarioId: string;
  readonly contractVersion: string;
  readonly preregistrationFingerprint: string;
  readonly population: A3PopulationSpec;
  readonly generationCheck: E2E01GenerationCheck;
  readonly stages: readonly E2E01StageResult[];
  readonly top3: readonly E2E01Top3Entry[];
  readonly falsifications: readonly E2E01DeepFalsification[];
  readonly decision: E2E01WinnerDecision;
  readonly researchRecipe: E2E01ResearchRecipe | null;
  readonly noAccessDeclarations: readonly E2E01NoAccessDeclaration[];
  readonly governmentOutput: E2E01GovernmentOutput;
  readonly bannedStringHits: readonly E2E01BannedStringHit[];
  readonly runFingerprint: string;
}

export interface E2E01RunOptions {
  /** FLIP control: inject the synthetic counterevidence against the leading candidate. */
  readonly injectCounterevidence?: boolean;
}

export function runGovDrugDiscoveryE2E(options: E2E01RunOptions = {}): E2E01ScenarioResult {
  const population = E2E01_POPULATION as A3PopulationSpec;
  const generated = loadGeneratedCandidates();
  const generationCheck = checkGenerationNotPinned(generated);

  const a3 = runA3GovernmentRecommendation(population);
  if (a3.status !== 'ANSWERED') {
    throw new Error('E2E-01 requires a population-supplied A3 run; the scenario supplies one, so REQUIRED_POLICY_INPUT here means the population contract changed.');
  }
  const candidateViews = a3.answerRecord.candidateViews;

  const tier1 = runTier1(generated);
  const tier2 = runTier2(tier1.survivorIds, generated, candidateViews);
  const top3 = selectTop3(tier2.survivorIds, candidateViews);

  const viewById = new Map(candidateViews.map((v) => [v.report.summary.moleculeChemblId, v]));
  let falsifications = top3
    .map((entry) => viewById.get(entry.moleculeChemblId))
    .filter((v): v is A3CandidateView => v !== undefined)
    .map((v) => deepFalsify(v, population));

  if (options.injectCounterevidence === true) {
    const injected = loadInjectedCounterevidence();
    const leadNonVetoed = top3.find((c) => !c.vetoed) ?? top3[0];
    falsifications = falsifications.map((f) => (leadNonVetoed !== undefined && f.moleculeChemblId === leadNonVetoed.moleculeChemblId ? applyInjectedCounterevidence(f, injected) : f));
  }

  const decision = selectWinner(top3, falsifications, tier2.survivorIds.length);
  const stages = [tier1, tier2];
  const noAccessDeclarations = loadNoAccessDeclarations();

  const runFingerprint = fnv1a(canonicalJson({
    preregistration: E2E01_PREREGISTRATION.fingerprint,
    generated: generated.length,
    tier1: tier1.survivorIds,
    tier2: tier2.survivorIds,
    top3: top3.map((c) => ({ id: c.moleculeChemblId, score: c.weightedScore, vetoed: c.vetoed })),
    falsifications: falsifications.map((f) => ({ id: f.moleculeChemblId, survivedAll: f.survivedAll, unresolved: f.unresolvedCounterevidence.length })),
    outcome: decision.outcome,
    winnerId: decision.winnerId,
  }));

  const winnerView = decision.winnerId === null ? undefined : viewById.get(decision.winnerId);
  const researchRecipe = generateResearchRecipe(decision, winnerView, runFingerprint);

  const governmentOutput = buildGovernmentOutput({
    generationCheck, stages, top3, falsifications, decision, researchRecipe, noAccessDeclarations, candidateViews, runFingerprint, population,
  });

  const bannedStringHits = scanForBannedStrings(governmentOutput);

  return {
    scenarioId: E2E01_PREREGISTRATION.scenarioId,
    contractVersion: E2E01_CONTRACT_VERSION,
    preregistrationFingerprint: E2E01_PREREGISTRATION.fingerprint,
    population,
    generationCheck,
    stages,
    top3,
    falsifications,
    decision,
    researchRecipe,
    noAccessDeclarations,
    governmentOutput,
    bannedStringHits,
    runFingerprint,
  };
}

function buildGovernmentOutput(input: {
  generationCheck: E2E01GenerationCheck;
  stages: readonly E2E01StageResult[];
  top3: readonly E2E01Top3Entry[];
  falsifications: readonly E2E01DeepFalsification[];
  decision: E2E01WinnerDecision;
  researchRecipe: E2E01ResearchRecipe | null;
  noAccessDeclarations: readonly E2E01NoAccessDeclaration[];
  candidateViews: readonly A3CandidateView[];
  runFingerprint: string;
  population: A3PopulationSpec;
}): E2E01GovernmentOutput {
  const { generationCheck, stages, top3, falsifications, decision, researchRecipe, noAccessDeclarations, runFingerprint, population } = input;
  const tier1 = stages[0];
  const tier2 = stages[1];

  const counterevidence = falsifications.flatMap((f) => f.unresolvedCounterevidence.map((c) => `${f.prefName} — ${c}`));

  const safetyProfile = top3.map((c) => (c.vetoed
    ? `${c.prefName}: no reassuring label applies — a measured worse-direction signal exists (${c.vetoReason}).`
    : `${c.prefName}: ${c.safetyLabel ?? 'INSUFFICIENT_SAFETY_EVIDENCE'}.`));

  const uncertainty = [
    ...noAccessDeclarations.map((d) => `${d.status} — ${d.sourceId}: ${d.whatItWouldAnswer} (${d.whyUnavailable}) Blocks: ${d.dimensionsBlocked.join(', ')}.`),
    `${top3.filter((c) => c.populationCoverage !== 'DIRECT_EVIDENCE_FOR_POPULATION').length} of ${top3.length} TOP3 candidates lack trial evidence carrying structured conditions matching the requested population.`,
  ];

  const whatWouldChangeVerdict = [
    'A randomized head-to-head trial against semaglutide in the requested population, reporting both the metabolic endpoint and the preregistered adverse-event categories.',
    'Independent replication of any single-trial efficacy signal in this evidence set.',
    'An integrated post-marketing pharmacovigilance source, which would convert the LONG_TERM attack from unestablished to answerable.',
    'An integrated national procurement/pricing source, which would let the government decision dimensions carry a real value instead of INSUFFICIENT_EVIDENCE.',
    ...(decision.outcome === 'WINNER' ? ['Any credible counterevidence against the named winner — the run is designed to revise, and the FLIP control demonstrates it doing so.'] : []),
  ];

  return {
    problem: E2E01_PROBLEM,
    candidateSpace: `${generationCheck.generatedCount} molecules GENERATED from mechanism (ChEMBL activity at GLP-1R/GIPR/GCGR; no drug name was ever the query), of which ${generationCheck.outsidePresuppliedCount} appear in no pre-supplied list. Tier-1 kept ${tier1.outputCount}; Tier-2 kept ${tier2.outputCount}; TOP3 carried ${top3.length} forward.`,
    method: `Generation -> Tier-1 (${tier1.criterion}) -> Tier-2 (${tier2.criterion}) -> evidence-weighted ranking with the existential safety veto recorded -> ${E2E01_FALSIFICATION_ATTACKS.length} preregistered falsification attacks per surviving candidate -> winner selection over ${E2E01_PREREGISTRATION.allowedOutcomes.length} allowed outcomes, four of which name no candidate. All criteria sealed at preregistration ${E2E01_PREREGISTRATION.fingerprint} before the generated space was pulled.`,
    evidence: top3.flatMap((c) => {
      const view = input.candidateViews.find((v) => v.report.summary.moleculeChemblId === c.moleculeChemblId);
      return (view?.report.efficacy ?? []).map((e) => `${c.prefName} ${e.nctId}: delta ${e.deltaVsSemaglutidePp?.toFixed(2) ?? 'n/a'}pp vs semaglutide (${e.comparisonType}, arm n=${e.candidateArm.n})`);
    }),
    top3,
    whyEachSurvived: top3.map((c) => `${c.prefName}: ${c.whySurvived}`),
    whyOthersFailed: [
      `Tier-1 removed ${tier1.eliminated.length} generated molecules. Representative reasons: ${[...new Set(tier1.eliminated.map((e) => e.reason))].slice(0, 3).join(' | ')}`,
      `Tier-2 removed ${tier2.eliminated.length} Tier-1 survivors: ${tier2.eliminated.map((e) => `${e.prefName ?? e.moleculeChemblId} (${e.reason})`).join('; ')}`,
    ],
    winner: decision.outcome === 'WINNER' && decision.winnerName !== null ? decision.winnerName : decision.outcome,
    whyWinnerSurvivedFalsification: decision.whyWinnerSurvivedFalsification ?? `No candidate was named. ${decision.reason}`,
    counterevidence: counterevidence.length > 0 ? counterevidence : ['No unresolved counterevidence was surfaced against the TOP3 candidates.'],
    safetyProfile,
    uncertainty,
    whatWouldChangeVerdict,
    ...(researchRecipe === null ? {} : { researchRecipe }),
    nextExperiment: `A randomized head-to-head trial of ${top3.length > 0 ? top3[0].prefName : 'the leading Tier-2 survivor'} against semaglutide in ${describePopulation(population)}, powered for both the metabolic endpoint and the preregistered adverse-event categories.`,
    governmentRecommendation: decision.outcome === 'WINNER' && decision.winnerName !== null
      ? `Population-level research finding: ${decision.winnerName} is the best-supported candidate in this evidence set, subject to clinical and regulatory approval. This is not a prescription, a dose, or an instruction about any individual.`
      : `Population-level research finding: ${decision.outcome}. No candidate is recommended for national substitution on this evidence. ${decision.reason} This is not a prescription, a dose, or an instruction about any individual.`,
    fullProvenance: [
      `Generated candidate space: ChEMBL Web Services, pinned SHA-256 ${GENERATED_FILE_SHA256}, retrieved ${(generatedMetaRaw as { retrievedAt: string }).retrievedAt}.`,
      'Efficacy, adverse events and per-trial conditions: ClinicalTrials.gov API v2 — per-file URLs, retrieval timestamps and SHA-256 hashes in a2-ozempic-substitute/meta.json and a3-government/meta.json.',
      `Sealed criteria: preregistration ${E2E01_PREREGISTRATION.fingerprint}; upstream lineage A1 ${E2E01_PREREGISTRATION.priorRunFingerprints.a1Glp1}, A2 ${E2E01_PREREGISTRATION.priorRunFingerprints.a2OzempicSubstitute}, A3 ${E2E01_PREREGISTRATION.priorRunFingerprints.a3Government}.`,
    ],
    replayFingerprint: runFingerprint,
    status: 'TRUTH',
  };
}

/** Every one of the 18 preregistered fields must be present and non-empty. `researchRecipe` is intentionally excluded — it exists only for WINNER. */
export function missingRequiredOutputFields(output: E2E01GovernmentOutput): readonly string[] {
  const record = output as unknown as Record<string, unknown>;
  return E2E01_REQUIRED_OUTPUT_FIELDS.filter((field) => {
    const value = record[field];
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
  });
}
