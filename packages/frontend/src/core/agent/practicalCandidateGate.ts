import { canonicalJson, fnv1a } from '../events/hash';
import type { PracticalCandidate } from './discoveryCampaign';

/**
 * §8 — THE PRACTICAL CANDIDATE GATE, machine-enforced.
 *
 * A `PracticalCandidate` is where Genesis stops describing the world and starts
 * suggesting what someone might DO about it. That is a different kind of claim
 * with a different failure mode: a wrong description is corrected by the next
 * measurement, a wrong suggestion is acted on. Up to now the rules governing
 * that boundary lived in documentation, which means they were advisory — a
 * caller could emit anything and nothing would object.
 *
 * This module is the objection. It is a pure function from a candidate and its
 * evidence to a decision, with every refusal naming the specific criterion that
 * failed. It cannot be satisfied by prose: each check reads a real field.
 *
 * WHAT IT DELIBERATELY IS NOT. It is not an access-control system and does not
 * try to be one — `core/governance/` already holds the capability catalogue,
 * the server-verdict narrowing and the approval workflow with separation of
 * duties, and re-deriving any of that here would create a second policy engine
 * that eventually disagrees with the first. This gate answers only the
 * scientific and safety question "is this candidate fit to leave the research
 * layer at all?", and hands anything consequential to that existing workflow by
 * naming the capability that must be approved.
 *
 * THE SEPARATION THE WHOLE DESIGN RESTS ON:
 *   Government RESEARCH may investigate anything the evidence permits.
 *   Government ACTION requires authorisation.
 *   Policy may limit ACTION. Policy must never alter TRUTH.
 * So a candidate that is uncomfortable, negative, or worst-case is NOT blocked
 * here — suppressing an unwelcome finding would be exactly the corruption this
 * codebase refuses. What is blocked is a candidate that claims more than its
 * evidence carries, or that crosses into individual clinical direction.
 */

export const PRACTICAL_CANDIDATE_GATE_CONTRACT_VERSION = '1.0.0';

export type CandidateClass = 'molecule' | 'material' | 'equation' | 'intervention' | 'strategy' | 'protocol';

/**
 * How far a candidate may travel.
 *  - DESCRIPTIVE: a statement about how something behaves. No action implied.
 *  - POPULATION: an evidence-graded statement about a population. Never an
 *    instruction to or about an individual.
 *  - CLINICAL_BLOCKED: touches individual clinical decision-making. This
 *    system does not emit it, ever, and the value exists so the refusal is a
 *    named state rather than an absence.
 */
export type CandidateSafetyClass = 'DESCRIPTIVE' | 'POPULATION' | 'CLINICAL_BLOCKED';

export interface CandidateEvidence {
  /** Real observation ids behind the candidate. Empty means there is no evidence, whatever the prose says. */
  readonly observationIds: readonly string[];
  /** The campaign fingerprint that produced it — the handle a reader replays. */
  readonly replayFingerprint: string | null;
  /** Where the underlying data came from. Null means unprovenanced. */
  readonly provenance: { readonly sourceUrl: string; readonly sourceVersion: string } | null;
  /** Contradictions the campaign found and did NOT resolve. */
  readonly unresolvedContradictions: readonly string[];
  /** The epistemic status the producing layer assigned. Must be explicit; there is no default. */
  readonly epistemicStatus: string | null;
}

export interface GatedCandidate {
  readonly candidate: PracticalCandidate;
  readonly candidateClass: CandidateClass;
  readonly safetyClass: CandidateSafetyClass;
  /** What this candidate does NOT establish. A candidate with an empty list is refused. */
  readonly notProven: readonly string[];
  readonly handoff: { readonly recipient: 'HUMAN' | 'INSTITUTION'; readonly boundary: string };
  readonly evidence: CandidateEvidence;
}

export type GateOutcome = 'ACTIVATE' | 'REQUIRES_HUMAN_APPROVAL' | 'REFUSE';

export interface GateFailure {
  readonly criterion: string;
  readonly detail: string;
}

