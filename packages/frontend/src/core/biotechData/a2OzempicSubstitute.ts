import { canonicalJson, fnv1a } from '../events/hash';
import { A2_PREREGISTRATION, A2_SAFETY_CATEGORIES, type A2FinalVerdictLabel } from './a2OzempicSubstitutePreregistration';
import { createHypothesis, updateConfidence, rankHypotheses, evidenceMagnitudeWithinTolerance, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { PracticalCandidate } from '../agent/discoveryCampaign';
import { evaluatePracticalCandidate, surfaceFor, type GatedCandidate, type GateDecision } from '../agent/practicalCandidateGate';

import candidatesRaw from './a2-ozempic-substitute/candidates.json';
import candidatesWithTrialsRaw from './a2-ozempic-substitute/candidates-with-trials.json';
import targetsRaw from './a2-ozempic-substitute/targets.json';
import referenceSemaglutideRaw from './a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';
import trialsExenatide from './a2-ozempic-substitute/trials-CHEMBL414357.json';
import trialsGlucagon from './a2-ozempic-substitute/trials-CHEMBL5314341.json';
import trialsNativeGlp1 from './a2-ozempic-substitute/trials-CHEMBL1240772.json';
import trialsPf06291874 from './a2-ozempic-substitute/trials-CHEMBL2381848.json';
import trialsLiraglutide from './a2-ozempic-substitute/trials-CHEMBL4084119.json';
import trialsDanuglipron from './a2-ozempic-substitute/trials-CHEMBL4518483.json';
import trialsOrforglipron from './a2-ozempic-substitute/trials-CHEMBL4446782.json';
import trialsPerphenazine from './a2-ozempic-substitute/trials-CHEMBL567.json';
import trialsCotadutide from './a2-ozempic-substitute/trials-CHEMBL4297630.json';
import trialsTirzepatide from './a2-ozempic-substitute/trials-CHEMBL4297839.json';
import trialsMk0893 from './a2-ozempic-substitute/trials-CHEMBL1933349.json';
import trialsAdomeglivant from './a2-ozempic-substitute/trials-CHEMBL3707351.json';

/**
 * A2 — AUTONOMOUS OZEMPIC-SUBSTITUTE DISCOVERY: candidate analysis ->
 * falsification -> belief revision -> ranking -> self-falsification ->
 * final verdict, run over the real, pinned, mechanism-derived candidate
 * space under `./a2-ozempic-substitute/` and the rules SEALED in
 * `a2OzempicSubstitutePreregistration.ts` before that data was pulled.
 *
 * NO CANDIDATE IS ASSUMED TO WIN. `decideVerdict` can return any of the 6
 * preregistered labels, including `NO_SAFE_SUPERIOR_CANDIDATE` or
 * `INSUFFICIENT_EVIDENCE` — nothing in this file special-cases a named
 * compound. The mechanism query in the fetch script is what proposed each
 * candidate; this file only grades the evidence each one actually has.
 *
 * DIRECT vs INDIRECT COMPARISON, NEVER SILENTLY BLURRED (§8/§10). A
 * candidate's trial either contains a real semaglutide arm in the SAME RCT
 * (`DIRECT_HEAD_TO_HEAD` — the strong case) or it does not, in which case
 * the candidate's own arm is compared against semaglutide's real arm from
 * NCT03987919 (SURPASS-2, the only trial in this dataset with real
 * semaglutide safety+efficacy numbers if no direct trial exists) as a
 * `NAIVE_INDIRECT` comparison — a real, named, weaker evidence class, not
 * upgraded to look like an RCT it is not.
 */

export const A2_ANALYSIS_CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Raw pinned-fixture shapes (mirrors scripts/fetch-a2-ozempic-substitute-fixture.mjs)
// ---------------------------------------------------------------------------

export interface A2CandidateSummary {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly moleculeType: string;
  readonly maxPhase: number;
  readonly medianPotencyNMByTarget: { readonly glp1r: number | null; readonly gipr: number | null; readonly gcgr: number | null };
  readonly qualifyingAssayCounts: { readonly glp1r: number; readonly gipr: number; readonly gcgr: number };
}

interface A2TrialArm { readonly label: string; readonly type: string; }
interface A2TrialGroup { readonly id: string; readonly title: string; }
interface A2TrialCount { readonly groupId: string; readonly value: string; }
interface A2TrialDenom { readonly units: string; readonly counts: readonly A2TrialCount[]; }
interface A2TrialMeasurement { readonly groupId: string; readonly value: string; readonly spread?: string; readonly lowerLimit?: string; readonly upperLimit?: string; }
interface A2TrialClass { readonly categories: readonly { readonly measurements: readonly A2TrialMeasurement[] }[]; }
interface A2TrialOutcome {
  readonly title: string;
  readonly type: string;
  readonly paramType: string | null;
  readonly dispersionType: string | null;
  readonly unitOfMeasure: string | null;
  readonly groups: readonly A2TrialGroup[];
  readonly denoms: readonly A2TrialDenom[];
  readonly classes: readonly A2TrialClass[];
}
interface A2AdverseEventGroup {
  readonly id: string;
  readonly title: string;
  readonly deathsNumAffected: number | null;
  readonly seriousNumAffected: number | null;
  readonly seriousNumAtRisk: number | null;
  readonly otherNumAffected: number | null;
  readonly otherNumAtRisk: number | null;
}
interface A2AdverseEventStat { readonly groupId: string; readonly numEvents: number | null; readonly numAffected: number | null; readonly numAtRisk: number | null; }
interface A2AdverseEvent { readonly term: string; readonly organSystem: string | null; readonly stats: readonly A2AdverseEventStat[]; }
interface A2AdverseEvents {
  readonly frequencyThreshold: string | number | null;
  readonly eventGroups: readonly A2AdverseEventGroup[];
  readonly seriousEvents: readonly A2AdverseEvent[];
  readonly otherEvents: readonly A2AdverseEvent[];
}
export interface A2TrialRecord {
  readonly nctId: string;
  readonly briefTitle: string;
  readonly arms: readonly A2TrialArm[];
  readonly hba1cOutcomes: readonly A2TrialOutcome[];
  readonly weightOutcomes: readonly A2TrialOutcome[];
  readonly adverseEvents: A2AdverseEvents | null;
}

// ---------------------------------------------------------------------------
// Reference drug (semaglutide) numbers — reused verbatim from A1's pinned
// SUSTAIN 7 fixture, never re-derived, for candidates with no direct trial.
// ---------------------------------------------------------------------------

/** From A1's pinned NCT03191396 (SUSTAIN 7): semaglutide 1.0mg arm, real, already committed evidence. */
export const REFERENCE_HBA1C_DELTA_PP = -1.7;
export const REFERENCE_HBA1C_SD = 0.9;
export const REFERENCE_HBA1C_N = 290;

const SEMAGLUTIDE_PATTERN = /semaglutide/i;

// ---------------------------------------------------------------------------
// Efficacy extraction (generalizes A1's extractTrialEfficacy to N candidates)
// ---------------------------------------------------------------------------

function parseDoseMg(title: string): number | null {
  const m = /([\d.]+)\s*mg/i.exec(title);
  return m === null ? null : Number(m[1]);
}

function pickHighestDoseGroup(groups: readonly A2TrialGroup[], pattern: RegExp): A2TrialGroup | null {
  const matches = groups.filter((g) => pattern.test(g.title));
  if (matches.length === 0) return null;
  return matches.reduce((best, g) => ((parseDoseMg(g.title) ?? -Infinity) > (parseDoseMg(best.title) ?? -Infinity) ? g : best));
}

/**
 * Identifies the CANDIDATE's own arm specifically (never used for finding a
 * comparator — a comparator must always be identified by an actual name
 * match, or its presence would be invented). A single-arm open-label
 * trial's one group is often titled by DURATION or DOSE alone ("12/24
 * Weeks Treatment"), not the drug name — naming it would be redundant when
 * there is nothing else to name. Real example found in this dataset:
 * NCT02533453 (exenatide once-weekly, Bydureon), one group titled "12/24
 * Weeks Treatment". Falling back to "the only group" when there is exactly
 * one and no name match is a general, disclosed rule (never
 * candidate-specific), not a special case for that trial.
 */
function pickCandidateGroup(groups: readonly A2TrialGroup[], pattern: RegExp): A2TrialGroup | null {
  const direct = pickHighestDoseGroup(groups, pattern);
  if (direct !== null) return direct;
  return groups.length === 1 ? groups[0] : null;
}

function findCount(denoms: readonly A2TrialDenom[], groupId: string): number | null {
  for (const d of denoms) {
    const hit = d.counts.find((c) => c.groupId === groupId);
    if (hit !== undefined) return Number(hit.value);
  }
  return null;
}

/** 90%/95%/99% CI -> z, parsed from the dispersion type's own label. Defaults to 95% (z=1.96) only if the label names no recognized level. */
function zFromConfidenceLevel(dispersionType: string): number {
  const m = /(\d+)\s*%/.exec(dispersionType);
  const level = m === null ? 95 : Number(m[1]);
  if (level === 90) return 1.645;
  if (level === 99) return 2.576;
  return 1.96;
}

/**
 * Real trials in this dataset report dispersion two different ways: most as
 * Standard Deviation/Standard Error (a `spread` field), but some (e.g.
 * NCT01241448, adomeglivant) as a named-percent Confidence Interval with
 * `lowerLimit`/`upperLimit` instead — no `spread` field exists at all for
 * those. Both are converted to a standard error here so every downstream
 * calculation stays in one consistent unit.
 */
function armStats(outcome: A2TrialOutcome, group: A2TrialGroup): { mean: number; se: number; n: number } | null {
  const cls = outcome.classes[0];
  if (cls === undefined) return null;
  const measurement = cls.categories[0]?.measurements.find((m) => m.groupId === group.id);
  if (measurement === undefined) return null;
  const n = findCount(outcome.denoms, group.id);
  if (n === null || n <= 0) return null;
  const mean = Number(measurement.value);
  if (!Number.isFinite(mean)) return null;

  if (measurement.spread !== undefined) {
    const spread = Number(measurement.spread);
    if (!Number.isFinite(spread)) return null;
    const se = outcome.dispersionType === 'Standard Error' ? spread : spread / Math.sqrt(n);
    return { mean, se, n };
  }
  if (measurement.lowerLimit !== undefined && measurement.upperLimit !== undefined && outcome.dispersionType !== null && /confidence interval/i.test(outcome.dispersionType)) {
    const lower = Number(measurement.lowerLimit);
    const upper = Number(measurement.upperLimit);
    if (![lower, upper].every(Number.isFinite)) return null;
    const se = (upper - lower) / (2 * zFromConfidenceLevel(outcome.dispersionType));
    return { mean, se, n };
  }
  return null;
}

export type A2ComparisonType = 'DIRECT_HEAD_TO_HEAD' | 'NAIVE_INDIRECT' | 'NO_COMPARISON';
export type A2OutcomeMetric = 'HBA1C' | 'BODY_WEIGHT';
export type A2EvidenceBasis = 'RANDOMIZED_DIRECT' | 'RANDOMIZED_INDIRECT';

export interface A2EfficacyEvidence {
  readonly nctId: string;
  readonly candidateArm: { readonly title: string; readonly meanChangePp: number; readonly n: number };
  readonly comparisonType: A2ComparisonType;
  readonly outcomeMetric: A2OutcomeMetric;
  readonly evidenceBasis: A2EvidenceBasis;
  readonly deltaVsSemaglutidePp: number | null;
  readonly diffCi95: { readonly low: number; readonly high: number } | null;
  readonly withinMargin: boolean | null;
  readonly diffCiEntirelyOutsideMargin: boolean | null;
  readonly fairnessFlags: readonly string[];
}

/**
 * Extracts ONE candidate's efficacy evidence from ONE trial. Prefers HbA1c;
 * falls back to body weight only when no HbA1c outcome exists (flagged: a
 * different metric is a different question, never silently equated).
 */
export function extractCandidateEfficacy(trial: A2TrialRecord, candidatePattern: RegExp, marginPp: number): A2EfficacyEvidence | null {
  const outcomes = trial.hba1cOutcomes.length > 0 ? trial.hba1cOutcomes : trial.weightOutcomes;
  const metric: A2OutcomeMetric = trial.hba1cOutcomes.length > 0 ? 'HBA1C' : 'BODY_WEIGHT';
  const primary = outcomes.find((o) => o.type === 'PRIMARY') ?? outcomes[0];
  if (primary === undefined) return null;

  const candidateGroup = pickCandidateGroup(primary.groups, candidatePattern);
  if (candidateGroup === null) return null;
  const candidateStats = armStats(primary, candidateGroup);
  if (candidateStats === null) return null;

  const fairnessFlags: string[] = [];
  if (candidateStats.n < A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison) {
    fairnessFlags.push(`Candidate arm n=${candidateStats.n} is below the preregistered minimum (${A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison}) for a comparison.`);
  }
  if (metric === 'BODY_WEIGHT') {
    fairnessFlags.push('No HbA1c outcome available for this trial; body-weight change used instead — a different endpoint, not directly equivalent to semaglutide\'s HbA1c-based reference.');
  }

  const semaGroup = pickHighestDoseGroup(primary.groups, SEMAGLUTIDE_PATTERN);
  if (semaGroup !== null) {
    const semaStats = armStats(primary, semaGroup);
    if (semaStats !== null) {
      const delta = candidateStats.mean - semaStats.mean;
      const seDiff = Math.sqrt(candidateStats.se ** 2 + semaStats.se ** 2);
      const ci = { low: delta - 1.96 * seDiff, high: delta + 1.96 * seDiff };
      return {
        nctId: trial.nctId,
        candidateArm: { title: candidateGroup.title, meanChangePp: candidateStats.mean, n: candidateStats.n },
        comparisonType: 'DIRECT_HEAD_TO_HEAD',
        outcomeMetric: metric,
        evidenceBasis: 'RANDOMIZED_DIRECT',
        deltaVsSemaglutidePp: delta,
        diffCi95: ci,
        withinMargin: Math.abs(delta) <= marginPp,
        diffCiEntirelyOutsideMargin: ci.high < -marginPp || ci.low > marginPp,
        fairnessFlags,
      };
    }
  }

  // No semaglutide arm in this trial: naive indirect comparison against the
  // fixed A1-pinned reference, flagged as a different (weaker) evidence class.
  if (metric === 'HBA1C') {
    const seRef = REFERENCE_HBA1C_SD / Math.sqrt(REFERENCE_HBA1C_N);
    const delta = candidateStats.mean - REFERENCE_HBA1C_DELTA_PP;
    const seDiff = Math.sqrt(candidateStats.se ** 2 + seRef ** 2);
    const ci = { low: delta - 1.96 * seDiff, high: delta + 1.96 * seDiff };
    return {
      nctId: trial.nctId,
      candidateArm: { title: candidateGroup.title, meanChangePp: candidateStats.mean, n: candidateStats.n },
      comparisonType: 'NAIVE_INDIRECT',
      outcomeMetric: metric,
      evidenceBasis: 'RANDOMIZED_INDIRECT',
      deltaVsSemaglutidePp: delta,
      diffCi95: ci,
      withinMargin: Math.abs(delta) <= marginPp,
      diffCiEntirelyOutsideMargin: ci.high < -marginPp || ci.low > marginPp,
      fairnessFlags: [...fairnessFlags, 'No semaglutide arm in this trial: compared against semaglutide\'s real arm from a DIFFERENT trial (naive indirect comparison) — population, dose, and follow-up duration may differ; not a randomized head-to-head.'],
    };
  }

  // Body-weight-only, no semaglutide arm: no numeric semaglutide weight reference is pinned, so no delta can be computed honestly.
  return {
    nctId: trial.nctId,
    candidateArm: { title: candidateGroup.title, meanChangePp: candidateStats.mean, n: candidateStats.n },
    comparisonType: 'NO_COMPARISON',
    outcomeMetric: metric,
    evidenceBasis: 'RANDOMIZED_INDIRECT',
    deltaVsSemaglutidePp: null,
    diffCi95: null,
    withinMargin: null,
    diffCiEntirelyOutsideMargin: null,
    fairnessFlags: [...fairnessFlags, 'No semaglutide arm in this trial and no pinned semaglutide body-weight reference exists — this candidate\'s body-weight result cannot be honestly compared to semaglutide from this dataset.'],
  };
}

// ---------------------------------------------------------------------------
// Safety extraction
// ---------------------------------------------------------------------------

export interface A2SafetyCategoryResult {
  readonly key: string;
  readonly label: string;
  readonly candidate: { readonly numAffected: number; readonly numAtRisk: number } | null;
  readonly reference: { readonly numAffected: number; readonly numAtRisk: number } | null;
  readonly riskRatio: number | null;
  readonly riskRatioCi95: { readonly low: number; readonly high: number } | null;
  readonly comparisonType: A2ComparisonType;
}

function aggregateCategoryRate(events: readonly A2AdverseEvent[], groupId: string, pattern: RegExp): { numAffected: number; numAtRisk: number } | null {
  let numAffected = 0;
  let numAtRisk = 0;
  let found = false;
  for (const e of events) {
    if (!pattern.test(e.term)) continue;
    const stat = e.stats.find((s) => s.groupId === groupId);
    if (stat === undefined || stat.numAffected === null || stat.numAtRisk === null) continue;
    found = true;
    numAffected = Math.max(numAffected, stat.numAffected);
    numAtRisk = Math.max(numAtRisk, stat.numAtRisk);
  }
  return found ? { numAffected, numAtRisk } : null;
}

/** Katz log-method 95% CI for a risk ratio of two proportions. Standard, disclosed, not derived from this dataset. */
function riskRatioCi(a: { numAffected: number; numAtRisk: number }, b: { numAffected: number; numAtRisk: number }): { rr: number; ci: { low: number; high: number } } | null {
  if (a.numAffected === 0 || b.numAffected === 0 || a.numAtRisk === 0 || b.numAtRisk === 0) return null;
  const p1 = a.numAffected / a.numAtRisk;
  const p2 = b.numAffected / b.numAtRisk;
  const rr = p1 / p2;
  const seLogRr = Math.sqrt((1 - p1) / (p1 * a.numAtRisk) + (1 - p2) / (p2 * b.numAtRisk));
  const logRr = Math.log(rr);
  return { rr, ci: { low: Math.exp(logRr - 1.96 * seLogRr), high: Math.exp(logRr + 1.96 * seLogRr) } };
}

export function extractCandidateSafety(
  trial: A2TrialRecord,
  candidateGroupTitle: string,
  referenceTrial: A2TrialRecord | null,
  referenceGroupTitle: string | null,
): readonly A2SafetyCategoryResult[] {
  const candidateGroup = trial.adverseEvents?.eventGroups.find((g) => g.title === candidateGroupTitle) ?? null;
  const hasDirectSemaglutide = trial.adverseEvents?.eventGroups.some((g) => SEMAGLUTIDE_PATTERN.test(g.title)) ?? false;
  const semaGroupInSameTrial = hasDirectSemaglutide ? (trial.adverseEvents?.eventGroups.find((g) => SEMAGLUTIDE_PATTERN.test(g.title)) ?? null) : null;
  const useReference = semaGroupInSameTrial === null && referenceTrial !== null && referenceGroupTitle !== null;
  const refGroup = useReference ? (referenceTrial!.adverseEvents?.eventGroups.find((g) => g.title === referenceGroupTitle) ?? null) : semaGroupInSameTrial;
  const refEvents = useReference ? [...(referenceTrial!.adverseEvents?.seriousEvents ?? []), ...(referenceTrial!.adverseEvents?.otherEvents ?? [])] : [...(trial.adverseEvents?.seriousEvents ?? []), ...(trial.adverseEvents?.otherEvents ?? [])];
  const candidateEvents = [...(trial.adverseEvents?.seriousEvents ?? []), ...(trial.adverseEvents?.otherEvents ?? [])];
  const comparisonType: A2ComparisonType = semaGroupInSameTrial !== null ? 'DIRECT_HEAD_TO_HEAD' : useReference ? 'NAIVE_INDIRECT' : 'NO_COMPARISON';

  const results: A2SafetyCategoryResult[] = [];
  for (const cat of A2_SAFETY_CATEGORIES) {
    const pattern = new RegExp(cat.termPattern, 'i');
    const candRate = candidateGroup === null ? null : aggregateCategoryRate(candidateEvents, candidateGroup.id, pattern);
    const refRate = refGroup === null ? null : aggregateCategoryRate(refEvents, refGroup.id, pattern);
    const rrResult = candRate !== null && refRate !== null ? riskRatioCi(candRate, refRate) : null;
    results.push({
      key: cat.key,
      label: cat.label,
      candidate: candRate,
      reference: refRate,
      riskRatio: rrResult?.rr ?? null,
      riskRatioCi95: rrResult?.ci ?? null,
      comparisonType,
    });
  }

  // Structural: serious-AE rate directly from eventGroups (not a term match).
  if (candidateGroup !== null && refGroup !== null && candidateGroup.seriousNumAffected !== null && candidateGroup.seriousNumAtRisk !== null && refGroup.seriousNumAffected !== null && refGroup.seriousNumAtRisk !== null) {
    const candRate = { numAffected: candidateGroup.seriousNumAffected, numAtRisk: candidateGroup.seriousNumAtRisk };
    const refRate = { numAffected: refGroup.seriousNumAffected, numAtRisk: refGroup.seriousNumAtRisk };
    const rrResult = riskRatioCi(candRate, refRate);
    results.push({
      key: 'serious_adverse_events',
      label: 'Serious adverse events (structural, from eventGroups)',
      candidate: candRate,
      reference: refRate,
      riskRatio: rrResult?.rr ?? null,
      riskRatioCi95: rrResult?.ci ?? null,
      comparisonType,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Falsification (§9) + existential safety veto
// ---------------------------------------------------------------------------

/**
 * Whether a safety veto may be drawn without regard to how the comparison was
 * obtained. Named so the legacy branch is impossible to select by accident.
 *
 * `HISTORICAL_NO_EVIDENCE_CLASS` reproduces the behaviour every frozen run in
 * this repository was computed under, including the veto documented in
 * docs/DECISIONS.md D-042. It exists so those runs stay byte-reproducible,
 * not because it is correct.
 *
 * `EVIDENCE_CLASS_GATED` enforces the D-042 invariant: within one safety
 * category, only the best-supported comparison may veto. A cross-trial
 * comparison cannot veto while a same-trial randomised one is present, and
 * when it vetoes because nothing better exists, the failure message says so.
 */
export type A2EvidencePolicy = 'HISTORICAL_NO_EVIDENCE_CLASS' | 'EVIDENCE_CLASS_GATED';

/** Higher is stronger. Mirrors `evidenceProvenance.ts::EVIDENCE_CLASS_RANK` in this file's own vocabulary. */
const COMPARISON_RANK: Readonly<Record<A2ComparisonType, number>> = {
  DIRECT_HEAD_TO_HEAD: 3,
  NAIVE_INDIRECT: 2,
  NO_COMPARISON: 1,
};

export interface A2FalsificationResult {
  readonly failures: readonly string[];
  readonly worseSafetySignal: A2SafetyCategoryResult | null;
  readonly evidencePolicy: A2EvidencePolicy;
  /** Audit trail: comparisons that WOULD have vetoed but were outranked. Empty under the historical policy. */
  readonly supersededByStrongerEvidence: readonly string[];
}

/**
 * Of the rows sharing one safety category key, the ones a veto may rest on:
 * every row at the strongest available comparison type. Rows of that category
 * obtained more weakly are returned separately so the caller can record what
 * it declined to act on rather than discarding it silently.
 */
function partitionByEvidenceStrength(safety: readonly A2SafetyCategoryResult[]): { readonly admissible: readonly A2SafetyCategoryResult[]; readonly superseded: readonly A2SafetyCategoryResult[] } {
  const strongestByKey = new Map<string, number>();
  for (const s of safety) {
    const rank = COMPARISON_RANK[s.comparisonType];
    const current = strongestByKey.get(s.key);
    if (current === undefined || rank > current) strongestByKey.set(s.key, rank);
  }
  const admissible: A2SafetyCategoryResult[] = [];
  const superseded: A2SafetyCategoryResult[] = [];
  for (const s of safety) {
    if (COMPARISON_RANK[s.comparisonType] === strongestByKey.get(s.key)) admissible.push(s);
    else superseded.push(s);
  }
  return { admissible, superseded };
}

export function falsifyCandidate(efficacy: readonly A2EfficacyEvidence[], safety: readonly A2SafetyCategoryResult[], evidencePolicy: A2EvidencePolicy): A2FalsificationResult {
  const failures: string[] = [];
  if (efficacy.length === 0) failures.push('No usable efficacy evidence at all.');
  if (efficacy.every((e) => e.comparisonType === 'NO_COMPARISON')) failures.push('No trial permits any numeric comparison to semaglutide.');
  if (efficacy.some((e) => e.diffCiEntirelyOutsideMargin === true && (e.deltaVsSemaglutidePp ?? 0) > 0)) {
    failures.push('At least one trial shows the candidate\'s HbA1c/weight change CI entirely outside the margin in the WORSE direction (less effective than semaglutide, not just different).');
  }
  if (efficacy.length === 1 && efficacy[0].comparisonType !== 'DIRECT_HEAD_TO_HEAD') failures.push('Single-study evidence with no direct head-to-head trial: fragile, not independently replicated.');

  const gated = evidencePolicy === 'EVIDENCE_CLASS_GATED';
  const { admissible, superseded } = gated ? partitionByEvidenceStrength(safety) : { admissible: safety, superseded: [] as readonly A2SafetyCategoryResult[] };

  const wouldHaveVetoed = (s: A2SafetyCategoryResult): boolean =>
    s.riskRatio !== null && s.riskRatioCi95 !== null && s.riskRatio > A2_PREREGISTRATION.effectSizeThresholds.safetyRiskRatioMeaningfulDeviation && s.riskRatioCi95.low > 1;

  const supersededByStrongerEvidence = superseded
    .filter(wouldHaveVetoed)
    .map((s) => `Safety category "${s.label}": a ${s.comparisonType} comparison (RR ${(s.riskRatio ?? 0).toFixed(2)}) would have vetoed, but a better-supported comparison of the same category is available and was used instead.`);

  let worseSafetySignal: A2SafetyCategoryResult | null = null;
  for (const s of admissible) {
    if (s.riskRatio === null || s.riskRatioCi95 === null) continue;
    if (!wouldHaveVetoed(s)) continue;
    // Under the gated policy an indirect veto survives only because nothing
    // stronger exists for this category — which the message must state, since
    // a reader of the verdict cannot otherwise tell.
    const qualifier = gated && s.comparisonType !== 'DIRECT_HEAD_TO_HEAD' ? ` [rests on ${s.comparisonType} evidence; no direct comparison available for this category]` : '';
    failures.push(`Safety category "${s.label}": risk ratio ${s.riskRatio.toFixed(2)} (95% CI [${s.riskRatioCi95.low.toFixed(2)}, ${s.riskRatioCi95.high.toFixed(2)}]) vs semaglutide — worse, CI excludes 1.${qualifier}`);
    if (worseSafetySignal === null || (s.riskRatio ?? 0) > (worseSafetySignal.riskRatio ?? 0)) worseSafetySignal = s;
  }

  return { failures, worseSafetySignal, evidencePolicy, supersededByStrongerEvidence };
}

// ---------------------------------------------------------------------------
// Belief revision per candidate (§11): H1-H4
// ---------------------------------------------------------------------------

export interface A2CandidateBeliefState {
  readonly h1ComparableEfficacy: Hypothesis;
  readonly h2LowerAeBurden: Hypothesis;
  readonly h3BetterTradeoff: Hypothesis;
  readonly h4NotSuperior: Hypothesis;
  readonly ranked: readonly Hypothesis[];
}

export function runCandidateBeliefRevision(candidateId: string, efficacy: readonly A2EfficacyEvidence[], safety: readonly A2SafetyCategoryResult[]): A2CandidateBeliefState {
  const prior = 1 / 4;
  const marginPp = A2_PREREGISTRATION.effectSizeThresholds.efficacyComparableMarginPp;
  let h1 = createHypothesis(`${candidateId}-H1`, { metric: 'HbA1c/weight delta vs semaglutide', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: marginPp, rationale: 'Candidate has comparable efficacy to semaglutide.' }, prior);
  let h2 = createHypothesis(`${candidateId}-H2`, { metric: 'safety category risk ratio vs semaglutide', relation: 'equal-within-tolerance', expectedValue: 1, tolerance: A2_PREREGISTRATION.effectSizeThresholds.safetyRiskRatioMeaningfulDeviation, rationale: 'Candidate has lower burden of clinically relevant adverse events.' }, prior);
  let h3 = createHypothesis(`${candidateId}-H3`, { metric: 'combined efficacy+safety', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: marginPp, rationale: 'Candidate provides better efficacy/safety tradeoff.' }, prior);
  let h4 = createHypothesis(`${candidateId}-H4`, { metric: 'combined efficacy+safety, uncertainty-adjusted', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: marginPp, rationale: 'Candidate is NOT superior after accounting for uncertainty/confounding.' }, prior);

  let step = 0;
  for (const e of efficacy) {
    if (e.deltaVsSemaglutidePp === null) continue;
    const magnitude = evidenceMagnitudeWithinTolerance(e.deltaVsSemaglutidePp, 0, marginPp);
    const assessment = e.diffCiEntirelyOutsideMargin ? 'FALSIFIED_WITHIN_PROTOCOL' : e.withinMargin ? 'SUPPORTED_WITHIN_PROTOCOL' : 'INCONCLUSIVE';
    h1 = updateConfidence(h1, assessment, magnitude, `${e.nctId} (${e.comparisonType}): delta=${e.deltaVsSemaglutidePp.toFixed(2)}`, step);
    // H4 (not superior) reads the SAME evidence with the opposite lens: efficacy CLEARLY better is evidence AGAINST h4, clearly worse/comparable supports it.
    const h4Assessment = e.diffCiEntirelyOutsideMargin && e.deltaVsSemaglutidePp > 0 ? 'FALSIFIED_WITHIN_PROTOCOL' : e.diffCiEntirelyOutsideMargin ? 'SUPPORTED_WITHIN_PROTOCOL' : 'INCONCLUSIVE';
    h4 = updateConfidence(h4, h4Assessment, magnitude, `${e.nctId}: efficacy signal`, step);
    step += 1;
  }
  for (const s of safety) {
    if (s.riskRatio === null || s.riskRatioCi95 === null) continue;
    const logRr = Math.log(s.riskRatio);
    const magnitude = evidenceMagnitudeWithinTolerance(logRr, 0, Math.log(2));
    const ciExcludes1 = s.riskRatioCi95.low > 1 || s.riskRatioCi95.high < 1;
    const better = s.riskRatio < 1 && ciExcludes1;
    const worse = s.riskRatio > 1 && ciExcludes1;
    const assessment = better ? 'SUPPORTED_WITHIN_PROTOCOL' : worse ? 'FALSIFIED_WITHIN_PROTOCOL' : 'INCONCLUSIVE';
    h2 = updateConfidence(h2, assessment, magnitude, `${s.label}: RR=${s.riskRatio.toFixed(2)}`, step);
    const h3Assessment = worse ? 'FALSIFIED_WITHIN_PROTOCOL' : better ? 'SUPPORTED_WITHIN_PROTOCOL' : 'INCONCLUSIVE';
    h3 = updateConfidence(h3, h3Assessment, magnitude, `${s.label}: safety contribution to tradeoff`, step);
    step += 1;
  }

  return { h1ComparableEfficacy: h1, h2LowerAeBurden: h2, h3BetterTradeoff: h3, h4NotSuperior: h4, ranked: rankHypotheses([h1, h2, h3, h4]) };
}

// ---------------------------------------------------------------------------
// Ranking (§12)
// ---------------------------------------------------------------------------

export interface A2CandidateScore {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly efficacyScore: number;
  readonly safetyScore: number;
  readonly evidenceStrengthScore: number;
  readonly uncertaintyPenalty: number;
  readonly conflictPenalty: number;
  readonly weightedScore: number;
  readonly vetoed: boolean;
  readonly vetoReason: string | null;
}

export function scoreCandidate(
  candidate: A2CandidateSummary,
  efficacy: readonly A2EfficacyEvidence[],
  safety: readonly A2SafetyCategoryResult[],
  falsification: A2FalsificationResult,
): A2CandidateScore {
  const weights = A2_PREREGISTRATION.rankingWeights;
  const marginPp = A2_PREREGISTRATION.effectSizeThresholds.efficacyComparableMarginPp;

  const efficacyDeltas = efficacy.map((e) => e.deltaVsSemaglutidePp).filter((d): d is number => d !== null);
  const efficacyScore = efficacyDeltas.length === 0 ? 0 : efficacyDeltas.reduce((sum, d) => sum + Math.max(-1, Math.min(1, -d / marginPp)), 0) / efficacyDeltas.length;

  const safetyRatios = safety.map((s) => s.riskRatio).filter((r): r is number => r !== null);
  const safetyScore = safetyRatios.length === 0 ? 0 : safetyRatios.reduce((sum, r) => sum + Math.max(-1, Math.min(1, -Math.log(r))), 0) / safetyRatios.length;

  const directCount = efficacy.filter((e) => e.comparisonType === 'DIRECT_HEAD_TO_HEAD').length;
  const evidenceStrengthScore = Math.min(1, (directCount * 2 + efficacy.length + safetyRatios.length) / 10);

  const smallArmCount = efficacy.filter((e) => e.candidateArm.n < A2_PREREGISTRATION.candidateInclusion.trialEvidence.minArmSizeForComparison).length;
  const uncertaintyPenaltyMagnitude = Math.min(1, smallArmCount / Math.max(1, efficacy.length));

  const conflictingDirections = new Set(efficacyDeltas.map((d) => Math.sign(d))).size > 1;
  const conflictPenaltyMagnitude = conflictingDirections ? 1 : 0;

  const weightedScore =
    weights.efficacy * efficacyScore +
    weights.safety * safetyScore +
    weights.evidenceStrength * evidenceStrengthScore +
    weights.uncertaintyPenalty * uncertaintyPenaltyMagnitude +
    weights.conflictPenalty * conflictPenaltyMagnitude;

  const vetoed = falsification.worseSafetySignal !== null;

  return {
    moleculeChemblId: candidate.moleculeChemblId,
    prefName: candidate.prefName,
    efficacyScore,
    safetyScore,
    evidenceStrengthScore,
    uncertaintyPenalty: uncertaintyPenaltyMagnitude,
    conflictPenalty: conflictPenaltyMagnitude,
    weightedScore,
    vetoed,
    vetoReason: vetoed ? `Existential safety veto: ${falsification.worseSafetySignal!.label} risk ratio ${falsification.worseSafetySignal!.riskRatio?.toFixed(2)} vs semaglutide, CI excludes 1.` : null,
  };
}

// ---------------------------------------------------------------------------
// Per-candidate full evidence bundle + practical candidate gate
// ---------------------------------------------------------------------------

export interface A2CandidateReport {
  readonly summary: A2CandidateSummary;
  readonly efficacy: readonly A2EfficacyEvidence[];
  readonly safety: readonly A2SafetyCategoryResult[];
  readonly falsification: A2FalsificationResult;
  readonly belief: A2CandidateBeliefState;
  readonly score: A2CandidateScore;
}

export { evaluatePracticalCandidate, surfaceFor };
export type { PracticalCandidate, GatedCandidate, GateDecision, A2FinalVerdictLabel };

export function analysisFingerprint(candidateReports: readonly A2CandidateReport[], verdict: A2FinalVerdictLabel): string {
  return fnv1a(canonicalJson({
    preregistrationFingerprint: A2_PREREGISTRATION.fingerprint,
    candidates: candidateReports.map((c) => ({ id: c.summary.moleculeChemblId, score: c.score.weightedScore, vetoed: c.score.vetoed })),
    verdict,
  }));
}

// ---------------------------------------------------------------------------
// Real-data loading (the pinned, mechanism-derived candidate space)
// ---------------------------------------------------------------------------

const TRIALS_BY_MOLECULE: Readonly<Record<string, readonly A2TrialRecord[]>> = {
  CHEMBL414357: trialsExenatide as readonly A2TrialRecord[],
  CHEMBL5314341: trialsGlucagon as readonly A2TrialRecord[],
  CHEMBL1240772: trialsNativeGlp1 as readonly A2TrialRecord[],
  CHEMBL2381848: trialsPf06291874 as readonly A2TrialRecord[],
  CHEMBL4084119: trialsLiraglutide as readonly A2TrialRecord[],
  CHEMBL4518483: trialsDanuglipron as readonly A2TrialRecord[],
  CHEMBL4446782: trialsOrforglipron as readonly A2TrialRecord[],
  CHEMBL567: trialsPerphenazine as readonly A2TrialRecord[],
  CHEMBL4297630: trialsCotadutide as readonly A2TrialRecord[],
  CHEMBL4297839: trialsTirzepatide as readonly A2TrialRecord[],
  CHEMBL1933349: trialsMk0893 as readonly A2TrialRecord[],
  CHEMBL3707351: trialsAdomeglivant as readonly A2TrialRecord[],
};

const REFERENCE_TRIAL = referenceSemaglutideRaw as A2TrialRecord;
const REFERENCE_SEMAGLUTIDE_GROUP_TITLE = '1 mg Semaglutide';

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Candidate-side only (same single-arm fallback rationale as pickCandidateGroup) — never used to identify a comparator. */
function pickCandidateAeGroupTitle(eventGroups: readonly A2AdverseEventGroup[], pattern: RegExp): string | null {
  const matches = eventGroups.filter((g) => pattern.test(g.title));
  if (matches.length > 0) {
    return matches.reduce((best, g) => ((parseDoseMg(g.title) ?? -Infinity) > (parseDoseMg(best.title) ?? -Infinity) ? g : best)).title;
  }
  return eventGroups.length === 1 ? eventGroups[0].title : null;
}

interface A2RawCandidate {
  readonly moleculeChemblId: string;
  readonly prefName: string;
  readonly moleculeType: string;
  readonly maxPhase: string | number;
  readonly medianPotencyNMByTarget: { readonly glp1r: number | null; readonly gipr: number | null; readonly gcgr: number | null };
  readonly qualifyingAssayCounts: { readonly glp1r: number; readonly gipr: number; readonly gcgr: number };
}

function loadCandidateSummaries(): readonly A2CandidateSummary[] {
  return (candidatesRaw as readonly A2RawCandidate[]).map((c) => ({ ...c, maxPhase: Number(c.maxPhase) }));
}

/** Real, mechanistically distinct: these two candidates lower glucose by ANTAGONIZING the glucagon receptor, not by agonizing an incretin receptor like semaglutide — flagged for the report, never excluded (the mandate asks for the whole GLP-1R+GIPR+GCGR mechanism space). */
const GCGR_ANTAGONIST_IDS: ReadonlySet<string> = new Set(['CHEMBL1933349', 'CHEMBL3707351']);

/**
 * ChEMBL's `pref_name` is the compound's CURRENT (often later-assigned INN)
 * name; several real trials in this pinned dataset were registered years
 * earlier under the sponsor's own development code name, which is what
 * actually appears in their arm/group titles — verifiable directly from
 * each trial's own pinned `briefTitle`: NCT03985293 "...PF-06882961..."
 * (danuglipron), NCT02548585/NCT03244800 "...MEDI0382..." (cotadutide),
 * NCT01241448/NCT00871572/NCT02091362 "...LY2409021..." (adomeglivant).
 * This is a real, externally-verifiable identity fact, not a criterion or
 * threshold change — it only affects which arm within an ALREADY-QUALIFYING
 * trial is recognized as the candidate's own, exactly like the single-arm
 * fallback above. Without it these three real candidates would show zero
 * efficacy evidence despite their own pinned trials containing real HbA1c
 * data under the code name.
 */
const KNOWN_DEVELOPMENT_CODE_NAMES: Readonly<Record<string, string>> = {
  CHEMBL4518483: 'PF-06882961', // danuglipron
  CHEMBL4297630: 'MEDI0382', // cotadutide
  CHEMBL3707351: 'LY2409021', // adomeglivant
};

function buildCandidateReport(summary: A2CandidateSummary): A2CandidateReport {
  const marginPp = A2_PREREGISTRATION.effectSizeThresholds.efficacyComparableMarginPp;
  const trials = TRIALS_BY_MOLECULE[summary.moleculeChemblId] ?? [];
  const codeName = KNOWN_DEVELOPMENT_CODE_NAMES[summary.moleculeChemblId];
  const patternSource = codeName === undefined ? escapeRegExp(summary.prefName) : `${escapeRegExp(summary.prefName)}|${escapeRegExp(codeName)}`;
  const pattern = new RegExp(patternSource, 'i');

  const efficacy: A2EfficacyEvidence[] = [];
  for (const trial of trials) {
    const e = extractCandidateEfficacy(trial, pattern, marginPp);
    if (e !== null) efficacy.push(e);
  }

  let safety: readonly A2SafetyCategoryResult[] = [];
  for (const trial of trials) {
    if (trial.adverseEvents === null) continue;
    const candidateGroupTitle = pickCandidateAeGroupTitle(trial.adverseEvents.eventGroups, pattern);
    if (candidateGroupTitle === null) continue;
    safety = extractCandidateSafety(trial, candidateGroupTitle, REFERENCE_TRIAL, REFERENCE_SEMAGLUTIDE_GROUP_TITLE);
    break; // first usable AE-bearing trial only — documented limitation, not silently aggregated across differently-dosed trials.
  }

  // The frozen A2/A3/E2E-01/campaign runs were all computed under this policy.
  // Changing it here would rewrite history; the evidence-class-gated path is
  // exercised by the re-adjudication, which is a separate run with its own
  // fingerprint (docs/DECISIONS.md D-042, D-043).
  const falsification = falsifyCandidate(efficacy, safety, 'HISTORICAL_NO_EVIDENCE_CLASS');
  const belief = runCandidateBeliefRevision(summary.moleculeChemblId, efficacy, safety);
  const score = scoreCandidate(summary, efficacy, safety, falsification);

  return { summary, efficacy, safety, falsification, belief, score };
}

// ---------------------------------------------------------------------------
// Self-falsification round 2 (§13)
// ---------------------------------------------------------------------------

export interface A2SelfFalsificationResult {
  readonly candidateId: string;
  readonly findings: readonly string[];
  readonly revisedScore: number;
}

/** "What would have to be true for the winner to NOT be a good candidate?" — actively checked, not assumed away. */
export function selfFalsifyWinner(report: A2CandidateReport): A2SelfFalsificationResult {
  const findings: string[] = [];
  if (report.efficacy.every((e) => e.comparisonType !== 'DIRECT_HEAD_TO_HEAD')) {
    findings.push('No trial is a direct head-to-head against semaglutide: every efficacy number is a naive indirect comparison across different trials/populations/doses.');
  }
  if (report.efficacy.length <= 1) {
    findings.push('Fewer than 2 independent trials support this candidate\'s efficacy — a single study is not replicated.');
  }
  if (report.safety.length === 0 || report.safety.every((s) => s.riskRatio === null)) {
    findings.push('No numeric safety comparison to semaglutide exists for this candidate at all — safety superiority/parity is unestablished, not demonstrated.');
  }
  if (GCGR_ANTAGONIST_IDS.has(report.summary.moleculeChemblId)) {
    findings.push('This candidate lowers glucose via glucagon receptor ANTAGONISM, a different mechanism than semaglutide\'s GLP-1 receptor agonism — comparable HbA1c effect does not establish comparable overall risk/benefit profile (e.g., no incretin-mediated weight loss).');
  }
  if (report.summary.maxPhase < 4) {
    findings.push(`Max clinical phase is ${report.summary.maxPhase}, not an approved (phase 4) therapy — regulatory review has not concluded.`);
  }

  const revisedScore = report.score.weightedScore - findings.length * 0.15;
  return { candidateId: report.summary.moleculeChemblId, findings, revisedScore };
}

// ---------------------------------------------------------------------------
// Final verdict (§14)
// ---------------------------------------------------------------------------

export interface A2Verdict {
  readonly label: A2FinalVerdictLabel;
  readonly reason: string;
}

export function decideA2Verdict(reports: readonly A2CandidateReport[], selfFalsification: A2SelfFalsificationResult | null): A2Verdict {
  const withEvidence = reports.filter((r) => r.efficacy.some((e) => e.comparisonType !== 'NO_COMPARISON'));
  if (withEvidence.length === 0) {
    return { label: 'INSUFFICIENT_EVIDENCE', reason: 'No candidate in the mechanism-derived space has any usable efficacy comparison to semaglutide.' };
  }

  const ranked = [...withEvidence].sort((a, b) => b.score.weightedScore - a.score.weightedScore);
  const top = ranked[0];
  const nonVetoed = ranked.filter((r) => !r.score.vetoed);

  if (nonVetoed.length === 0) {
    return { label: 'NO_SAFE_SUPERIOR_CANDIDATE', reason: `Every candidate with usable efficacy evidence fails the existential safety veto (worse-direction risk ratio vs semaglutide, CI excludes 1). Best-scoring: ${top.summary.prefName} (${top.score.vetoReason}).` };
  }

  const conflicting = nonVetoed.filter((r) => r.efficacy.some((e) => e.deltaVsSemaglutidePp !== null && e.deltaVsSemaglutidePp > 0)).length > 0
    && nonVetoed.filter((r) => r.efficacy.some((e) => e.deltaVsSemaglutidePp !== null && e.deltaVsSemaglutidePp < 0)).length > 0;

  const bestNonVetoed = nonVetoed[0];
  if (bestNonVetoed.score.weightedScore <= 0) {
    return { label: 'NO_SUPERIOR_CANDIDATE', reason: `No candidate scores better than semaglutide on the preregistered ranking function even before the safety veto. Best-scoring non-vetoed: ${bestNonVetoed.summary.prefName} (score ${bestNonVetoed.score.weightedScore.toFixed(3)}).` };
  }

  const hasDirectEvidence = bestNonVetoed.efficacy.some((e) => e.comparisonType === 'DIRECT_HEAD_TO_HEAD');
  const revisedPositive = selfFalsification !== null && selfFalsification.candidateId === bestNonVetoed.summary.moleculeChemblId && selfFalsification.revisedScore > 0;

  if (hasDirectEvidence && selfFalsification !== null && selfFalsification.findings.length === 0) {
    return { label: 'BEST_SUPPORTED_CANDIDATE', reason: `${bestNonVetoed.summary.prefName} scores best (${bestNonVetoed.score.weightedScore.toFixed(3)}), has direct head-to-head evidence, passes the safety veto, and survives self-falsification with no findings.` };
  }

  if (conflicting && Math.abs(bestNonVetoed.score.weightedScore) < 0.2) {
    return { label: 'CONFLICTING_EVIDENCE', reason: 'Candidates show efficacy signals in both directions relative to semaglutide with no clear best-scoring candidate.' };
  }

  return {
    label: 'PROMISING_BUT_UNCERTAIN',
    reason: `${bestNonVetoed.summary.prefName} scores best (${bestNonVetoed.score.weightedScore.toFixed(3)}) and passes the safety veto, but the evidence is not strong enough for BEST_SUPPORTED_CANDIDATE: ${hasDirectEvidence ? '' : 'no direct head-to-head trial vs semaglutide in this dataset; '}self-falsification found ${selfFalsification?.findings.length ?? 0} real concern(s)${revisedPositive ? ' (still net positive after revision)' : ''}.`,
  };
}

// ---------------------------------------------------------------------------
// Full analysis orchestration
// ---------------------------------------------------------------------------

export interface A2AnalysisReport {
  readonly contractVersion: string;
  readonly preregistrationFingerprint: string;
  readonly targets: { readonly glp1r: { readonly chemblId: string; readonly prefName: string }; readonly gipr: { readonly chemblId: string; readonly prefName: string }; readonly gcgr: { readonly chemblId: string; readonly prefName: string } };
  readonly totalCandidatesInSpace: number;
  readonly candidateReports: readonly A2CandidateReport[];
  readonly rankedByScore: readonly A2CandidateReport[];
  readonly selfFalsification: A2SelfFalsificationResult | null;
  readonly verdict: A2Verdict;
  readonly gatedCandidate: GatedCandidate | null;
  readonly gateDecision: GateDecision | null;
  readonly surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE';
  readonly analysisFingerprint: string;
}

function buildCandidateStatement(winner: A2CandidateReport, verdict: A2Verdict): string {
  const efficacySummary = winner.efficacy.map((e) => `${e.nctId} (${e.comparisonType}): delta=${e.deltaVsSemaglutidePp?.toFixed(2) ?? 'n/a'}`).join('; ');
  return `Population-level evidence (${verdict.label}) on ${winner.summary.prefName} as a potential semaglutide substitute: ${efficacySummary || 'no numeric efficacy comparison available'}. This is a population-level pharmacological comparison, not a clinical instruction for any individual patient.`;
}

export function runA2Analysis(): A2AnalysisReport {
  const allCandidates = loadCandidateSummaries();
  const candidateIdsWithTrials = new Set((candidatesWithTrialsRaw as readonly { moleculeChemblId: string }[]).map((c) => c.moleculeChemblId));
  const candidatesWithTrials = allCandidates.filter((c) => candidateIdsWithTrials.has(c.moleculeChemblId));

  const candidateReports = candidatesWithTrials.map(buildCandidateReport);
  const rankedByScore = [...candidateReports].sort((a, b) => b.score.weightedScore - a.score.weightedScore);

  const topWithEvidence = rankedByScore.find((r) => r.efficacy.some((e) => e.comparisonType !== 'NO_COMPARISON')) ?? null;
  const selfFalsification = topWithEvidence !== null ? selfFalsifyWinner(topWithEvidence) : null;

  const verdict = decideA2Verdict(candidateReports, selfFalsification);

  let gatedCandidate: GatedCandidate | null = null;
  let gateDecision: GateDecision | null = null;
  let surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE' = 'NONE';

  if (topWithEvidence !== null && (verdict.label === 'BEST_SUPPORTED_CANDIDATE' || verdict.label === 'PROMISING_BUT_UNCERTAIN')) {
    const observationIds = topWithEvidence.efficacy.map((e) => `ctgov:${e.nctId}`);
    const candidate: PracticalCandidate = {
      derivedFromModelFingerprint: A2_PREREGISTRATION.fingerprint,
      statement: buildCandidateStatement(topWithEvidence, verdict),
      constraints: [
        `Applies only to the trial populations and doses examined (${topWithEvidence.efficacy.map((e) => e.nctId).join(', ')}).`,
        'Does not establish safety, tolerability, cost, or real-world adherence equivalence beyond the specific categories numerically compared.',
        'No trial in this dataset is a direct head-to-head against semaglutide unless explicitly marked DIRECT_HEAD_TO_HEAD.',
      ],
      requiredValidation: ['Institutional/regulatory review before any policy or guidance is drawn from this finding.', 'Independent statistical review of the indirect-comparison methodology in a2OzempicSubstitute.ts.'],
      proposedProtocol: null,
      protocolWithheldReason: 'This candidate is a population-level research finding. This system does not emit an individual clinical protocol, dose, or substitution instruction.',
    };
    gatedCandidate = {
      candidate,
      candidateClass: 'intervention',
      safetyClass: 'POPULATION',
      notProven: [
        'Individual patient safety or tolerability equivalence.',
        'Cost-effectiveness or real-world supply feasibility of substitution.',
        'Efficacy or safety outside the trial populations and doses studied.',
        'Any claim beyond the four preregistered hypotheses (H1-H4) this analysis was designed to test.',
      ],
      handoff: { recipient: 'INSTITUTION', boundary: 'Government Research plane only. Any policy action requires human/institutional authorisation through core/governance — this module authorises nothing.' },
      evidence: {
        observationIds,
        replayFingerprint: A2_PREREGISTRATION.fingerprint,
        provenance: { sourceUrl: 'ChEMBL Web Services + ClinicalTrials.gov API v2 (see a2-ozempic-substitute/meta.json for per-file URLs and SHA-256 hashes)', sourceVersion: '2026-09-13' },
        unresolvedContradictions: [],
        epistemicStatus: 'EVIDENCE_GRADED_POPULATION_FINDING',
      },
    };
    gateDecision = evaluatePracticalCandidate(gatedCandidate);
    surface = surfaceFor(gateDecision.outcome, gatedCandidate.safetyClass);
  }

  return {
    contractVersion: A2_ANALYSIS_CONTRACT_VERSION,
    preregistrationFingerprint: A2_PREREGISTRATION.fingerprint,
    targets: targetsRaw as unknown as A2AnalysisReport['targets'],
    totalCandidatesInSpace: allCandidates.length,
    candidateReports,
    rankedByScore,
    selfFalsification,
    verdict,
    gatedCandidate,
    gateDecision,
    surface,
    analysisFingerprint: analysisFingerprint(candidateReports, verdict.label),
  };
}
