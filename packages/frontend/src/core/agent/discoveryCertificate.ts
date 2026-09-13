import { canonicalJson, fnv1a } from '../events/hash';
import type { DiscoveryRecord, ExternalValidationStatus } from './discoveryContracts';
import { computeProofLadder, renderTieredStatus, assertTieredStatusText, type ProofLadderInput, type ProofLadderResult } from './proofLadder';
import { classifyCausalLevel, type CausalGateInput, type CausalLevel } from './causalLadder';
import type { RegisteredPrediction } from './predictionRegistry';

/**
 * GenesisDiscoveryCertificate v2 (Phase G).
 *
 * WHAT ALREADY EXISTED (confirmed by audit — NOT rebuilt): `packages/csrn`
 * has its own generic `Certificate` (claim+evidence+provenance+integrity+
 * signature) for the federation/exchange protocol, and
 * `core/csrn/genesisCertificateAdapter.ts` repackages a `SavedExperiment`
 * into that shape. Neither computes novelty/replication/causal/tier fields —
 * they are evidence-envelope/signature concerns, a different job. This is a
 * THIRD, purpose-built certificate for exactly one thing: stating a
 * discovery's proof position in one place, honestly, and refusing to let
 * that position be asserted rather than computed.
 *
 * COMPOSES, DOES NOT RECOMPUTE. Every field here is read from an existing
 * source — `computeProofLadder` (this session), `classifyCausalLevel` (this
 * session), the `DiscoveryRecord` itself (Phase F), and `RegisteredPrediction`
 * entries (this session). Nothing in this file fits a model, checks novelty,
 * or runs a replication a second time.
 *
 * THE INVARIANT THE WHOLE FILE SERVES: `printCertificate` is the only prose
 * this module emits, and it is built EXCLUSIVELY from the certificate's own
 * fields — no string here is not traceable to a field. `renderedStatus`
 * (from `renderTieredStatus`) is the only place the word "DISCOVERY" can
 * appear in printed output, and it never appears without its tier and level.
 *
 * APPEND-ONLY. `issueCertificate` is the only constructor. There is no
 * "update status" function — a certificate cannot be edited. A later,
 * different assessment of the same discovery is `issueCertificate`d again
 * with `supersedes` pointing at the earlier certificate's id; the earlier
 * one is never mutated or deleted. This is how a `REFUTED` audit downgrades
 * a claim: a NEW certificate, chained to the old one, carries the lower
 * tier — the original stays exactly as issued, for anyone to compare.
 */

export const DISCOVERY_CERTIFICATE_CONTRACT_VERSION = '2.0.0';

export interface CertificatePredictionSummary {
  readonly predictionId: string;
  readonly claim: string;
}

export interface IssueCertificateInput {
  readonly record: DiscoveryRecord;
  readonly researchQuestion: string;
  readonly ladderInput: Omit<ProofLadderInput, 'record'>;
  readonly causalInput: CausalGateInput | null;
  readonly predictions: readonly RegisteredPrediction[];
  /** Never empty — see `assertWhatWouldChangeVerdictDeclared`. */
  readonly whatWouldChangeVerdict: readonly string[];
  readonly issuedAt: number;
  /** The certificateId of the certificate this one supersedes, if any. `null` for a first issuance. */
  readonly supersedes: string | null;
}

export interface GenesisDiscoveryCertificate {
  readonly contractVersion: string;
  readonly certificateId: string;
  readonly discoveryRecordId: string;
  readonly researchQuestion: string;
  readonly ladder: ProofLadderResult;
  readonly renderedStatus: string;
  readonly causalLevel: CausalLevel | 'NOT_ASSESSED';
  readonly causalReasons: readonly string[];
  readonly predictions: readonly CertificatePredictionSummary[];
  readonly noveltyLimitations: readonly string[];
  readonly externalValidation: ExternalValidationStatus;
  readonly whatWouldChangeVerdict: readonly string[];
  readonly supersedes: string | null;
  readonly issuedAt: number;
  readonly fingerprint: string;
}

