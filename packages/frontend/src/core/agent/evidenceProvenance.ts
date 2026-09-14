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
export const EVIDENCE_CLASS_RANK: Readonly<Record<EvidenceClass, number>> = {
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

/** One counted outcome in one arm of one study — the atom this file protects. */
export interface CountedOutcomeObservation {
  readonly observationId: string;
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

export interface RiskRatioComparison {
  /** COMPUTED from the two observations. Never supplied by a caller. */
  readonly evidenceClass: EvidenceClass;
  readonly sameStudy: boolean;
  readonly studyIds: readonly string[];
  readonly term: string;
  readonly exposed: CountedOutcomeObservation;
  readonly reference: CountedOutcomeObservation;
  readonly riskRatio: number;
  readonly ci95: Ci95;
  /** Events, not participants — the quantity a confidence interval actually rests on. */
  readonly totalEvents: number;
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
    riskRatio: rr,
    ci95,
    totalEvents: exposed.numAffected + reference.numAffected,
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

export function strongestEvidenceClass(comparisons: readonly RiskRatioComparison[]): EvidenceClass | null {
  let best: EvidenceClass | null = null;
  for (const c of comparisons) {
    if (best === null || EVIDENCE_CLASS_RANK[c.evidenceClass] > EVIDENCE_CLASS_RANK[best]) best = c.evidenceClass;
  }
  return best;
}

/**
 * Of the comparisons available for one outcome term, the one a decision
 * should rest on: strongest class first, then the most events. Never the
 * largest risk ratio — selecting on the effect being measured is how a
 * screening pipeline manufactures its own findings.
 */
export function selectDecisionComparison(comparisons: readonly RiskRatioComparison[]): RiskRatioComparison | null {
  let best: RiskRatioComparison | null = null;
  for (const c of comparisons) {
    if (best === null) { best = c; continue; }
    const rank = EVIDENCE_CLASS_RANK[c.evidenceClass] - EVIDENCE_CLASS_RANK[best.evidenceClass];
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
): void {
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
  const stronger = sameTerm.filter((c) => EVIDENCE_CLASS_RANK[c.evidenceClass] > EVIDENCE_CLASS_RANK[chosen.evidenceClass]);
  if (stronger.length === 0) return;
  if (waiver === null || waiver.reason.trim() === '') {
    const names = stronger.map((c) => `${c.evidenceClass} from ${c.studyIds.join('+')} (${c.totalEvents} events)`).join('; ');
    throw new Error(
      `${context}: refusing to veto on ${chosen.evidenceClass} evidence from ${chosen.studyIds.join('+')} (${chosen.totalEvents} events) for "${chosen.term}" while stronger evidence is available: ${names}. ` +
        'Use the stronger comparison, or record a WeakerEvidenceWaiver saying why it cannot be used.',
    );
  }
  if (waiver.recordedBy.trim() === '') throw new Error(`${context}: a WeakerEvidenceWaiver must name who recorded it.`);
}
