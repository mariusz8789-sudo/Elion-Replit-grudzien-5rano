import {
  extractCandidateEfficacy,
  extractCandidateSafety,
  falsifyCandidate,
  scoreCandidate,
  loadCandidateSummaries,
  type A2TrialRecord,
  type A2CandidateSummary,
  type A2EfficacyEvidence,
  type A2SafetyCategoryResult,
  type A2FalsificationResult,
  type A2CandidateScore,
} from './a2OzempicSubstitute';
import { A2_PREREGISTRATION } from './a2OzempicSubstitutePreregistration';
import { strongestEvidenceClassForEfficacy } from '../orchestrator/evidenceClassMapping';
import surpass2Raw from './a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';
import { canonicalJson, fnv1a } from '../events/hash';
import type { EvidenceClass } from '../agent/evidenceProvenance';
import type { A2CandidateLike } from '../discoveryChallenge/contracts';

/**
 * D-062 REAL DOSE-STRATIFIED EVIDENCE (docs/DECISIONS.md D-062,
 * `docs/QWEN-A2-DISCOVERY-CHALLENGE-BRIEF.md` §3/§6).
 *
 * ZERO NEW EXTRACTION LOGIC for anything `extractCandidateEfficacy` and
 * `extractCandidateSafety` can already reach. Both are called UNMODIFIED,
 * with an EXACT-title regex per dose, so `pickCandidateGroup`'s own
 * "highest dose wins" selection inside `extractCandidateEfficacy` picks the
 * only group that matches — the one requested dose, never the trial's
 * maximum.
 *
 * THE ONE GENUINE GAP, DISCLOSED: SURPASS-2's pinned file reports the 5mg
 * HbA1c arm in a SECONDARY outcome object (`hba1cOutcomes[1]`) that is
 * disjoint from the PRIMARY outcome object (`hba1cOutcomes[0]`, 10mg/15mg +
 * semaglutide) `extractCandidateEfficacy` reads (it always resolves exactly
 * one PRIMARY-or-first outcome object per trial — a correct behaviour for
 * every OTHER trial in this dataset, all single-outcome-object). Rather than
 * edit that function (forbidden — brief §16) or approximate the 5mg point,
 * `directHba1cComparison` below applies the IDENTICAL real formula
 * `extractCandidateEfficacy`'s own DIRECT_HEAD_TO_HEAD branch uses —
 * `delta = candidateMean - semaMean`, `seDiff = sqrt(se1^2+se2^2)`,
 * `ci95 = delta +/- 1.96*seDiff`, same "Standard Error" dispersion handling
 * — to the SAME pinned bytes, just addressed at the second outcome object.
 * A test proves the two paths agree at 10mg/15mg, where both are reachable
 * (`d062DoseStratifiedDiscovery.test.ts`).
 *
 * CRITICAL PARSING TRAP AVOIDED (brief §6): every group is matched by exact
 * TITLE (`^5 mg Tirzepatide$` etc), never by `groupId` — `groupId` is
 * OUTCOME-LOCAL in this file (semaglutide is `OG002` in `hba1cOutcomes[0]`,
 * `OG001` in `hba1cOutcomes[1]`, and `EG003` in `adverseEvents`).
 */

export const D062_SURPASS2_DOSE_STRATA_VERSION = '1.0.0';

const SURPASS2_TRIAL = surpass2Raw as unknown as A2TrialRecord;
const TIRZEPATIDE_ID = 'CHEMBL4297839';
const SEMAGLUTIDE_ARM_TITLE = '1 mg Semaglutide';
const MARGIN_PP = A2_PREREGISTRATION.effectSizeThresholds.efficacyComparableMarginPp;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactTitlePattern(title: string): RegExp {
  return new RegExp(`^${escapeRegExp(title)}$`, 'i');
}

/** The real `A2CandidateSummary` for tirzepatide (CHEMBL4297839) from the pinned candidate space — the dose strata below are regimens of this SAME real molecule, not a new one. */
export function tirzepatideSummary(): A2CandidateSummary {
  const summary = loadCandidateSummaries().find((s) => s.moleculeChemblId === TIRZEPATIDE_ID);
  if (summary === undefined) throw new Error(`${TIRZEPATIDE_ID} is missing from loadCandidateSummaries() — the pinned candidate space changed shape.`);
  return summary;
}

