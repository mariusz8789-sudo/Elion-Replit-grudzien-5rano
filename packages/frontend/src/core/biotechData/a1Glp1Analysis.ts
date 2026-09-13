import { canonicalJson, fnv1a } from '../events/hash';
import { A1_PREREGISTRATION, type A1HypothesisId } from './a1Glp1Preregistration';
import { createHypothesis, updateConfidence, rankHypotheses, evidenceMagnitudeWithinTolerance, type Hypothesis } from '../experimentFabric/beliefRevision';
import type { PracticalCandidate } from '../agent/discoveryCampaign';
import { evaluatePracticalCandidate, surfaceFor, type GatedCandidate, type GateDecision } from '../agent/practicalCandidateGate';

import target from './a1-glp1/target.json';
import compoundSemaglutide from './a1-glp1/compound-semaglutide.json';
import compoundLiraglutide from './a1-glp1/compound-liraglutide.json';
import compoundMetformin from './a1-glp1/compound-metformin.json';
import activitiesSemaglutideRaw from './a1-glp1/activities-semaglutide.json';
import activitiesLiraglutideRaw from './a1-glp1/activities-liraglutide.json';
import activitiesMetforminRaw from './a1-glp1/activities-metformin.json';
import trialSustain7 from './a1-glp1/trial-NCT03191396.json';
import trialPioneer4 from './a1-glp1/trial-NCT02863419.json';
import trialDoseRanging from './a1-glp1/trial-NCT00696657.json';
import trialSustain4 from './a1-glp1/trial-NCT02128932.json';
import a1FetchMeta from './a1-glp1/meta.json';

/**
 * A1 — GLP-1 SUBSTITUTION ANALYSIS: hypotheses -> candidate analysis ->
 * falsification -> belief revision -> ranking -> verdict, run entirely over
 * the real, pinned ChEMBL + ClinicalTrials.gov data under `./a1-glp1/` and
 * the thresholds SEALED in `a1Glp1Preregistration.ts` BEFORE that data was
 * pulled (see that file's header and `docs/DECISIONS.md` D-028).
 *
 * TWO INDEPENDENT DECISION PATHS, DELIBERATELY NOT FORCED TO AGREE.
 * `decideVerdict` applies the preregistered §8 rule literally: it is an
 * EXISTENTIAL rule ("H2 if the potency ratio is outside the window OR ANY
 * qualifying trial's 95% CI for the HbA1c delta sits entirely outside the
 * margin") precisely so that one adequately powered real trial showing a
 * genuine difference cannot be diluted away by averaging it against two
 * smaller, null-ish trials — the conservative, safety-first reading, and the
 * literal words of what was preregistered. `runBeliefRevision` instead
 * treats the same evidence sequentially with `beliefRevision.ts`'s
 * disclosed log-odds heuristic (reused verbatim, no second implementation)
 * and RANKS the three hypotheses by the resulting confidence. When the two
 * disagree, that disagreement is itself a real, reportable fact about this
 * evidence (`verdictDisagreesWithRanking`), not something to paper over by
 * picking whichever path gives the more comfortable answer.
 *
 * NEGATIVE CONTROLS (§13) are evaluated but never folded into the verdict
 * evidence — they test whether the PIPELINE itself would false-positive a
 * substitute (metformin, an unrelated mechanism, at GLP-1R) or fail to
 * detect a real difference it should (semaglutide vs insulin glargine,
 * SUSTAIN 4) — reusing the identical extraction function as the real
 * comparison, not a special-cased one.
 */

