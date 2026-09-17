import { computeFingerprint } from '../crypto/fingerprint.js';
import { computePublicKeyId, verifySignature } from '../crypto/signing.js';
import { computeSignedPayloadFingerprint } from './builder.js';
import type { Certificate, Provenance, UnsignedCertificateInput } from './types.js';

/**
 * FIVE VERDICTS — deliberately a different vocabulary from Genesis's
 * replay verdicts (`MATCH`/`DRIFT`/`BLOCKED`/`NOT_REPRODUCIBLE`, see
 * `hypothesisLoop.ts::HypothesisLoopReplayStatus` and friends): this axis
 * answers "is this CERTIFICATE trustworthy", not "did REPLAYING the
 * underlying experiment reproduce the same result" — a certificate can be
 * `INTEGRITY_VALID_SIGNED_VERIFIED` for evidence whose replay is `DRIFT`,
 * and the two questions must never be collapsed into one status.
 */
export type AuditVerdict =
  | 'STRUCTURALLY_INVALID'
  | 'INTEGRITY_INVALID'
  | 'INTEGRITY_VALID_UNSIGNED'
  | 'INTEGRITY_VALID_SIGNED_VERIFIED'
  | 'INTEGRITY_VALID_SIGNED_UNTRUSTED';

export interface AuditResult {
  readonly verdict: AuditVerdict;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Structural validation ONLY — never trusts field values, only that the shape is complete enough to fingerprint/verify at all. */
function validateStructure(cert: Certificate): string[] {
  const errors: string[] = [];
  if (!cert.certId) errors.push('certId is required');
  if (!cert.issuedAt) errors.push('issuedAt is required');
  if (!cert.issuer) errors.push('issuer is required');
  if (!isRecord(cert.claim)) errors.push('claim is required');
  else {
    if (!cert.claim.claimId) errors.push('claim.claimId is required');
    if (!cert.claim.statement) errors.push('claim.statement is required');
    if (!cert.claim.domain) errors.push('claim.domain is required');
  }
  if (!isRecord(cert.evidence)) errors.push('evidence is required');
  else if (!cert.evidence.evidenceUri) errors.push('evidence.evidenceUri is required');
  if (!isRecord(cert.integrity)) {
    errors.push('integrity is required');
  } else {
    if (cert.integrity.hashAlgorithm !== 'SHA-256') errors.push('integrity.hashAlgorithm must be SHA-256');
    if (!cert.integrity.claimFingerprint) errors.push('integrity.claimFingerprint is required');
    if (!cert.integrity.evidenceFingerprint) errors.push('integrity.evidenceFingerprint is required');
    if (!cert.integrity.provenanceFingerprint) errors.push('integrity.provenanceFingerprint is required');
    if (!cert.integrity.signedPayloadFingerprint) errors.push('integrity.signedPayloadFingerprint is required');
  }
  if (!isRecord(cert.provenance)) {
    errors.push('provenance is required');
  } else if (!Array.isArray(cert.provenance.provenanceTrail)) {
    errors.push('provenance.provenanceTrail must be an array');
  } else {
    cert.provenance.provenanceTrail.forEach((step, index) => {
      if (typeof step.step !== 'number') errors.push(`provenance.provenanceTrail[${index}].step must be a number`);
      if (!step.action) errors.push(`provenance.provenanceTrail[${index}].action is required`);
      if (!step.inputFingerprint) errors.push(`provenance.provenanceTrail[${index}].inputFingerprint is required`);
      if (!step.outputFingerprint) errors.push(`provenance.provenanceTrail[${index}].outputFingerprint is required`);
      if (!step.timestamp) errors.push(`provenance.provenanceTrail[${index}].timestamp is required`);
    });
  }
  if (cert.signature !== null) {
    if (!isRecord(cert.signature)) {
      errors.push('signature must be an object or null');
    } else {
      if (cert.signature.algorithm !== 'ECDSA-P256-SHA256') errors.push('signature.algorithm must be ECDSA-P256-SHA256');
      if (!cert.signature.publicKey) errors.push('signature.publicKey is required when signature is present');
      if (!cert.signature.signatureValue) errors.push('signature.signatureValue is required when signature is present');
      if (!cert.signature.signedAt) errors.push('signature.signedAt is required when signature is present');
    }
  }
  return errors;
}

/** Recomputes every fingerprint from the certificate's OWN claim/evidence/provenance and compares — catches a tampered field even before any cryptography runs. */
async function verifyHashIntegrity(cert: Certificate): Promise<string[]> {
  const errors: string[] = [];
  const claimFingerprint = await computeFingerprint(cert.claim);
  if (claimFingerprint !== cert.integrity.claimFingerprint) {
    errors.push(`claimFingerprint mismatch: expected ${cert.integrity.claimFingerprint}, recomputed ${claimFingerprint}`);
  }
  const evidenceFingerprint = await computeFingerprint(cert.evidence);
  if (evidenceFingerprint !== cert.integrity.evidenceFingerprint) {
    errors.push(`evidenceFingerprint mismatch: expected ${cert.integrity.evidenceFingerprint}, recomputed ${evidenceFingerprint}`);
  }
  const provenanceFingerprint = await computeFingerprint(cert.provenance);
  if (provenanceFingerprint !== cert.integrity.provenanceFingerprint) {
    errors.push(`provenanceFingerprint mismatch: expected ${cert.integrity.provenanceFingerprint}, recomputed ${provenanceFingerprint}`);
  }
  const unsignedInput: UnsignedCertificateInput = {
    certId: cert.certId, issuedAt: cert.issuedAt, issuer: cert.issuer,
    claim: cert.claim, evidence: cert.evidence, provenance: cert.provenance,
  };
  const signedPayloadFingerprint = await computeSignedPayloadFingerprint(unsignedInput);
  if (signedPayloadFingerprint !== cert.integrity.signedPayloadFingerprint) {
    errors.push(`signedPayloadFingerprint mismatch: expected ${cert.integrity.signedPayloadFingerprint}, recomputed ${signedPayloadFingerprint}`);
  }
  return errors;
}

/** Every step's `outputFingerprint` must feed the next step's `inputFingerprint`, in strictly increasing `step` order — a broken chain is a real integrity finding, not cosmetic. */
function verifyProvenanceChain(provenance: Provenance): string[] {
  const errors: string[] = [];
  const trail = provenance.provenanceTrail;
  for (let i = 1; i < trail.length; i++) {
    const previous = trail[i - 1]!;
    const current = trail[i]!;
    if (current.step <= previous.step) {
      errors.push(`provenance.provenanceTrail[${i}].step (${current.step}) is not greater than the previous step (${previous.step})`);
    }
    if (current.inputFingerprint !== previous.outputFingerprint) {
      errors.push(`provenance chain broken at step ${current.step}: inputFingerprint (${current.inputFingerprint}) does not match the previous step's outputFingerprint (${previous.outputFingerprint})`);
    }
  }
  return errors;
}

/**
 * Audits one certificate. `trustedPublicKeys` holds canonical key ids (see
 * `crypto/signing.ts::computePublicKeyId` — deliberately NOT the raw JWK
 * string embedded in `Signature.publicKey`, since two genuine exports of the
 * same key are not guaranteed to serialize to the same string) this auditor
 * is willing to call `INTEGRITY_VALID_SIGNED_VERIFIED` rather than merely
 * `..._SIGNED_UNTRUSTED` — cryptographic validity and trust are always
 * checked as two SEPARATE questions, never conflated.
 */
export async function auditCertificate(certificate: Certificate, trustedPublicKeys: ReadonlySet<string> = new Set()): Promise<AuditResult> {
  const structuralErrors = validateStructure(certificate);
  if (structuralErrors.length > 0) return { verdict: 'STRUCTURALLY_INVALID', errors: structuralErrors, warnings: [] };

  const integrityErrors = [...(await verifyHashIntegrity(certificate)), ...verifyProvenanceChain(certificate.provenance)];
  if (integrityErrors.length > 0) return { verdict: 'INTEGRITY_INVALID', errors: integrityErrors, warnings: [] };

  if (certificate.signature === null) return { verdict: 'INTEGRITY_VALID_UNSIGNED', errors: [], warnings: [] };

  let publicKeyJwk: JsonWebKey;
  try {
    publicKeyJwk = JSON.parse(certificate.signature.publicKey) as JsonWebKey;
  } catch {
    return { verdict: 'INTEGRITY_INVALID', errors: ['signature.publicKey is not valid JSON'], warnings: [] };
  }

  const cryptographicallyValid = await verifySignature(certificate.signature.signatureValue, certificate.integrity.signedPayloadFingerprint, publicKeyJwk);
  if (!cryptographicallyValid) {
    return { verdict: 'INTEGRITY_INVALID', errors: ['ECDSA-P256-SHA256 signature verification failed'], warnings: [] };
  }

  const keyId = await computePublicKeyId(publicKeyJwk);
  if (trustedPublicKeys.has(keyId)) {
    return { verdict: 'INTEGRITY_VALID_SIGNED_VERIFIED', errors: [], warnings: [] };
  }
  return { verdict: 'INTEGRITY_VALID_SIGNED_UNTRUSTED', errors: [], warnings: ['signature is cryptographically valid, but the signing public key is not in the trust store'] };
}
