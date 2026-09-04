import type { TargetEvidenceRef } from './targetHypothesis';

/**
 * TRANSPORTER EVIDENCE — DAT / NET / SERT, per compound, fail-closed.
 *
 * A separate, narrower vocabulary from `TargetHypothesis` on purpose:
 * `TargetHypothesis.status` (RESOLVED/PARTIAL/UNKNOWN/NOT_AVAILABLE/BLOCKED)
 * answers "do we know what the target IS". This module answers a different
 * question per named transporter: "how well-established is THIS compound's
 * activity at THIS transporter, right now, in this runtime" — exactly the
 * VERIFIED/INFERRED/UNKNOWN/NOT_AVAILABLE ladder the precision mission asks
 * for. `TargetEvidenceRef` (source/identifier/establishes) is reused verbatim
 * for citations, because a real reference is a real reference regardless of
 * which module is citing it.
 *
 * THE RULE THAT MATTERS: VERIFIED requires a real citation — the constructor
 * throws without one, so "VERIFIED" cannot be typed in without evidence
 * behind it. INFERRED is reserved for class-level/structural reasoning
 * (e.g. "this is a ring-substituted cathinone, and cathinones as a class
 * interact with monoamine transporters") — it is never a weaker way to state
 * a compound-specific claim Genesis isn't sure of; if the compound-specific
 * claim is unsure, the status is UNKNOWN, not a hedged INFERRED.
 */
export const TRANSPORTER_EVIDENCE_VERSION = '1.0.0';

export type TransporterId = 'DAT' | 'NET' | 'SERT';
export const TRANSPORTER_IDS: readonly TransporterId[] = ['DAT', 'NET', 'SERT'];

export const TRANSPORTER_LABELS: Readonly<Record<TransporterId, string>> = {
  DAT: 'Dopamine transporter (DAT, SLC6A3)',
  NET: 'Norepinephrine transporter (NET, SLC6A2)',
  SERT: 'Serotonin transporter (SERT, SLC6A4)',
};

export type TransporterEvidenceStatus = 'VERIFIED' | 'INFERRED' | 'UNKNOWN' | 'NOT_AVAILABLE';

export interface TransporterEvidenceRecord {
  compoundName: string;
  transporter: TransporterId;
  status: TransporterEvidenceStatus;
  /** A narrow, literal statement of what is claimed. Empty for UNKNOWN/NOT_AVAILABLE. */
  claim: string;
  /** Real citations only. Non-empty only when status is VERIFIED. */
  evidence: readonly TargetEvidenceRef[];
  /** Always populated for every non-VERIFIED status; states exactly why. */
  statusReason: string;
}

/** A VERIFIED record cannot be constructed without at least one real citation. */
export function verifiedTransporterEvidence(
  compoundName: string,
  transporter: TransporterId,
  claim: string,
  evidence: readonly TargetEvidenceRef[],
): TransporterEvidenceRecord {
  if (evidence.length === 0) {
    throw new Error('VERIFIED transporter evidence requires at least one real citation; use inferredTransporterEvidence or unknownTransporterEvidence instead.');
  }
  return { compoundName, transporter, status: 'VERIFIED', claim, evidence, statusReason: '' };
}

/** Class-level / structural reasoning, not a compound-specific citation. */
export function inferredTransporterEvidence(
  compoundName: string,
  transporter: TransporterId,
  claim: string,
  reason: string,
): TransporterEvidenceRecord {
  return { compoundName, transporter, status: 'INFERRED', claim, evidence: [], statusReason: reason };
}

/** A real, current lack of sufficient evidence — never used to mean "we didn't look". */
export function unknownTransporterEvidence(compoundName: string, transporter: TransporterId, reason: string): TransporterEvidenceRecord {
  return { compoundName, transporter, status: 'UNKNOWN', claim: '', evidence: [], statusReason: reason };
}

/** No source for this data exists or is reachable in this runtime at all. */
export function unavailableTransporterEvidence(compoundName: string, transporter: TransporterId, reason: string): TransporterEvidenceRecord {
  return { compoundName, transporter, status: 'NOT_AVAILABLE', claim: '', evidence: [], statusReason: reason };
}

/**
 * FAIL-CLOSED GUARD: rejects two specific illegitimate jumps the mission
 * names explicitly — binding/affinity read as a functional effect, and an
 * in-vitro result read as a human effect. Executable, not just documented,
 * because both are the single most tempting shortcut this analysis invites.
 */
export function transporterClaimGuard(statement: string): { allowed: boolean; reason: string } {
  const normalised = statement.toLowerCase();

  const impliesBindingMeasurement = /\bbinding\b|\baffinity\b|\bki\b|\bic50\b|\bec50\b|\breuptake inhibit/.test(normalised);
  const impliesFunctionalOrHumanEffect = /\bcauses\b|\bproduces\b|\bin humans\b|\bin people\b|\bclinical(ly)? effect\b|\bpsychoactive effect\b|\busers experience\b|\bbehavioural effect\b/.test(normalised);
  if (impliesBindingMeasurement && impliesFunctionalOrHumanEffect) {
    return {
      allowed: false,
      reason: 'Rejected: this statement infers a functional or human effect directly from a binding/affinity value. A transporter binding or potency measurement is not evidence of a specific behavioural or clinical effect on its own.',
    };
  }

  const impliesInVitroResult = /\bin vitro\b|\bcell line\b|\btransfected\b|\bsynaptosom/.test(normalised);
  const impliesHumanEffect = /\bin humans\b|\bin people\b|\bhuman effect\b|\busers experience\b/.test(normalised);
  if (impliesInVitroResult && impliesHumanEffect) {
    return {
      allowed: false,
      reason: 'Rejected: this statement infers a human effect directly from an in-vitro result. In-vitro transporter data does not establish what happens in vivo or in a human.',
    };
  }

  return { allowed: true, reason: '' };
}