export const A1_ANALYSIS_CONTRACT_VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Raw pinned-fixture shapes (mirrors scripts/fetch-a1-glp1-fixture.mjs's narrow extraction)
// ---------------------------------------------------------------------------

interface A1ActivityRecord {
  readonly activityId: number;
  readonly assayChemblId: string;
  readonly assayDescription: string | null;
  readonly standardType: string | null;
  readonly standardRelation: string | null;
  readonly standardValue: string | null;
  readonly standardUnits: string | null;
  readonly pchemblValue: string | null;
  readonly targetOrganism: string | null;
  readonly documentYear: number | null;
  readonly dataValidityComment: string | null;
  readonly potentialDuplicate: number | null;
}

interface A1TrialGroup {
  readonly id: string;
  readonly title: string;
}
interface A1TrialCount {
  readonly groupId: string;
  readonly value: string;
}
interface A1TrialDenom {
  readonly units: string;
  readonly counts: readonly A1TrialCount[];
}
interface A1TrialMeasurement {
  readonly groupId: string;
  readonly value: string;
  readonly spread?: string;
}
interface A1TrialClass {
  readonly title?: string;
  readonly denoms?: readonly A1TrialDenom[];
  readonly categories: readonly { readonly measurements: readonly A1TrialMeasurement[] }[];
}
interface A1TrialOutcome {
  readonly title: string;
  readonly type: string;
  readonly paramType: string;
  readonly dispersionType: string | null;
  readonly unitOfMeasure: string;
  readonly timeFrame: string | null;
  readonly groups: readonly A1TrialGroup[];
  readonly denoms: readonly A1TrialDenom[];
  readonly classes: readonly A1TrialClass[];
}
interface A1TrialRecord {
  readonly nctId: string;
  readonly briefTitle: string;
  readonly arms: readonly { readonly label: string; readonly type: string; readonly description: string | null }[];
  readonly hba1cOutcomes: readonly A1TrialOutcome[];
}

const activitiesSemaglutide = activitiesSemaglutideRaw as readonly A1ActivityRecord[];
const activitiesLiraglutide = activitiesLiraglutideRaw as readonly A1ActivityRecord[];
const activitiesMetformin = activitiesMetforminRaw as readonly A1ActivityRecord[];

// ---------------------------------------------------------------------------
// Candidate analysis: GLP-1R binding potency (ChEMBL)
// ---------------------------------------------------------------------------

const QUALIFYING_STANDARD_TYPES: ReadonlySet<string> = new Set(A1_PREREGISTRATION.inclusion.assays.standardTypes);

export interface PotencySummary {
  readonly compound: string;
  readonly totalActivities: number;
  readonly qualifyingCount: number;
  readonly excludedCount: number;
  readonly qualifyingValuesNM: readonly number[];
  readonly qualifyingActivityIds: readonly number[];
  readonly medianPotencyNM: number | null;
}

function median(sorted: readonly number[]): number {
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * §6 inclusion criteria applied literally: qualifying standard type/units/
 * organism, no data-validity comment, no flagged duplicate, and an exact
 * (`=`) relation only — a `<`/`>`-bounded value is a real measurement but
 * not a point value, and this analysis reports the count it excluded rather
 * than silently treating a bound as if it were exact.
 */
export function summarizePotency(compound: string, activities: readonly A1ActivityRecord[]): PotencySummary {
  const qualifying: { readonly value: number; readonly id: number }[] = [];
  for (const a of activities) {
    if (a.standardType === null || !QUALIFYING_STANDARD_TYPES.has(a.standardType)) continue;
    if (a.standardUnits !== A1_PREREGISTRATION.inclusion.assays.standardUnits) continue;
    if (a.targetOrganism !== A1_PREREGISTRATION.inclusion.assays.organism) continue;
    if (a.dataValidityComment !== null) continue;
    if (a.potentialDuplicate !== null && a.potentialDuplicate !== 0) continue;
    if (a.standardRelation !== '=') continue;
    if (a.standardValue === null) continue;
    const value = Number(a.standardValue);
    if (!Number.isFinite(value) || value <= 0) continue;
    qualifying.push({ value, id: a.activityId });
  }
  const values = qualifying.map((q) => q.value).sort((x, y) => x - y);
  return {
    compound,
    totalActivities: activities.length,
    qualifyingCount: values.length,
    excludedCount: activities.length - values.length,
    qualifyingValuesNM: values,
    qualifyingActivityIds: qualifying.map((q) => q.id),
    medianPotencyNM: values.length > 0 ? median(values) : null,
  };
}

export interface PotencyComparison {
  readonly semaglutide: PotencySummary;
  readonly liraglutide: PotencySummary;
  readonly ratioLiraOverSema: number | null;
  readonly ratioWithinWindow: boolean | null;
  readonly bothMeetMinimumAssays: boolean;
}

export function comparePotency(): PotencyComparison {
  const sema = summarizePotency('semaglutide', activitiesSemaglutide);
  const lira = summarizePotency('liraglutide', activitiesLiraglutide);
  const ratio = sema.medianPotencyNM !== null && lira.medianPotencyNM !== null ? lira.medianPotencyNM / sema.medianPotencyNM : null;
  const window = A1_PREREGISTRATION.thresholds.potencyRatioWindow;
  return {
    semaglutide: sema,
    liraglutide: lira,
    ratioLiraOverSema: ratio,
    ratioWithinWindow: ratio === null ? null : ratio >= window.min && ratio <= window.max,
    bothMeetMinimumAssays:
      sema.qualifyingCount >= A1_PREREGISTRATION.thresholds.minAssaysPerDrugForVerdict &&
      lira.qualifyingCount >= A1_PREREGISTRATION.thresholds.minAssaysPerDrugForVerdict,
  };
}

// ---------------------------------------------------------------------------
// Candidate analysis: HbA1c efficacy delta (ClinicalTrials.gov)
// ---------------------------------------------------------------------------

function parseDoseMg(title: string): number | null {
  const m = /([\d.]+)\s*mg/i.exec(title);
  return m === null ? null : Number(m[1]);
}

/** Among groups matching `drugPattern`, the highest tested/labelled dose — the arm closest to real-world marketed use. Ties keep first-listed order. */
function pickHighestDoseGroup(groups: readonly A1TrialGroup[], drugPattern: RegExp): A1TrialGroup | null {
  const matches = groups.filter((g) => drugPattern.test(g.title));
  if (matches.length === 0) return null;
  return matches.reduce((best, g) => ((parseDoseMg(g.title) ?? -Infinity) > (parseDoseMg(best.title) ?? -Infinity) ? g : best));
}

function findCount(denoms: readonly A1TrialDenom[], groupId: string): number | null {
  for (const d of denoms) {
    const hit = d.counts.find((c) => c.groupId === groupId);
    if (hit !== undefined) return Number(hit.value);
  }
  return null;
}

export interface TrialArmMeasurement {
  readonly groupId: string;
  readonly title: string;
  readonly doseMg: number | null;
  readonly meanChangePp: number;
  readonly spread: number;
  readonly n: number;
}

export interface TrialEfficacyEvidence {
  readonly nctId: string;
  readonly briefTitle: string;
  readonly outcomeTitle: string;
  readonly armA: TrialArmMeasurement;
  readonly armB: TrialArmMeasurement;
  /** armA minus armB, in percentage points. */
  readonly deltaPp: number;
  readonly standardErrorOfDelta: number;
  readonly diffCi95: { readonly low: number; readonly high: number };
  readonly armCisOverlap: boolean;
  readonly diffCiEntirelyOutsideMargin: boolean;
  readonly withinMargin: boolean;
}

/**
 * Generic two-arm HbA1c delta extractor, reused identically for the main
 * semaglutide/liraglutide comparison AND the §13 semaglutide/insulin-glargine
 * negative control — one extraction function, not two, so the negative
 * control is a real test of the same code path rather than a hand-verified
 * side calculation.
 */
export function extractTrialEfficacy(trial: A1TrialRecord, patternA: RegExp, patternB: RegExp, marginPp: number): TrialEfficacyEvidence | null {
  const primary = trial.hba1cOutcomes.find((o) => o.type === 'PRIMARY') ?? trial.hba1cOutcomes[0];
  if (primary === undefined) return null;
  const groupA = pickHighestDoseGroup(primary.groups, patternA);
  const groupB = pickHighestDoseGroup(primary.groups, patternB);
  if (groupA === null || groupB === null) return null;

  const cls = primary.classes[0];
  if (cls === undefined) return null;
  const measurements = cls.categories[0]?.measurements ?? [];
  const denoms = cls.denoms ?? primary.denoms;

  const measurementA = measurements.find((m) => m.groupId === groupA.id);
  const measurementB = measurements.find((m) => m.groupId === groupB.id);
  if (measurementA === undefined || measurementB === undefined) return null;
  const nA = findCount(denoms, groupA.id);
  const nB = findCount(denoms, groupB.id);
  if (nA === null || nB === null || nA <= 0 || nB <= 0) return null;

  const meanA = Number(measurementA.value);
  const meanB = Number(measurementB.value);
  const spreadA = Number(measurementA.spread);
  const spreadB = Number(measurementB.spread);
  if (![meanA, meanB, spreadA, spreadB].every(Number.isFinite)) return null;

  const isStandardError = primary.dispersionType === 'Standard Error';
  const seA = isStandardError ? spreadA : spreadA / Math.sqrt(nA);
  const seB = isStandardError ? spreadB : spreadB / Math.sqrt(nB);

  const delta = meanA - meanB;
  const seDiff = Math.sqrt(seA ** 2 + seB ** 2);
  const diffCi95 = { low: delta - 1.96 * seDiff, high: delta + 1.96 * seDiff };
  const armACi = { low: meanA - 1.96 * seA, high: meanA + 1.96 * seA };
  const armBCi = { low: meanB - 1.96 * seB, high: meanB + 1.96 * seB };

  return {
    nctId: trial.nctId,
    briefTitle: trial.briefTitle,
    outcomeTitle: primary.title,
    armA: { groupId: groupA.id, title: groupA.title, doseMg: parseDoseMg(groupA.title), meanChangePp: meanA, spread: spreadA, n: nA },
    armB: { groupId: groupB.id, title: groupB.title, doseMg: parseDoseMg(groupB.title), meanChangePp: meanB, spread: spreadB, n: nB },
    deltaPp: delta,
    standardErrorOfDelta: seDiff,
    diffCi95,
    armCisOverlap: armACi.low <= armBCi.high && armBCi.low <= armACi.high,
    diffCiEntirelyOutsideMargin: diffCi95.high < -marginPp || diffCi95.low > marginPp,
    withinMargin: Math.abs(delta) <= marginPp,
  };
}

const SEMA_PATTERN = /semaglutide/i;
const LIRA_PATTERN = /liraglutide/i;
const INSULIN_GLARGINE_PATTERN = /insulin glargine/i;

export function collectDualDrugTrialEvidence(): readonly TrialEfficacyEvidence[] {
  const margin = A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp;
  const trials = [trialSustain7, trialPioneer4, trialDoseRanging] as readonly A1TrialRecord[];
  const out: TrialEfficacyEvidence[] = [];
  for (const trial of trials) {
    const evidence = extractTrialEfficacy(trial, SEMA_PATTERN, LIRA_PATTERN, margin);
    if (evidence !== null) out.push(evidence);
  }
  return out;
}

// ---------------------------------------------------------------------------
// §13 Negative controls
// ---------------------------------------------------------------------------

export interface NegativeControlResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

/**
 * Control 1: metformin (a biguanide, mechanistically unrelated to GLP-1R)
 * should show no/low GLP-1R binding data. `qualifyingCount === 0` here IS
 * the expected passing result, not an error — recorded explicitly so a
 * reader does not mistake "no data" for "pipeline broke".
 */
function negativeControlMetformin(): NegativeControlResult {
  const summary = summarizePotency('metformin', activitiesMetformin);
  const passed = summary.qualifyingCount === 0 || (summary.medianPotencyNM !== null && summary.medianPotencyNM > 10_000);
  return {
    name: 'semaglutide vs metformin at GLP-1R',
    passed,
    detail: `metformin has ${summary.qualifyingCount} qualifying GLP-1R activity record(s) in ChEMBL (of ${summary.totalActivities} total against this target) — ${passed ? 'no signal of GLP-1R affinity, as expected for an unrelated mechanism' : 'unexpected potency signal found'}.`,
  };
}

/**
 * Control 2: SUSTAIN 4 (semaglutide vs insulin glargine) should show a REAL,
 * large difference — proof the margin test is not vacuous (a pipeline that
 * always reports "no difference" would pass this only by accident).
 */
function negativeControlInsulinGlargine(): NegativeControlResult {
  const margin = A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp;
  const evidence = extractTrialEfficacy(trialSustain4 as A1TrialRecord, SEMA_PATTERN, INSULIN_GLARGINE_PATTERN, margin);
  if (evidence === null) {
    return { name: 'semaglutide vs insulin glargine HbA1c (SUSTAIN 4)', passed: false, detail: 'Could not extract a usable HbA1c comparison from the pinned SUSTAIN 4 fixture.' };
  }
  const passed = !evidence.withinMargin && evidence.diffCiEntirelyOutsideMargin;
  return {
    name: 'semaglutide vs insulin glargine HbA1c (SUSTAIN 4)',
    passed,
    detail: `delta = ${evidence.deltaPp.toFixed(2)} pp (95% CI [${evidence.diffCi95.low.toFixed(2)}, ${evidence.diffCi95.high.toFixed(2)}]) against a ±${margin} pp margin — ${passed ? 'a real, large difference detected, as expected' : 'the pipeline failed to detect the expected large difference'}.`,
  };
}

export function runNegativeControls(): readonly NegativeControlResult[] {
  return [negativeControlMetformin(), negativeControlInsulinGlargine()];
}

// ---------------------------------------------------------------------------
// Deterministic §8 verdict (the authoritative decision — preregistered rule, applied literally)
// ---------------------------------------------------------------------------

export interface A1Verdict {
  readonly hypothesisId: A1HypothesisId | 'INCONCLUSIVE_INSUFFICIENT_EVIDENCE';
  readonly reason: string;
}

export function decideVerdict(potency: PotencyComparison, trials: readonly TrialEfficacyEvidence[]): A1Verdict {
  const minTrials = A1_PREREGISTRATION.thresholds.minTrialsPerDrugForVerdict;
  if (!potency.bothMeetMinimumAssays || trials.length < minTrials) {
    return {
      hypothesisId: 'INCONCLUSIVE_INSUFFICIENT_EVIDENCE',
      reason: `Evidence below the preregistered minimum: ${potency.semaglutide.qualifyingCount}/${potency.liraglutide.qualifyingCount} qualifying assays (need >=${A1_PREREGISTRATION.thresholds.minAssaysPerDrugForVerdict} each), ${trials.length} qualifying dual-drug trials (need >=${minTrials}).`,
    };
  }
  if (potency.ratioWithinWindow === false) {
    return { hypothesisId: 'H2_NOT_SUPPORTED', reason: `GLP-1R potency ratio (lira/sema = ${potency.ratioLiraOverSema?.toFixed(3)}) falls outside the preregistered [${A1_PREREGISTRATION.thresholds.potencyRatioWindow.min}, ${A1_PREREGISTRATION.thresholds.potencyRatioWindow.max}] window.` };
  }
  const outlier = trials.find((t) => t.diffCiEntirelyOutsideMargin);
  if (outlier !== undefined) {
    return {
      hypothesisId: 'H2_NOT_SUPPORTED',
      reason: `${outlier.nctId} ("${outlier.briefTitle}"): the HbA1c delta's 95% CI [${outlier.diffCi95.low.toFixed(2)}, ${outlier.diffCi95.high.toFixed(2)}] pp sits entirely outside the preregistered ±${A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp} pp margin — this one qualifying trial's real result is not diluted by averaging against the others.`,
    };
  }
  const supportingCount = trials.filter((t) => t.withinMargin && t.armCisOverlap).length;
  if (supportingCount >= minTrials) {
    return {
      hypothesisId: 'H1_SUBSTITUTION_SUPPORTED',
      reason: `Potency ratio within window (${potency.ratioLiraOverSema?.toFixed(3)}) and ${supportingCount}/${trials.length} qualifying trials show |delta HbA1c| within the ±${A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp} pp margin with overlapping arm 95% CIs.`,
    };
  }
  return {
    hypothesisId: 'H0_NULL',
    reason: `Neither H1 nor H2's criteria are fully met: potency is within window and no trial's CI sits entirely outside the margin, but fewer than ${minTrials} trials independently support equivalence (${supportingCount}/${trials.length}).`,
  };
}

// ---------------------------------------------------------------------------
// Belief revision + ranking over the SAME evidence, sequentially
// ---------------------------------------------------------------------------

export interface A1BeliefRevisionResult {
  readonly h1: Hypothesis;
  readonly h2: Hypothesis;
  readonly h0: Hypothesis;
  readonly ranked: readonly Hypothesis[];
}

function h1Assessment(withinMargin: boolean, ciOutside: boolean): 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE' {
  if (ciOutside) return 'FALSIFIED_WITHIN_PROTOCOL';
  if (withinMargin) return 'SUPPORTED_WITHIN_PROTOCOL';
  return 'INCONCLUSIVE';
}
function h2Assessment(withinMargin: boolean, ciOutside: boolean): 'SUPPORTED_WITHIN_PROTOCOL' | 'FALSIFIED_WITHIN_PROTOCOL' | 'INCONCLUSIVE' {
  if (ciOutside) return 'SUPPORTED_WITHIN_PROTOCOL';
  if (withinMargin) return 'FALSIFIED_WITHIN_PROTOCOL';
  return 'INCONCLUSIVE';
}
/** H0's own, stricter band — a quarter of the preregistered equivalence margin. Used ONLY to grade this distinct, stronger "no detectable difference at all" hypothesis; never substituted for the preregistered margin used by H1/H2. */
const H0_NOISE_BAND_PP = A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp / 4;

export function runBeliefRevision(potency: PotencyComparison, trials: readonly TrialEfficacyEvidence[]): A1BeliefRevisionResult {
  const prior = 1 / 3;
  let h1 = createHypothesis('A1-H1-SUBSTITUTION_SUPPORTED', { metric: 'GLP-1R potency ratio + HbA1c delta', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp, rationale: A1_PREREGISTRATION.hypotheses.H1_SUBSTITUTION_SUPPORTED }, prior);
  let h2 = createHypothesis('A1-H2-NOT_SUPPORTED', { metric: 'GLP-1R potency ratio + HbA1c delta', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp, rationale: A1_PREREGISTRATION.hypotheses.H2_NOT_SUPPORTED }, prior);
  let h0 = createHypothesis('A1-H0-NULL', { metric: 'HbA1c delta', relation: 'equal-within-tolerance', expectedValue: 0, tolerance: H0_NOISE_BAND_PP, rationale: A1_PREREGISTRATION.hypotheses.H0_NULL }, prior);

  let step = 0;
  if (potency.ratioLiraOverSema !== null) {
    const logRatio = Math.log(potency.ratioLiraOverSema);
    const logTolerance = Math.log(A1_PREREGISTRATION.thresholds.potencyRatioWindow.max);
    const magnitude = evidenceMagnitudeWithinTolerance(logRatio, 0, logTolerance);
    const within = potency.ratioWithinWindow === true;
    h1 = updateConfidence(h1, within ? 'SUPPORTED_WITHIN_PROTOCOL' : 'FALSIFIED_WITHIN_PROTOCOL', magnitude, `GLP-1R potency ratio lira/sema = ${potency.ratioLiraOverSema.toFixed(3)}`, step);
    h2 = updateConfidence(h2, within ? 'FALSIFIED_WITHIN_PROTOCOL' : 'SUPPORTED_WITHIN_PROTOCOL', magnitude, `GLP-1R potency ratio lira/sema = ${potency.ratioLiraOverSema.toFixed(3)}`, step);
    h0 = updateConfidence(h0, 'INCONCLUSIVE', 0, 'A single potency-ratio point does not test H0\'s within-noise claim on its own', step);
    step += 1;
  }

  for (const trial of trials) {
    const magnitude = evidenceMagnitudeWithinTolerance(trial.deltaPp, 0, A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp);
    h1 = updateConfidence(h1, h1Assessment(trial.withinMargin, trial.diffCiEntirelyOutsideMargin), magnitude, `${trial.nctId}: delta=${trial.deltaPp.toFixed(2)}pp`, step);
    h2 = updateConfidence(h2, h2Assessment(trial.withinMargin, trial.diffCiEntirelyOutsideMargin), magnitude, `${trial.nctId}: delta=${trial.deltaPp.toFixed(2)}pp`, step);

    const h0Magnitude = evidenceMagnitudeWithinTolerance(trial.deltaPp, 0, H0_NOISE_BAND_PP);
    const h0CiIncludesZero = trial.diffCi95.low <= 0 && trial.diffCi95.high >= 0;
    const h0Within = Math.abs(trial.deltaPp) <= H0_NOISE_BAND_PP;
    const h0Verdict = !h0CiIncludesZero ? 'FALSIFIED_WITHIN_PROTOCOL' : h0Within ? 'SUPPORTED_WITHIN_PROTOCOL' : 'INCONCLUSIVE';
    h0 = updateConfidence(h0, h0Verdict, h0Magnitude, `${trial.nctId}: delta=${trial.deltaPp.toFixed(2)}pp against H0's stricter ±${H0_NOISE_BAND_PP}pp band`, step);
    step += 1;
  }

  return { h1, h2, h0, ranked: rankHypotheses([h1, h2, h0]) };
}

const HYPOTHESIS_ID_BY_INTERNAL_ID: Readonly<Record<string, A1HypothesisId>> = {
  'A1-H1-SUBSTITUTION_SUPPORTED': 'H1_SUBSTITUTION_SUPPORTED',
  'A1-H2-NOT_SUPPORTED': 'H2_NOT_SUPPORTED',
  'A1-H0-NULL': 'H0_NULL',
};

// ---------------------------------------------------------------------------
// Full analysis: orchestration + gated candidate
// ---------------------------------------------------------------------------

export interface A1AnalysisReport {
  readonly contractVersion: string;
  readonly preregistrationFingerprint: string;
  readonly target: { readonly targetChemblId: string; readonly prefName: string };
  readonly potency: PotencyComparison;
  readonly trials: readonly TrialEfficacyEvidence[];
  readonly negativeControls: readonly NegativeControlResult[];
  readonly verdict: A1Verdict;
  readonly beliefRevision: A1BeliefRevisionResult;
  readonly verdictDisagreesWithRanking: boolean;
  readonly gatedCandidate: GatedCandidate;
  readonly gateDecision: GateDecision;
  readonly surface: 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE';
  readonly fetchProvenance: typeof a1FetchMeta;
  readonly analysisFingerprint: string;
}

function buildCandidateStatement(verdict: A1Verdict, potency: PotencyComparison, trials: readonly TrialEfficacyEvidence[]): string {
  const ratioText = potency.ratioLiraOverSema !== null ? `GLP-1R binding potency ratio (liraglutide/semaglutide) ~${potency.ratioLiraOverSema.toFixed(2)}` : 'GLP-1R binding potency ratio not computable from qualifying assays';
  const trialSummary = trials.map((t) => `${t.nctId} delta=${t.deltaPp.toFixed(2)}pp`).join('; ');
  if (verdict.hypothesisId === 'H1_SUBSTITUTION_SUPPORTED') {
    return `Population-level evidence is consistent with liraglutide as a pharmacologically defensible GLP-1R substitute for semaglutide during a supply shortage: ${ratioText}, within the preregistered equivalence window; HbA1c deltas across ${trials.length} qualifying trials (${trialSummary}) stayed within the preregistered ±${A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp} percentage-point margin. This is a population-level pharmacological comparison, not a clinical instruction for any individual patient.`;
  }
  if (verdict.hypothesisId === 'H2_NOT_SUPPORTED') {
    return `Population-level evidence does NOT support treating semaglutide and liraglutide as interchangeable at the doses examined: ${ratioText}; HbA1c evidence across ${trials.length} qualifying trials (${trialSummary}) includes at least one real trial whose 95% CI for the delta sits entirely outside the preregistered ±${A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp} percentage-point margin. This is a population-level pharmacological finding, not a clinical instruction for any individual patient.`;
  }
  if (verdict.hypothesisId === 'H0_NULL') {
    return `Available population-level evidence is inconclusive: ${ratioText}; HbA1c deltas across ${trials.length} qualifying trials (${trialSummary}) did not consistently establish either equivalence or a clear, CI-supported difference under the preregistered margin.`;
  }
  return `Insufficient preregistered evidence to reach a verdict: fewer qualifying assays or trials than the preregistration requires.`;
}

export function runA1Analysis(): A1AnalysisReport {
  const potency = comparePotency();
  const trials = collectDualDrugTrialEvidence();
  const negativeControls = runNegativeControls();
  const verdict = decideVerdict(potency, trials);
  const beliefRevision = runBeliefRevision(potency, trials);

  const topRankedHypothesisId = HYPOTHESIS_ID_BY_INTERNAL_ID[beliefRevision.ranked[0].id];
  const verdictDisagreesWithRanking = verdict.hypothesisId !== 'INCONCLUSIVE_INSUFFICIENT_EVIDENCE' && topRankedHypothesisId !== verdict.hypothesisId;

  const observationIds: string[] = [
    ...potency.semaglutide.qualifyingActivityIds.map((id) => `chembl:activity:${id}`),
    ...potency.liraglutide.qualifyingActivityIds.map((id) => `chembl:activity:${id}`),
    ...trials.map((t) => `ctgov:${t.nctId}`),
  ];

  const unresolvedContradictions: string[] = verdictDisagreesWithRanking
    ? [`Preregistered §8 decision rule reaches ${verdict.hypothesisId}, but the sequential belief-revision ranking (log-odds over the same evidence, reused from experimentFabric/beliefRevision.ts) ranks ${topRankedHypothesisId} highest — a real disagreement between an existential preregistered rule and an averaging heuristic, not resolved automatically here.`]
    : [];

  const candidate: PracticalCandidate = {
    derivedFromModelFingerprint: A1_PREREGISTRATION.fingerprint,
    statement: buildCandidateStatement(verdict, potency, trials),
    constraints: [
      'Applies only to the T2DM population and dose ranges examined in the underlying trials.',
      'Does not establish safety, tolerability, cost, or real-world adherence equivalence.',
      `Preregistered thresholds (potency window [${A1_PREREGISTRATION.thresholds.potencyRatioWindow.min}, ${A1_PREREGISTRATION.thresholds.potencyRatioWindow.max}], efficacy margin ±${A1_PREREGISTRATION.thresholds.efficacyMargin.maxAbsoluteDeltaHbA1cPp}pp) were fixed before any ChEMBL or ClinicalTrials.gov data was pulled — see a1Glp1Preregistration.ts.`,
    ],
    requiredValidation: ['Institutional/regulatory review before any policy or guidance is drawn from this finding.', 'Independent statistical review of the trial-level extraction in a1Glp1Analysis.ts.'],
    proposedProtocol: null,
    protocolWithheldReason: 'This candidate is a population-level research finding. This system does not emit an individual clinical protocol, dose, or substitution instruction — see §14 of the A1 handoff.',
  };

  const gated: GatedCandidate = {
    candidate,
    candidateClass: 'intervention',
    safetyClass: 'POPULATION',
    notProven: [
      'Individual patient safety or tolerability equivalence.',
      'Cost-effectiveness or real-world supply feasibility of substitution.',
      'Efficacy or safety outside the T2DM population and dose ranges studied.',
      'Any claim beyond the three preregistered hypotheses this analysis was designed to test.',
    ],
    handoff: { recipient: 'INSTITUTION', boundary: 'Government Research plane only. Any policy action requires human/institutional authorisation through core/governance — this module authorises nothing.' },
    evidence: {
      observationIds,
      replayFingerprint: A1_PREREGISTRATION.fingerprint,
      provenance: { sourceUrl: 'ChEMBL Web Services + ClinicalTrials.gov API v2 (see a1-glp1/meta.json for per-file URLs and SHA-256 hashes)', sourceVersion: a1FetchMeta.retrievedAt },
      unresolvedContradictions,
      epistemicStatus: 'EVIDENCE_GRADED_POPULATION_FINDING',
    },
  };

  const gateDecision = evaluatePracticalCandidate(gated);
  const surface = surfaceFor(gateDecision.outcome, gated.safetyClass);

  const analysisFingerprint = fnv1a(canonicalJson({
    preregistrationFingerprint: A1_PREREGISTRATION.fingerprint,
    potencyRatio: potency.ratioLiraOverSema,
    trialDeltas: trials.map((t) => ({ nctId: t.nctId, delta: t.deltaPp })),
    verdict: verdict.hypothesisId,
    ranking: beliefRevision.ranked.map((h) => h.id),
  }));

  return {
    contractVersion: A1_ANALYSIS_CONTRACT_VERSION,
    preregistrationFingerprint: A1_PREREGISTRATION.fingerprint,
    target: { targetChemblId: target.targetChemblId, prefName: target.prefName },
    potency,
    trials,
    negativeControls,
    verdict,
    beliefRevision,
    verdictDisagreesWithRanking,
    gatedCandidate: gated,
    gateDecision,
    surface,
    fetchProvenance: a1FetchMeta,
    analysisFingerprint,
  };
}

export { compoundSemaglutide, compoundLiraglutide, compoundMetformin };
