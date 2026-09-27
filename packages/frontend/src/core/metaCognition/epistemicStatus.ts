import { canonicalJson, fnv1a } from '../events/hash';
import type { DecisionEvidenceRef } from './decisionTrace';

/**
 * D-141 META-COGNITIVE EPISTEMIC STATUS.
 *
 * Status vocabulary for the AI's own meta-cognitive CLAIMS (what it currently believes and how
 * grounded that belief is) — distinct from `scientificWorlds/humanLab/epistemic.ts::EpistemicLabel`,
 * which labels world CONTENT (is this anatomy feature a real observation or a reconstruction).
 * Repo-wide grep before writing this file found no existing KNOWN/SUPPORTED/INFERRED/SIMULATED/
 * ASSUMED/UNKNOWN/CONTRADICTED/UNVERIFIED taxonomy anywhere — this is the one canonical definition,
 * not a duplicate. `decisionTrace.ts`'s `inputClassification`/`outputClassification` fields (plain
 * strings, by design) may now be filled with this vocabulary.
 *
 * Like `decisionTrace.ts`, this module is pure and stateless: it detects/records structured
 * events from caller-supplied claims. It does not persist a MetaMemory of its own.
 */
export const META_COGNITIVE_EPISTEMIC_STATUS_VERSION = '1.0.0';

export type MetaCognitiveEpistemicStatus =
  | 'KNOWN'
  | 'SUPPORTED'
  | 'INFERRED'
  | 'SIMULATED'
  | 'ASSUMED'
  | 'UNKNOWN'
  | 'CONTRADICTED'
  | 'UNVERIFIED';

const META_COGNITIVE_EPISTEMIC_STATUSES: readonly MetaCognitiveEpistemicStatus[] = [
  'KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED',
];

export function isMetaCognitiveEpistemicStatus(value: string): value is MetaCognitiveEpistemicStatus {
  return (META_COGNITIVE_EPISTEMIC_STATUSES as readonly string[]).includes(value);
}

/** One meta-cognitive claim the caller holds. Structured — subject/predicate/value, never free prose. */
export interface MetaClaim {
  readonly id: string;
  readonly subject: string;
  readonly predicate: string;
  readonly value: string | number | boolean | null;
  readonly status: MetaCognitiveEpistemicStatus;
  readonly evidenceRefs: readonly DecisionEvidenceRef[];
}

export interface MetaContradictionDetectedEvent {
  readonly contractVersion: string;
  readonly eventType: 'META_CONTRADICTION_DETECTED';
  readonly id: string;
  readonly claimAId: string;
  readonly claimBId: string;
  readonly reason: string;
}

export interface MetaObservationRecordedEvent {
  readonly contractVersion: string;
  readonly eventType: 'META_OBSERVATION_RECORDED';
  readonly id: string;
  readonly claimId: string;
  readonly status: MetaCognitiveEpistemicStatus;
}

/**
 * Two claims genuinely contradict only when they speak to the same subject+predicate, disagree
 * on value, and neither is still UNKNOWN (an unresolved claim cannot contradict anything yet).
 * Returns null rather than fabricating a contradiction when those conditions are not met.
 */
export function detectMetaContradiction(a: MetaClaim, b: MetaClaim): MetaContradictionDetectedEvent | null {
  if (a.subject !== b.subject || a.predicate !== b.predicate) return null;
  if (a.value === b.value) return null;
  if (a.status === 'UNKNOWN' || b.status === 'UNKNOWN') return null;
  const id = `meta-contradiction_${fnv1a(canonicalJson({ a: a.id, b: b.id, subject: a.subject, predicate: a.predicate }))}`;
  return {
    contractVersion: META_COGNITIVE_EPISTEMIC_STATUS_VERSION,
    eventType: 'META_CONTRADICTION_DETECTED',
    id,
    claimAId: a.id,
    claimBId: b.id,
    reason: `subject="${a.subject}" predicate="${a.predicate}": claim ${a.id}=${JSON.stringify(a.value)} (${a.status}) vs claim ${b.id}=${JSON.stringify(b.value)} (${b.status})`,
  };
}

export function recordMetaObservation(claim: MetaClaim): MetaObservationRecordedEvent {
  const id = `meta-observation_${fnv1a(canonicalJson({ claim: claim.id, status: claim.status, value: claim.value }))}`;
  return { contractVersion: META_COGNITIVE_EPISTEMIC_STATUS_VERSION, eventType: 'META_OBSERVATION_RECORDED', id, claimId: claim.id, status: claim.status };
}

/**
 * Derives CONTRADICTED status for every claim that appears as either side of at least one real
 * detected contradiction — never asserted a priori, always derived from the actual claim set
 * passed in. Claims not involved in any contradiction keep their original status unchanged.
 */
export function deriveContradictedStatuses(claims: readonly MetaClaim[]): readonly MetaClaim[] {
  const contradictedIds = new Set<string>();
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const event = detectMetaContradiction(claims[i]!, claims[j]!);
      if (event) { contradictedIds.add(event.claimAId); contradictedIds.add(event.claimBId); }
    }
  }
  return claims.map((c) => (contradictedIds.has(c.id) ? { ...c, status: 'CONTRADICTED' as const } : c));
}
