import { canonicalJson, fnv1a } from '../events/hash';

/**
 * EVIDENCE PROVENANCE — source study identity and evidence class, carried
 * together so neither can be dropped on the way to a decision.
 *
 * WHY THIS FILE EXISTS (docs/DECISIONS.md D-042). The Government Drug
 * Discovery campaign vetoed a candidate on `Diarrhea risk ratio 2.71 vs
 * semaglutide, CI excludes 1`. That 2.71 is an n=16 phase-2 cohort from
 * NCT03322631 divided by the semaglutide arm of a different trial,
 * NCT03987919 — while NCT03987919 also contains tirzepatide arms, i.e. a
 * DIRECT randomised comparison of the very same two drugs, pinned in this
 * repository and never consulted. `a2OzempicSubstitute.ts` labelled that
 * comparison `NAIVE_INDIRECT` correctly and then vetoed anyway, because
 * `falsifyCandidate` never read the label.
 *
 * The lesson is not "fix that fixture". It is that an observation which
 * crosses a module boundary without its SOURCE STUDY IDENTITY and its
 * EVIDENCE CLASS will reproduce this defect in every future domain. So both
 * travel inside the observation here, and the evidence class is COMPUTED
 * from the two studies being compared — never supplied by a caller, for the
 * same reason `discoveryContracts.ts::classifyDiscoveryStatus` computes
 * rather than accepts a `DiscoveryStatus`.
 *
 * DOMAIN-NEUTRAL ON PURPOSE. Counted outcomes are what clinical trials
 * report, but the identity/class pair is what QE4, Kepler and any future
 * campaign need too; `LaboratoryObservationContract` (next step of the
 * mandate) builds the observation bridge on these types rather than
 * inventing a parallel set.
 *
 * CLOCK RULE (D-040): `retrievedAt` is provenance. It may order events and
 * it may gate freshness. It is NEVER an input to a fingerprint. Every
 * fingerprint below projects it away explicitly.
 */

export const EVIDENCE_PROVENANCE_CONTRACT_VERSION = '1.0.0';

/**
 * How strongly a comparison is supported by its design. The ordering is the
 * standard evidence hierarchy; `DIRECT_RANDOMISED` outranks
 * `INDIRECT_RANDOMISED` precisely because the latter compares arms that were
 * never randomised against each other.
 */
export type EvidenceClass =
  | 'DIRECT_RANDOMISED'
  | 'INDIRECT_RANDOMISED'
  | 'POOLED_META'
  | 'NETWORK_META'
  | 'OBSERVATIONAL'
  | 'REGULATORY_LABEL'
  | 'POST_MARKETING'
  | 'MECHANISTIC'
  | 'COMPUTATIONAL'
  | 'UNVERIFIED';

/** Higher is stronger. Used for ordering only — never as a weight in a score. */
export type EvidenceRanking = Readonly<Record<EvidenceClass, number>>;

/**
 * A PREREGISTRABLE DEFAULT, NOT A UNIVERSAL ORDER OF TRUTH.
 *
 * This is the ordering a campaign gets if it does not declare its own, and it
 * encodes contestable claims. The clearest is `REGULATORY_LABEL` sitting below
 * `OBSERVATIONAL`: for "what is the excess risk of this event" a pooled label
 * table really is a weaker instrument than a well-designed cohort, but for
 * "what is this product approved to claim" or "what warning does the authority
 * require" the label is the primary source and no cohort outranks it. The same
 * goes for `MECHANISTIC` on a question about mechanism.
 *
 * So an experiment that cares about the order must FREEZE its own ranking in
 * its preregistration and pass it in, and every gate below records which
 * ranking it applied (`rankingFingerprint`) so an auditor can see the order
 * that was actually used rather than assume this one.
 *
 * What is NOT negotiable, and therefore not expressed as a rank:
 *  - `DIRECT_RANDOMISED` above `INDIRECT_RANDOMISED`. Two arms randomised
 *    against each other versus two arms that never were is a fact about the
 *    design, not a policy preference.
 *  - `yieldsRiskRatio`. Denominator-free sources cannot produce a rate at any
 *    rank, which is why that is a predicate rather than a position.
 */
export const DEFAULT_EVIDENCE_CLASS_RANK: EvidenceRanking = {
  DIRECT_RANDOMISED: 10,
  INDIRECT_RANDOMISED: 9,
  POOLED_META: 8,
  NETWORK_META: 7,
  OBSERVATIONAL: 6,
  REGULATORY_LABEL: 5,
  POST_MARKETING: 4,
  MECHANISTIC: 3,
  COMPUTATIONAL: 2,
  UNVERIFIED: 1,
};