// ---------------------------------------------------------------------------
// The one genuine gap: 5mg HbA1c lives in a second, disjoint outcome object.
// ---------------------------------------------------------------------------

interface RawMeasurement { readonly groupId: string; readonly value: string; readonly spread?: string }
interface RawGroup { readonly id: string; readonly title: string }
interface RawDenomCount { readonly groupId: string; readonly value: string }
interface RawOutcome {
  readonly title: string;
  readonly type: string;
  readonly dispersionType: string | null;
  readonly groups: readonly RawGroup[];
  readonly denoms: readonly { readonly counts: readonly RawDenomCount[] }[];
  readonly classes: readonly { readonly categories: readonly { readonly measurements: readonly RawMeasurement[] }[] }[];
}

function rawHba1cOutcomes(): readonly RawOutcome[] {
  return (surpass2Raw as unknown as { readonly hba1cOutcomes: readonly RawOutcome[] }).hba1cOutcomes;
}

function armStatsFromRaw(outcome: RawOutcome, groupTitle: string): { readonly mean: number; readonly se: number; readonly n: number } | null {
  const group = outcome.groups.find((g) => g.title === groupTitle);
  if (group === undefined) return null;
  const measurement = outcome.classes[0]?.categories[0]?.measurements.find((m) => m.groupId === group.id);
  if (measurement === undefined) return null;
  const n = outcome.denoms[0]?.counts.find((c) => c.groupId === group.id)?.value;
  if (n === undefined) return null;
  const nNum = Number(n);
  const mean = Number(measurement.value);
  if (!Number.isFinite(nNum) || nNum <= 0 || !Number.isFinite(mean) || measurement.spread === undefined) return null;
  const spread = Number(measurement.spread);
  if (!Number.isFinite(spread)) return null;
  const se = outcome.dispersionType === 'Standard Error' ? spread : spread / Math.sqrt(nNum);
  return { mean, se, n: nNum };
}

/**
 * Same DIRECT_HEAD_TO_HEAD formula as `extractCandidateEfficacy`'s own
 * branch (a2OzempicSubstitute.ts), applied to a raw outcome object read
 * directly — for the one dose (5mg) that function's single-PRIMARY-outcome
 * resolution cannot reach. Returns null (never a fabricated value) if
 * either arm's stats are absent.
 */
function directHba1cComparison(outcome: RawOutcome, candidateTitle: string, semaTitle: string): A2EfficacyEvidence | null {
  const candidateStats = armStatsFromRaw(outcome, candidateTitle);
  const semaStats = armStatsFromRaw(outcome, semaTitle);
  if (candidateStats === null || semaStats === null) return null;
  const delta = candidateStats.mean - semaStats.mean;
  const seDiff = Math.sqrt(candidateStats.se ** 2 + semaStats.se ** 2);
  const ci95 = { low: delta - 1.96 * seDiff, high: delta + 1.96 * seDiff };
  return {
    nctId: SURPASS2_TRIAL.nctId,
    candidateArm: { title: candidateTitle, meanChangePp: candidateStats.mean, n: candidateStats.n },
    comparisonType: 'DIRECT_HEAD_TO_HEAD',
    outcomeMetric: 'HBA1C',
    evidenceBasis: 'RANDOMIZED_DIRECT',
    deltaVsSemaglutidePp: delta,
    diffCi95: ci95,
    withinMargin: Math.abs(delta) <= MARGIN_PP,
    diffCiEntirelyOutsideMargin: ci95.high < -MARGIN_PP || ci95.low > MARGIN_PP,
    fairnessFlags: [],
  };
}

// ---------------------------------------------------------------------------
// One dose stratum — real efficacy, real safety, real falsification, real
// score, ALL via unmodified A2 functions.
// ---------------------------------------------------------------------------

