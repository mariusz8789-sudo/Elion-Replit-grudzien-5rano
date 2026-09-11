import { computeFingerprint } from '../crypto/fingerprint.js';
import type { Certificate, Integrity, Signature, UnsignedCertificateInput } from './types.js';

/**
 * THE SIGNED-PAYLOAD CONTRACT — fixes the v2 bug this module exists to
 * close: v2 computed `certificateFingerprint` over the UNSIGNED certificate,
 * signed THAT, then built a NEW certificate carrying the signature — which
 * has a DIFFERENT fingerprint than the one that was actually signed. The
 * signature protected a certificate that no longer existed by the time
 * anyone looked at it.
 *
 * The fix: there are two fingerprints, named for what they actually are,
 * and neither is ambiguous about which certificate state it describes:
 *
 *   - `signedPayloadFingerprint` — SHA-256 of EXACTLY the fields ECDSA signs
 *     (`certId`, `issuedAt`, `issuer`, `claim`, `evidence`, `provenance`,
 *     and the sub-fingerprints in `integrity` EXCLUDING itself and
 *     EXCLUDING `signature`). Computed ONCE, before signing, and NEVER
 *     recomputed differently afterward — signing does not change it, so
 *     there is no circular dependency to worry about (proven by
 *     `builder.test.ts`).
 *   - `certificateFingerprint` — SHA-256 of the FULL certificate, signature
 *     included. Used only for storage/identification (e.g. as a Science
 *     Memory record key); it is NEVER an input to signing or verification.
 *
 * The auditor (`auditor.ts`) recomputes `signedPayloadFingerprint` from the
 * certificate's own claim/evidence/provenance and checks it against the
 * stored one BEFORE checking the cryptographic signature — so a tampered
 * claim/evidence/provenance is caught by fingerprint mismatch even before
 * ECDSA verification runs.
 */
export async function computeSignedPayloadFingerprint(input: UnsignedCertificateInput): Promise<string> {
  const claimFingerprint = await computeFingerprint(input.claim);
  const evidenceFingerprint = await computeFingerprint(input.evidence);
  const provenanceFingerprint = await computeFingerprint(input.provenance);
  return computeFingerprint({
    certId: input.certId,
    issuedAt: input.issuedAt,
    issuer: input.issuer,
    claim: input.claim,
    evidence: input.evidence,
    provenance: input.provenance,
    integrity: { hashAlgorithm: 'SHA-256', claimFingerprint, evidenceFingerprint, provenanceFingerprint },
  });
}

/** The certificate before signing — already carries a complete `Integrity`, including `signedPayloadFingerprint`, so signing never changes `integrity`. */
export async function buildUnsignedCertificate(input: UnsignedCertificateInput): Promise<Omit<Certificate, 'signature'>> {
  const claimFingerprint = await computeFingerprint(input.claim);
  const evidenceFingerprint = await computeFingerprint(input.evidence);
  const provenanceFingerprint = await computeFingerprint(input.provenance);
  const signedPayloadFingerprint = await computeSignedPayloadFingerprint(input);
  const integrity: Integrity = { hashAlgorithm: 'SHA-256', claimFingerprint, evidenceFingerprint, provenanceFingerprint, signedPayloadFingerprint };
  return {
    certId: input.certId,
    issuedAt: input.issuedAt,
    issuer: input.issuer,
    claim: input.claim,
    evidence: input.evidence,
    provenance: input.provenance,
    integrity,
  };
}

/** Attaches (or withholds) a signature. `integrity` — `signedPayloadFingerprint` included — is untouched by this step, by construction. */
export async function buildCertificate(input: UnsignedCertificateInput, signature: Signature | null = null): Promise<Certificate> {
  const unsigned = await buildUnsignedCertificate(input);
  return { ...unsigned, signature };
}

/** Fingerprint of the FULL certificate (signature included) — storage/identification only. See file header: never used for signing or verification. */
export async function computeCertificateFingerprint(certificate: Certificate): Promise<string> {
  return computeFingerprint(certificate);
}