/**
 * A declared ranking must cover every class and must keep the two
 * non-negotiables above. Ties are allowed: declaring two classes equally
 * strong for a given question is a legitimate position; silently dropping one
 * is not.
 */
export function assertRankingUsable(ranking: EvidenceRanking, context: string): void {
  for (const cls of Object.keys(DEFAULT_EVIDENCE_CLASS_RANK) as EvidenceClass[]) {
    if (typeof ranking[cls] !== 'number' || !Number.isFinite(ranking[cls])) {
      throw new Error(`${context}: declared evidence ranking is missing a finite rank for "${cls}". A partial ranking silently drops a class instead of taking a position on it.`);
    }
  }
  if (ranking.DIRECT_RANDOMISED <= ranking.INDIRECT_RANDOMISED) {
    throw new Error(`${context}: a ranking may not place DIRECT_RANDOMISED at or below INDIRECT_RANDOMISED. That is a fact about randomisation, not a policy choice.`);
  }
}

/** Identifies which ordering a decision was made under, so an audit never has to assume the default. */
export function rankingFingerprint(ranking: EvidenceRanking): string {
  return fnv1a(canonicalJson(ranking));
}

/**
 * Spontaneous-report systems (FAERS and kin) have no denominator: the number
 * of people exposed is unknown, so a rate — and therefore a risk ratio —
 * cannot be formed from them at all. This is a stronger statement than "weak
 * evidence", which is why it is a separate predicate rather than a rank.
 */
export function yieldsRiskRatio(evidenceClass: EvidenceClass): boolean {
  return evidenceClass !== 'POST_MARKETING' && evidenceClass !== 'MECHANISTIC' && evidenceClass !== 'UNVERIFIED';
}

/** Which study a number came from, and which bytes of it we actually hold. */
export interface SourceStudyIdentity {
  readonly registry: string;
  readonly studyId: string;
  readonly title: string;
  readonly sourceUrl: string;
  /** sha256 of the bytes in THIS repository — never a hash quoted from a third party. */
  readonly contentSha256: string;
  readonly contentBytes: number;
  /** Provenance only. Never hashed. */
  readonly retrievedAt: string;
  readonly randomised: boolean;
}

/** Which arm of that study. `nAtRisk` is the arm denominator as the study reports it. */
export interface ArmIdentity {
  readonly groupId: string;
  readonly title: string;
  readonly nAtRisk: number;
}

/**
 * Where in Genesis's own work an observation was used. Separate from the study
 * identity above, which says where the NUMBER came from: an auditor asking
 * "why did this campaign veto this candidate" needs both, and they are not the
 * same question.
 *
 * Optional because the same observation is legitimately read outside any
 * campaign (a demonstrator, a test, an ingest). Present or absent, it never
 * changes the number.
 */
export interface ObservationContext {
  readonly experimentId: string;
  readonly campaignId: string;
  readonly candidateId: string;
}

/** One counted outcome in one arm of one study — the atom this file protects. */
export interface CountedOutcomeObservation {
  readonly observationId: string;
  readonly context?: ObservationContext;
  readonly study: SourceStudyIdentity;
  readonly arm: ArmIdentity;
  readonly term: string;
  readonly numAffected: number;
  readonly numAtRisk: number;
  /** e.g. 'MedDRA 23.1'. Null when the source does not state one. */
  readonly codingSystem: string | null;
  readonly population: string;
}

export interface Ci95 {
  readonly low: number;
  readonly high: number;
}

/** How a derived number was produced. Named so a reader never has to infer the estimator from the value. */
export type DerivationMethod = 'KATZ_LOG_RISK_RATIO';

export interface RiskRatioComparison {
  /** COMPUTED from the two observations. Never supplied by a caller. */
  readonly evidenceClass: EvidenceClass;
  readonly sameStudy: boolean;
  readonly studyIds: readonly string[];
  readonly term: string;
  readonly exposed: CountedOutcomeObservation;
  readonly reference: CountedOutcomeObservation;
  /** Flattened arm/study identity, so a consumer that carries only the comparison still cannot lose it. */
  readonly sourceStudyId: string;
  readonly sourceArmId: string;
  readonly comparatorStudyId: string;
  readonly comparatorArmId: string;
  readonly riskRatio: number;
  readonly ci95: Ci95;
  readonly derivationMethod: DerivationMethod;
  /** Events, not participants — the quantity a confidence interval actually rests on. */
  readonly totalEvents: number;
  /** The field names that went into `fingerprint`, so an auditor never has to read this file to know what it covers. */
  readonly fingerprintInputs: readonly string[];
  readonly fingerprint: string;
}