export class CertificateContractViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CertificateContractViolationError';
  }
}

export function issueCertificate(input: IssueCertificateInput): GenesisDiscoveryCertificate {
  if (input.researchQuestion.trim() === '') {
    throw new CertificateContractViolationError('discoveryCertificate: researchQuestion is empty — a certificate must state what question it answers.');
  }
  if (input.whatWouldChangeVerdict.length === 0) {
    throw new CertificateContractViolationError('discoveryCertificate: whatWouldChangeVerdict is empty — every certificate must state what evidence would overturn it, or it is not falsifiable.');
  }

  const ladder = computeProofLadder({ record: input.record, ...input.ladderInput });
  const causal = input.causalInput === null ? null : classifyCausalLevel(input.causalInput);

  const core = {
    contractVersion: DISCOVERY_CERTIFICATE_CONTRACT_VERSION,
    discoveryRecordId: input.record.recordId,
    researchQuestion: input.researchQuestion,
    ladder,
    causalLevel: causal === null ? 'NOT_ASSESSED' as const : causal.level,
    causalReasons: causal === null ? [] : causal.reasons,
    predictions: input.predictions.map((p) => ({ predictionId: p.predictionId, claim: p.claim })),
    noveltyLimitations: input.record.noveltyEvidence.limitations,
    externalValidation: input.record.externalValidation,
    whatWouldChangeVerdict: input.whatWouldChangeVerdict,
    supersedes: input.supersedes,
  };
  const fingerprint = fnv1a(canonicalJson(core));

  return {
    ...core,
    certificateId: `genesis-cert:${fingerprint}`,
    renderedStatus: renderTieredStatus(ladder),
    issuedAt: input.issuedAt,
    fingerprint,
  };
}

/**
 * Prose built ONLY from `cert`'s own fields — every line traces to a named
 * field, never a string invented here. The one exception (fixed section
 * labels like "RESEARCH QUESTION:") is structural formatting, not content.
 */
export function printCertificate(cert: GenesisDiscoveryCertificate): string {
  const lines: string[] = [];
  lines.push(`GENESIS DISCOVERY CERTIFICATE (v${cert.contractVersion})`);
  lines.push(`Certificate: ${cert.certificateId}`);
  if (cert.supersedes !== null) lines.push(`Supersedes: ${cert.supersedes}`);
  lines.push('');
  lines.push(`RESEARCH QUESTION: ${cert.researchQuestion}`);
  lines.push(`STATUS: ${cert.renderedStatus}`);
  lines.push('');
  lines.push('GATE RESULTS:');
  for (const level of Object.keys(cert.ladder.gateResults) as (keyof typeof cert.ladder.gateResults)[]) {
    lines.push(`  ${level}: ${cert.ladder.gateResults[level]}`);
  }
  lines.push('');
  lines.push(`CAUSAL LEVEL: ${cert.causalLevel}`);
  for (const reason of cert.causalReasons) lines.push(`  - ${reason}`);
  lines.push('');
  lines.push(`EXTERNAL VALIDATION: ${cert.externalValidation}`);
  lines.push('');
  lines.push(`REGISTERED PREDICTIONS (${cert.predictions.length}):`);
  for (const p of cert.predictions) lines.push(`  - ${p.predictionId}: ${p.claim}`);
  lines.push('');
  lines.push('NOVELTY SEARCH LIMITATIONS (what this does NOT establish):');
  for (const limitation of cert.noveltyLimitations) lines.push(`  - ${limitation}`);
  lines.push('');
  lines.push('WHAT WOULD CHANGE THIS VERDICT:');
  for (const item of cert.whatWouldChangeVerdict) lines.push(`  - ${item}`);
  lines.push('');
  lines.push(`Issued: ${cert.issuedAt} | Fingerprint: ${cert.fingerprint}`);
  const text = lines.join('\n');
  // The guard runs on the finished text, not on the fields, so a bare status
  // reaching a reader through ANY of these lines is caught here rather than
  // trusted not to happen.
  assertTieredStatusText(text, 'printCertificate');
  return text;
}