export interface GateDecision {
  readonly contractVersion: string;
  readonly outcome: GateOutcome;
  readonly failures: readonly GateFailure[];
  /**
   * When the outcome is REQUIRES_HUMAN_APPROVAL, the capability in
   * `core/governance/capabilities.ts` whose approval workflow must run. This
   * module names it; it does not implement a second one.
   */
  readonly requiresCapability: string | null;
  readonly reason: string;
  readonly fingerprint: string;
}

/** Minimum real observations behind anything that leaves the research layer. */
export const MINIMUM_OBSERVATIONS = 3;

/**
 * Phrases that turn a population-level statement into individual clinical
 * direction. Matched case-insensitively against everything the candidate would
 * emit, because the safety boundary has to hold at the OUTPUT layer — a rule
 * enforced only in a prompt is not enforced at all.
 *
 * This list is not a claim to completeness, and is not the only protection:
 * `safetyClass` must independently be declared, and CLINICAL_BLOCKED is refused
 * outright. It is the backstop that catches a POPULATION candidate whose text
 * has drifted into prescribing.
 */
const CLINICAL_DIRECTIVE_PATTERNS: readonly RegExp[] = [
  /\bprescrib/i,
  /\btake \d+\s*(mg|ml|g|mcg|µg|units?)\b/i,
  /\bdose (for|of) (the )?(patient|you|him|her|them)\b/i,
  /\byour (dose|dosage|prescription|treatment)\b/i,
  /\b(approved|equivalent) (replacement|substitute|therapy)\b/i,
  /\bclinical substitution\b/i,
  /\bstop taking\b/i,
  /\bswitch (the )?patient\b/i,
  /\brecepta\b/i,
  /\bdawka dla (pacjenta|ciebie)\b/i,
];

function candidateText(gated: GatedCandidate): string {
  return [
    gated.candidate.statement,
    gated.candidate.proposedProtocol ?? '',
    gated.candidate.protocolWithheldReason ?? '',
    ...gated.candidate.constraints,
    ...gated.candidate.requiredValidation,
    ...gated.notProven,
    gated.handoff.boundary,
  ].join(' \n ');
}

/**
 * Runs every criterion and returns ALL failures, not the first — a caller
 * fixing one problem at a time learns nothing about the other four.
 *
 * A candidate ACTIVATEs only when every criterion passes AND its consequence is
 * low enough to need no sign-off. An `intervention` or `protocol` always needs
 * a human: those are the two classes that describe something being DONE, and no
 * amount of evidence makes an autonomous system the right thing to authorise
 * them.
 */