function assertObservation(o: CountedOutcomeObservation): void {
  if (o.study.studyId.trim() === '') throw new Error('CountedOutcomeObservation: empty studyId — an observation without a source study is exactly the defect this contract exists to prevent.');
  if (o.arm.groupId.trim() === '') throw new Error(`CountedOutcomeObservation ${o.observationId}: empty arm groupId — a count with no arm cannot be compared to anything.`);
  if (o.term.trim() === '') throw new Error(`CountedOutcomeObservation ${o.observationId}: empty outcome term.`);
  if (!Number.isFinite(o.numAffected) || o.numAffected < 0) throw new Error(`CountedOutcomeObservation ${o.observationId}: numAffected must be a non-negative finite number, got ${String(o.numAffected)}.`);
  if (!Number.isFinite(o.numAtRisk) || o.numAtRisk <= 0) throw new Error(`CountedOutcomeObservation ${o.observationId}: numAtRisk must be a positive finite number, got ${String(o.numAtRisk)}.`);
  if (o.numAffected > o.numAtRisk) throw new Error(`CountedOutcomeObservation ${o.observationId}: numAffected ${o.numAffected} exceeds numAtRisk ${o.numAtRisk}.`);
  if (o.arm.nAtRisk !== o.numAtRisk) throw new Error(`CountedOutcomeObservation ${o.observationId}: arm denominator ${o.arm.nAtRisk} disagrees with outcome denominator ${o.numAtRisk} — one of the two was read from the wrong arm.`);
}

/**
 * THE COMPUTED CLASS. Two randomised arms of the SAME study were randomised
 * against each other; two arms of DIFFERENT studies never were, however
 * impeccable each study is on its own.
 */
export function classifyComparisonEvidenceClass(exposed: CountedOutcomeObservation, reference: CountedOutcomeObservation): EvidenceClass {
  assertObservation(exposed);
  assertObservation(reference);
  if (exposed.term !== reference.term) throw new Error(`Cannot compare different outcome terms: "${exposed.term}" vs "${reference.term}".`);
  if (exposed.study.studyId === reference.study.studyId && exposed.arm.groupId === reference.arm.groupId) {
    throw new Error(`Cannot compare arm ${exposed.arm.groupId} of ${exposed.study.studyId} with itself.`);
  }
  if (!exposed.study.randomised || !reference.study.randomised) return 'OBSERVATIONAL';
  return exposed.study.studyId === reference.study.studyId ? 'DIRECT_RANDOMISED' : 'INDIRECT_RANDOMISED';
}

/** Katz log method — the same standard interval `a2OzempicSubstitute.ts` already uses, stated once here. */
function katz(p1: number, n1: number, p2: number, n2: number): { rr: number; ci95: Ci95 } {
  const rr = p1 / p2;
  const seLogRr = Math.sqrt((1 - p1) / (p1 * n1) + (1 - p2) / (p2 * n2));
  const logRr = Math.log(rr);
  return { rr, ci95: { low: Math.exp(logRr - 1.96 * seLogRr), high: Math.exp(logRr + 1.96 * seLogRr) } };
}

/**
 * Null — not a fabricated interval — when either arm has zero events: the
 * Katz interval is undefined there, and a continuity correction would be an
 * invented number.
 */
export function compareCountedOutcomes(exposed: CountedOutcomeObservation, reference: CountedOutcomeObservation): RiskRatioComparison | null {
  const evidenceClass = classifyComparisonEvidenceClass(exposed, reference);
  if (exposed.numAffected === 0 || reference.numAffected === 0) return null;

  const p1 = exposed.numAffected / exposed.numAtRisk;
  const p2 = reference.numAffected / reference.numAtRisk;
  const { rr, ci95 } = katz(p1, exposed.numAtRisk, p2, reference.numAtRisk);

  const sameStudy = exposed.study.studyId === reference.study.studyId;
  const studyIds = sameStudy ? [exposed.study.studyId] : [exposed.study.studyId, reference.study.studyId].sort();

  const hashable = {
    contractVersion: EVIDENCE_PROVENANCE_CONTRACT_VERSION,
    evidenceClass,
    term: exposed.term,
    studyIds,
    exposed: { studyId: exposed.study.studyId, sha256: exposed.study.contentSha256, groupId: exposed.arm.groupId, numAffected: exposed.numAffected, numAtRisk: exposed.numAtRisk },
    reference: { studyId: reference.study.studyId, sha256: reference.study.contentSha256, groupId: reference.arm.groupId, numAffected: reference.numAffected, numAtRisk: reference.numAtRisk },
  };

  return {
    evidenceClass,
    sameStudy,
    studyIds,
    term: exposed.term,
    exposed,
    reference,
    sourceStudyId: exposed.study.studyId,
    sourceArmId: exposed.arm.groupId,
    comparatorStudyId: reference.study.studyId,
    comparatorArmId: reference.arm.groupId,
    riskRatio: rr,
    ci95,
    derivationMethod: 'KATZ_LOG_RISK_RATIO',
    totalEvents: exposed.numAffected + reference.numAffected,
    fingerprintInputs: Object.keys(hashable).sort(),
    fingerprint: fnv1a(canonicalJson(hashable)),
  };
}

