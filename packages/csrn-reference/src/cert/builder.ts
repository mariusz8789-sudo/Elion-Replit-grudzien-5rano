import { computeFingerprint } from './fingerprint.js';
import type { SignatureAlgorithm, JsonWebKey } from '../crypto/signing.js';

/**
 * CSRN CERTIFICATE — signature semantics.
 *
 * TWO DIFFERENT FINGERPRINTS, NEVER CONFUSED:
 *
 *   `integrity.signedPayloadFingerprint` — the fingerprint of EXACTLY what
 *   ECDSA signs: certId/issuedAt/issuer/claim/evidence/provenance plus the
 *   three CONTENT fingerprints (claim/evidence/provenance), and NOTHING
 *   ELSE. Critically, it never includes the signature itself, and it never
 *   includes itself — `buildSignedPayload` below is called BEFORE this
 *   fingerprint exists, so there is no way to construct a circular
 *   dependency between "what is signed" and "the fingerprint of what is
 *   signed".
 *
 *   `computeCertificateFingerprint(cert)` — the fingerprint of the WHOLE,
 *   possibly-signed certificate (signature included). Used only for
 *   identification/storage (e.g. a lookup key in a federation store) —
 *   NEVER for signing, and never compared against `signedPayloadFingerprint`.
 *
 * Building is a two-step, one-way pipeline: `buildUnsignedCertificate`
 * produces a `Certificate` with `signature: null` and every content/payload
 * fingerprint already computed; `attachSignature` only ever adds a
 * `signature` field via a plain spread, so it is structurally impossible for
 * attaching a signature to change any fingerprint that was already computed.
 */

export interface Claim {
  readonly claimId: string;
  readonly statement: string;
  readonly domain: string;
  readonly hypothesisId?: string | null;
  readonly predictionSourceExperimentId?: string | null;
}

export interface Evidence {
  readonly evidencePackId: string;
  readonly evidenceChainId: string;
  readonly evidenceUri: string;
  readonly replayCapsuleId?: string | null;
  readonly replayUri?: string | null;
}

export interface ProvenanceStep {
  readonly step: number;
  readonly action: string;
  readonly inputFingerprint: string;
  readonly outputFingerprint: string;
  readonly timestamp: string;
}

export interface Provenance {
  readonly provenanceTrail: readonly ProvenanceStep[];
  readonly previousCycleId?: string | null;
  readonly previousCycleFingerprint?: string | null;
  readonly resolvedFrom?: string | null;
}

export interface Integrity {
  readonly hashAlgorithm: string;
  readonly claimFingerprint: string;
  readonly evidenceFingerprint: string;
  readonly provenanceFingerprint: string;
  /** Fingerprint of exactly the payload ECDSA signs — see the module doc. */
  readonly signedPayloadFingerprint: string;
}

export interface Signature {
  readonly algorithm: SignatureAlgorithm;
  /** JWK object, not a stringified/opaque encoding — explicit and self-describing. */
  readonly publicKey: JsonWebKey;
  readonly signatureValue: string; // hex-encoded
  readonly signedAt: string;
}

export interface Certificate {
  readonly certId: string;
  readonly issuedAt: string;
  readonly issuer: string;
  readonly claim: Claim;
  readonly evidence: Evidence;
  readonly provenance: Provenance;
  readonly integrity: Integrity;
  readonly signature: Signature | null;
}

export interface UnsignedCertificateInput {
  readonly certId: string;
  readonly issuedAt: string;
  readonly issuer: string;
  readonly claim: Claim;
  readonly evidence: Evidence;
  readonly provenance: Provenance;
}

const HASH_ALGORITHM = 'SHA-256';

/** The exact object ECDSA signs. Never exported: nothing outside this module needs to construct one independently — `computeSignedPayloadFingerprint` and the auditor both call this same function. */
function buildSignedPayload(
  input: UnsignedCertificateInput,
  claimFingerprint: string,
  evidenceFingerprint: string,
  provenanceFingerprint: string,
) {
  return {
    certId: input.certId,
    issuedAt: input.issuedAt,
    issuer: input.issuer,
    claim: input.claim,
    evidence: input.evidence,
    provenance: input.provenance,
    integrity: { hashAlgorithm: HASH_ALGORITHM, claimFingerprint, evidenceFingerprint, provenanceFingerprint },
  };
}

async function computeContentFingerprints(input: UnsignedCertificateInput) {
  const [claimFingerprint, evidenceFingerprint, provenanceFingerprint] = await Promise.all([
    computeFingerprint(input.claim),
    computeFingerprint(input.evidence),
    computeFingerprint(input.provenance),
  ]);
  return { claimFingerprint, evidenceFingerprint, provenanceFingerprint };
}

/** The fingerprint an auditor must re-derive to check `integrity.signedPayloadFingerprint` — exposed so the auditor never has to reconstruct `buildSignedPayload`'s shape itself. */
export async function computeSignedPayloadFingerprint(input: UnsignedCertificateInput): Promise<string> {
  const { claimFingerprint, evidenceFingerprint, provenanceFingerprint } = await computeContentFingerprints(input);
  return computeFingerprint(buildSignedPayload(input, claimFingerprint, evidenceFingerprint, provenanceFingerprint));
}

/** Builds an unsigned certificate: every fingerprint computed, `signature: null`. Sign what this returns with `crypto/signing.ts::signPayload(cert.integrity.signedPayloadFingerprint, privateKeyJwk)`, then call `attachSignature`. */
export async function buildUnsignedCertificate(input: UnsignedCertificateInput): Promise<Certificate> {
  const { claimFingerprint, evidenceFingerprint, provenanceFingerprint } = await computeContentFingerprints(input);
  const signedPayloadFingerprint = await computeFingerprint(
    buildSignedPayload(input, claimFingerprint, evidenceFingerprint, provenanceFingerprint),
  );
  return {
    certId: input.certId,
    issuedAt: input.issuedAt,
    issuer: input.issuer,
    claim: input.claim,
    evidence: input.evidence,
    provenance: input.provenance,
    integrity: { hashAlgorithm: HASH_ALGORITHM, claimFingerprint, evidenceFingerprint, provenanceFingerprint, signedPayloadFingerprint },
    signature: null,
  };
}

/** Attaches a signature to an already-built certificate. A plain spread — cannot touch `integrity`, so it cannot retroactively change the fingerprint the signature was computed over. */
export function attachSignature(unsigned: Certificate, signature: Signature): Certificate {
  return { ...unsigned, signature };
}

/** Fingerprint of the WHOLE certificate (signature included) — identification/storage key only. Never used for signing and never compared against `signedPayloadFingerprint`. */
export async function computeCertificateFingerprint(cert: Certificate): Promise<string> {
  return computeFingerprint(cert);
}