export function evaluatePracticalCandidate(gated: GatedCandidate): GateDecision {
  const failures: GateFailure[] = [];
  const evidence = gated.evidence;

  if (evidence.observationIds.length < MINIMUM_OBSERVATIONS) {
    failures.push({
      criterion: 'EVIDENCE_SUFFICIENT',
      detail: `${evidence.observationIds.length} observation(s) behind this candidate; the gate requires at least ${MINIMUM_OBSERVATIONS}. A recommendation resting on fewer is a guess with a citation.`,
    });
  }
  if (evidence.unresolvedContradictions.length > 0) {
    failures.push({
      criterion: 'NO_UNRESOLVED_CRITICAL_CONTRADICTION',
      detail: `${evidence.unresolvedContradictions.length} contradiction(s) remain unresolved: ${evidence.unresolvedContradictions.join('; ')}. A candidate cannot be acted on while the evidence behind it disagrees with itself.`,
    });
  }
  if (evidence.provenance === null || evidence.provenance.sourceUrl.length === 0) {
    failures.push({
      criterion: 'PROVENANCE_EXISTS',
      detail: 'No provenance: the data behind this candidate cannot be traced to a source, so nobody can check it.',
    });
  }
  if (evidence.replayFingerprint === null || evidence.replayFingerprint.length === 0) {
    failures.push({
      criterion: 'REPLAY_EXISTS',
      detail: 'No replay fingerprint: the result cannot be reproduced, so it cannot be audited.',
    });
  }
  if (evidence.epistemicStatus === null || evidence.epistemicStatus.length === 0) {
    failures.push({
      criterion: 'EPISTEMIC_STATUS_EXPLICIT',
      detail: 'Epistemic status is absent. A candidate that does not say how strong its own claim is invites the reader to assume the strongest one.',
    });
  }
  if (gated.notProven.length === 0) {
    failures.push({
      criterion: 'NOT_PROVEN_DECLARED',
      detail: 'The `notProven` list is empty. Every candidate has limits; an empty list means they were not stated, not that they do not exist.',
    });
  }
  if (gated.safetyClass === 'CLINICAL_BLOCKED') {
    failures.push({
      criterion: 'SAFETY_CLASS_PERMITTED',
      detail: 'This candidate is classified CLINICAL_BLOCKED. This system does not emit individual clinical direction, and no authorisation within it changes that.',
    });
  }
  const text = candidateText(gated);
  const matched = CLINICAL_DIRECTIVE_PATTERNS.filter((p) => p.test(text));
  if (matched.length > 0) {
    failures.push({
      criterion: 'NO_CLINICAL_DIRECTIVE_LANGUAGE',
      detail: `The candidate's own text reads as individual clinical direction (matched ${matched.length} pattern(s)). Population-level evidence must not be phrased as an instruction about a person.`,
    });
  }
  if (gated.handoff.recipient !== 'HUMAN' && gated.handoff.recipient !== 'INSTITUTION') {
    failures.push({
      criterion: 'HANDOFF_TO_A_RESPONSIBLE_PARTY',
      detail: 'A candidate must be handed to a human or an institution that can act on it responsibly.',
    });
  }

  const needsApproval = gated.candidateClass === 'intervention' || gated.candidateClass === 'protocol' || gated.safetyClass === 'POPULATION';

  if (failures.length > 0) {
    return decision('REFUSE', failures, null,
      `Refused on ${failures.length} criterion/criteria: ${failures.map((f) => f.criterion).join(', ')}. Government RESEARCH may still examine this freely — what is refused is letting it leave the research layer as a candidate.`,
      gated);
  }
  if (needsApproval) {
    return decision('REQUIRES_HUMAN_APPROVAL', [], 'candidate.activate',
      `Every criterion passes, but a ${gated.candidateClass} candidate at safety class ${gated.safetyClass} describes something being DONE. Activation goes through the existing approval workflow in core/governance, with separation of duties; this module does not authorise it.`,
      gated);
  }
  return decision('ACTIVATE', [], null,
    `Every criterion passes and this ${gated.candidateClass} candidate at safety class ${gated.safetyClass} implies no action, so it may be published as a research result.`,
    gated);
}

function decision(outcome: GateOutcome, failures: readonly GateFailure[], requiresCapability: string | null, reason: string, gated: GatedCandidate): GateDecision {
  return {
    contractVersion: PRACTICAL_CANDIDATE_GATE_CONTRACT_VERSION,
    outcome,
    failures,
    requiresCapability,
    reason,
    fingerprint: fnv1a(canonicalJson({
      outcome,
      failures: failures.map((f) => f.criterion).sort(),
      requiresCapability,
      candidateClass: gated.candidateClass,
      safetyClass: gated.safetyClass,
      derivedFrom: gated.candidate.derivedFromModelFingerprint,
    })),
  };
}

/**
 * The layer a gated candidate may be surfaced in. There is no branch that
 * returns a citizen-facing plane for anything carrying pharmacological or
 * clinical content: those live in Government Research or nowhere.
 */
export function surfaceFor(decisionOutcome: GateOutcome, safetyClass: CandidateSafetyClass): 'GOVERNMENT_RESEARCH' | 'GOVERNMENT_ACTION' | 'NONE' {
  if (decisionOutcome === 'REFUSE') return 'NONE';
  if (safetyClass === 'CLINICAL_BLOCKED') return 'NONE';
  if (decisionOutcome === 'REQUIRES_HUMAN_APPROVAL') return 'GOVERNMENT_ACTION';
  return 'GOVERNMENT_RESEARCH';
}