/** Mirrors `assertValidDiscoveryStatus`: catches a class that was written down rather than derived. */
export function assertComparisonEvidenceClass(comparison: RiskRatioComparison, context: string): void {
  const recomputed = classifyComparisonEvidenceClass(comparison.exposed, comparison.reference);
  if (recomputed !== comparison.evidenceClass) {
    throw new Error(`${context}: evidenceClass "${comparison.evidenceClass}" was asserted but recomputing from the two source studies gives "${recomputed}". Evidence class is computed, never declared.`);
  }
}

export function strongestEvidenceClass(comparisons: readonly RiskRatioComparison[], ranking: EvidenceRanking = DEFAULT_EVIDENCE_CLASS_RANK): EvidenceClass | null {
  assertRankingUsable(ranking, 'strongestEvidenceClass');
  let best: EvidenceClass | null = null;
  for (const c of comparisons) {
    if (best === null || ranking[c.evidenceClass] > ranking[best]) best = c.evidenceClass;
  }
  return best;
}

/**
 * Of the comparisons available for one outcome term, the one a decision
 * should rest on: strongest class first, then the most events. Never the
 * largest risk ratio — selecting on the effect being measured is how a
 * screening pipeline manufactures its own findings.
 */
export function selectDecisionComparison(comparisons: readonly RiskRatioComparison[], ranking: EvidenceRanking = DEFAULT_EVIDENCE_CLASS_RANK): RiskRatioComparison | null {
  assertRankingUsable(ranking, 'selectDecisionComparison');
  let best: RiskRatioComparison | null = null;
  for (const c of comparisons) {
    if (best === null) { best = c; continue; }
    const rank = ranking[c.evidenceClass] - ranking[best.evidenceClass];
    if (rank > 0 || (rank === 0 && c.totalEvents > best.totalEvents)) best = c;
  }
  return best;
}

/** Why a stronger comparison could not be used. Free text is deliberate: it has to be readable in an audit. */
export interface WeakerEvidenceWaiver {
  readonly reason: string;
  readonly recordedBy: string;
}

/**
 * THE GATE (mandate step 5). A veto drawn from weaker evidence while
 * stronger evidence is available is refused unless the caller records why
 * the stronger evidence could not be used. Silence is not an option here —
 * that silence is precisely what produced D-042.
 */
export function assertVetoEvidenceIsStrongest(
  chosen: RiskRatioComparison,
  available: readonly RiskRatioComparison[],
  waiver: WeakerEvidenceWaiver | null,
  context: string,
  ranking: EvidenceRanking = DEFAULT_EVIDENCE_CLASS_RANK,
): void {
  assertRankingUsable(ranking, context);
  assertComparisonEvidenceClass(chosen, context);
  // Currently unreachable through `compareCountedOutcomes`, whose output can
  // only classify as DIRECT/INDIRECT/OBSERVATIONAL - a relabelled class is
  // caught by the recompute above. Kept because meta-analytic and
  // post-marketing evidence will get their own constructors, and this is the
  // line that must already be here when they do.
  if (!yieldsRiskRatio(chosen.evidenceClass)) {
    throw new Error(`${context}: ${chosen.evidenceClass} evidence has no denominator and cannot yield a risk ratio, let alone a veto.`);
  }
  const sameTerm = available.filter((c) => c.term === chosen.term);
  const stronger = sameTerm.filter((c) => ranking[c.evidenceClass] > ranking[chosen.evidenceClass]);
  if (stronger.length === 0) return;
  if (waiver === null || waiver.reason.trim() === '') {
    const names = stronger.map((c) => `${c.evidenceClass} from ${c.studyIds.join('+')} (${c.totalEvents} events)`).join('; ');
    throw new Error(
      `${context}: refusing to veto on ${chosen.evidenceClass} evidence from ${chosen.studyIds.join('+')} (${chosen.totalEvents} events) for "${chosen.term}" while stronger evidence is available under ranking ${rankingFingerprint(ranking)}: ${names}. ` +
        'Use the stronger comparison, or record a WeakerEvidenceWaiver saying why it cannot be used.',
    );
  }
  if (waiver.recordedBy.trim() === '') throw new Error(`${context}: a WeakerEvidenceWaiver must name who recorded it.`);
}
