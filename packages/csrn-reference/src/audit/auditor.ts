import type { Certificate, Provenance, UnsignedCertificateInput } from '../cert/builder.js';
import { computeFingerprint } from '../cert/fingerprint.js';
import { computeSignedPayloadFingerprint } from '../cert/builder.js';
import { verifySignature, publicKeyId, SIGNATURE_ALGORITHM, type JsonWebKey } from '../crypto/signing.js';

/**
 * AUDITOR — depends only on `../cert/*` and `../crypto/signing.ts`, never on
 * `federation/*`. A federation instance is a CONSUMER of this module (it
 * calls `auditCertificate` on a certificate it received), not something
 * this module routes through — keeping the dependency arrow one-directional
 * (crypto/cert -> audit -> [used by] federation) is what makes this auditor
 * reusable outside any particular federation simulation.
 */

export const AUDITOR_VERDICTS = [
  'INTEGRITY_VALID_UNSIGNED',
  'INTEGRITY_VALID_SIGNED_VERIFIED',
  'INTEGRITY_VALID_SIGNED_UNTRUSTED',
  'INTEGRITY_INVALID',
  'STRUCTURALLY_INVALID',
] as const;
export type AuditorVerdict = (typeof AUDITOR_VERDICTS)[number];

export interface AuditResult {
  readonly verdict: AuditorVerdict;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

function isJsonWebKeyShaped(value: unknown): value is JsonWebKey {
  return (
    typeof value === 'object' && value !== null &&
    'kty' in value && (value as JsonWebKey).kty === 'EC' &&
    'crv' in value && (value as JsonWebKey).crv === 'P-256' &&
    typeof (value as JsonWebKey).x === 'string' && typeof (value as JsonWebKey).y === 'string'
  );
}

function validateStructure(cert: Certificate): string[] {
  const errors: string[] = [];
  if (!cert.certId) errors.push('certId is required');
  if (!cert.issuedAt) errors.push('issuedAt is required');
  if (!cert.issuer) errors.push('issuer is required');

  if (!cert.claim) {
    errors.push('claim is required');
  } else {
    if (!cert.claim.claimId) errors.push('claim.claimId is required');
    if (!cert.claim.statement) errors.push('claim.statement is required');
    if (!cert.claim.domain) errors.push('claim.domain is required');
  }

  if (!cert.evidence) {
    errors.push('evidence is required');
  } else {
    if (!cert.evidence.evidencePackId) errors.push('evidence.evidencePackId is required');
    if (!cert.evidence.evidenceChainId) errors.push('evidence.evidenceChainId is required');
    if (!cert.evidence.evidenceUri) errors.push('evidence.evidenceUri is required');
  }

  if (!cert.integrity) {
    errors.push('integrity is required');
  } else {
    if (!cert.integrity.hashAlgorithm) errors.push('integrity.hashAlgorithm is required');
    if (!cert.integrity.claimFingerprint) errors.push('integrity.claimFingerprint is required');
    if (!cert.integrity.evidenceFingerprint) errors.push('integrity.evidenceFingerprint is required');
    if (!cert.integrity.provenanceFingerprint) errors.push('integrity.provenanceFingerprint is required');
    if (!cert.integrity.signedPayloadFingerprint) errors.push('integrity.signedPayloadFingerprint is required');
  }

  if (!cert.provenance) {
    errors.push('provenance is required');
  } else if (!Array.isArray(cert.provenance.provenanceTrail)) {
    errors.push('provenance.provenanceTrail must be an array');
  } else {
    cert.provenance.provenanceTrail.forEach((step, i) => {
      if (typeof step.step !== 'number') errors.push(`provenance.provenanceTrail[${i}].step must be a number`);
      if (!step.action) errors.push(`provenance.provenanceTrail[${i}].action is required`);
      if (!step.inputFingerprint) errors.push(`provenance.provenanceTrail[${i}].inputFingerprint is required`);
      if (!step.outputFingerprint) errors.push(`provenance.provenanceTrail[${i}].outputFingerprint is required`);
      if (!step.timestamp) errors.push(`provenance.provenanceTrail[${i}].timestamp is required`);
    });
  }

  if (cert.signature !== null && cert.signature !== undefined) {
    if (cert.signature.algorithm !== SIGNATURE_ALGORITHM) errors.push(`signature.algorithm must be ${SIGNATURE_ALGORITHM}`);
    if (!isJsonWebKeyShaped(cert.signature.publicKey)) errors.push('signature.publicKey must be an EC P-256 JWK (kty, crv, x, y)');
    if (!cert.signature.signatureValue) errors.push('signature.signatureValue is required when signature is present');
    if (!cert.signature.signedAt) errors.push('signature.signedAt is required when signature is present');
  }

  return errors;
}

async function verifyHashIntegrity(cert: Certificate): Promise<string[]> {
  const errors: string[] = [];

  const claimFp = await computeFingerprint(cert.claim);
  if (claimFp !== cert.integrity.claimFingerprint) {
    errors.push(`claimFingerprint mismatch: expected ${cert.integrity.claimFingerprint}, got ${claimFp}`);
  }
  const evidenceFp = await computeFingerprint(cert.evidence);
  if (evidenceFp !== cert.integrity.evidenceFingerprint) {
    errors.push(`evidenceFingerprint mismatch: expected ${cert.integrity.evidenceFingerprint}, got ${evidenceFp}`);
  }
  const provenanceFp = await computeFingerprint(cert.provenance);
  if (provenanceFp !== cert.integrity.provenanceFingerprint) {
    errors.push(`provenanceFingerprint mismatch: expected ${cert.integrity.provenanceFingerprint}, got ${provenanceFp}`);
  }

  const unsignedInput: UnsignedCertificateInput = {
    certId: cert.certId,
    issuedAt: cert.issuedAt,
    issuer: cert.issuer,
    claim: cert.claim,
    evidence: cert.evidence,
    provenance: cert.provenance,
  };
  const expectedSignedPayloadFp = await computeSignedPayloadFingerprint(unsignedInput);
  if (expectedSignedPayloadFp !== cert.integrity.signedPayloadFingerprint) {
    errors.push(`signedPayloadFingerprint mismatch: expected ${cert.integrity.signedPayloadFingerprint}, got ${expectedSignedPayloadFp}`);
  }

  return errors;
}

function verifyProvenanceChain(provenance: Provenance): string[] {
  const errors: string[] = [];
  const trail = provenance.provenanceTrail;
  for (let i = 0; i < trail.length - 1; i++) {
    if (trail[i]!.outputFingerprint !== trail[i + 1]!.inputFingerprint) {
      errors.push(`provenance chain broken at step ${i + 1}: output ${trail[i]!.outputFingerprint} !== input ${trail[i + 1]!.inputFingerprint}`);
    }
  }
  for (let i = 1; i < trail.length; i++) {
    if (trail[i]!.step <= trail[i - 1]!.step) {
      errors.push(`provenance step numbers not monotonically increasing at index ${i}`);
    }
  }
  return errors;
}

/**
 * Audits one certificate. `trustedPublicKeys` holds `publicKeyId(jwk)`
 * strings (`crypto/signing.ts`) — cryptographic validity and trust are
 * checked as two SEPARATE questions (step 4 vs step 5): a signature can be
 * cryptographically perfect and still be from a signer nobody has agreed to
 * trust, and that is a different, weaker verdict than a signature that does
 * not verify at all.
 */
export async function auditCertificate(
  cert: Certificate,
  trustedPublicKeys: ReadonlySet<string> = new Set(),
): Promise<AuditResult> {
  // Step 1: structural validity — nothing below this line runs on a malformed shape.
  const structuralErrors = validateStructure(cert);
  if (structuralErrors.length > 0) return { verdict: 'STRUCTURALLY_INVALID', errors: structuralErrors, warnings: [] };

  // Step 2: content + signed-payload hash integrity.
  const integrityErrors = await verifyHashIntegrity(cert);
  if (integrityErrors.length > 0) return { verdict: 'INTEGRITY_INVALID', errors: integrityErrors, warnings: [] };

  // Step 3: provenance chain continuity.
  const provenanceErrors = verifyProvenanceChain(cert.provenance);
  if (provenanceErrors.length > 0) return { verdict: 'INTEGRITY_INVALID', errors: provenanceErrors, warnings: [] };

  // Step 4: no signature at all — the honest ceiling for an unsigned certificate.
  if (cert.signature === null) return { verdict: 'INTEGRITY_VALID_UNSIGNED', errors: [], warnings: [] };

  // Step 5: real ECDSA verification against the ALREADY-VALIDATED signedPayloadFingerprint.
  const cryptoValid = await verifySignature(cert.signature.signatureValue, cert.integrity.signedPayloadFingerprint, cert.signature.publicKey);
  if (!cryptoValid) return { verdict: 'INTEGRITY_INVALID', errors: ['ECDSA signature verification failed'], warnings: [] };

  // Step 6: trust is orthogonal to cryptographic validity — checked only once crypto has already passed.
  const trusted = trustedPublicKeys.has(publicKeyId(cert.signature.publicKey));
  if (trusted) return { verdict: 'INTEGRITY_VALID_SIGNED_VERIFIED', errors: [], warnings: [] };
  return { verdict: 'INTEGRITY_VALID_SIGNED_UNTRUSTED', errors: [], warnings: ['ECDSA signature is cryptographically valid, but the signing public key is not in the trusted set.'] };
}