export interface DoseStratum {
  readonly doseId: string;
  readonly doseMg: number;
  readonly armTitle: string;
  readonly efficacy: readonly A2EfficacyEvidence[];
  readonly safety: readonly A2SafetyCategoryResult[];
  readonly falsification: A2FalsificationResult;
  readonly score: A2CandidateScore;
  readonly evidenceClass: EvidenceClass;
  readonly observationCount: number;
  readonly fingerprint: string;
}

function buildStratum(doseMg: number, armTitle: string): DoseStratum {
  const summary = tirzepatideSummary();
  const primaryReachable = doseMg !== 5;
  const efficacyEntry = primaryReachable
    ? extractCandidateEfficacy(SURPASS2_TRIAL, exactTitlePattern(armTitle), MARGIN_PP)
    : directHba1cComparison(rawHba1cOutcomes()[1]!, armTitle, SEMAGLUTIDE_ARM_TITLE);
  const efficacy = efficacyEntry === null ? [] : [efficacyEntry];
  const safety = extractCandidateSafety(SURPASS2_TRIAL, armTitle, null, null);
  const falsification = falsifyCandidate(efficacy, safety, 'EVIDENCE_CLASS_GATED');
  const score = scoreCandidate(summary, efficacy, safety, falsification);
  // Real, distinct arm-level observations behind this dose: the HbA1c
  // comparison (if any) plus every safety category that produced a real
  // computed risk ratio (a category with no comparable data contributes
  // nothing — never padded to reach a threshold; brief §8.3/§16).
  const observationCount = efficacy.length + safety.filter((s) => s.riskRatio !== null).length;
  const evidenceClass = efficacy.length > 0 ? strongestEvidenceClassForEfficacy(efficacy) : 'UNVERIFIED';
  const fingerprint = fnv1a(canonicalJson({ doseMg, armTitle, efficacy, safety: safety.map((s) => ({ key: s.key, riskRatio: s.riskRatio })) }));
  return { doseId: `TIRZEPATIDE-${doseMg}MG`, doseMg, armTitle, efficacy, safety, falsification, score, evidenceClass, observationCount, fingerprint };
}

/** The three real dose strata this challenge's candidate pool draws from — L1 (brief §9): absent from the fixed A2 candidate set, which only ever sees the 15mg ("highest dose wins") arm. */
export function surpass2DoseStrata(): readonly DoseStratum[] {
  return [buildStratum(5, '5 mg Tirzepatide'), buildStratum(10, '10 mg Tirzepatide'), buildStratum(15, '15 mg Tirzepatide')];
}

/** The frozen baseline arm itself, as a `DoseStratum`-shaped self-comparison (delta=0, riskRatio=1 by construction — the trial's own semaglutide arm compared to itself is not computed; its `knownOutcomeMetrics` are defined as the zero point every stratum's efficacy/harm are already expressed relative to). */
export function surpass2BaselineArmTitle(): string {
  return SEMAGLUTIDE_ARM_TITLE;
}

/**
 * Maps one real `DoseStratum` onto the challenge's generic `A2CandidateLike`
 * shape. `efficacy`/`harm` REUSE `scoreCandidate`'s own bounded, already
 * "vs semaglutide" scores — `efficacy = efficacyScore` (higher = better,
 * unchanged sign), `harm = -safetyScore` (`safetyScore` is higher-is-safer;
 * negating it makes lower-is-safer, matching this challenge's frozen
 * `harmRelation: '<'.` No new scoring formula.
 */
export function doseStratumToCandidate(stratum: DoseStratum): A2CandidateLike {
  return Object.freeze({
    candidateId: stratum.doseId,
    label: `Tirzepatide ${stratum.doseMg}mg (${stratum.armTitle})`,
    mechanism: 'GLP-1R/GIPR dual agonism (tirzepatide), dose-stratified',
    efficacy: stratum.score.efficacyScore,
    harm: -stratum.score.safetyScore,
    evidenceRefs: [
      ...stratum.efficacy.map((e) => `ctgov:${e.nctId}:HBA1C:${stratum.armTitle}`),
      ...stratum.safety.filter((s) => s.riskRatio !== null).map((s) => `ctgov:${SURPASS2_TRIAL.nctId}:${s.key}:${stratum.armTitle}`),
    ],
    evidenceClass: stratum.evidenceClass,
    observationCount: stratum.observationCount,
  });
}
