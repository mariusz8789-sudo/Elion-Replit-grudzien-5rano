import { describe, expect, it } from 'vitest';
import { auditCertificate } from '../src/cert/auditor.js';
import { buildCertificate } from '../src/cert/builder.js';
import { generateKeyPair, publicKeyToString, signFingerprint } from '../src/crypto/signing.js';
import type { Certificate, UnsignedCertificateInput } from '../src/cert/types.js';

const baseInput: UnsignedCertificateInput = {
  certId: 'cert-001', issuedAt: '2026-09-15T14:32:00Z', issuer: 'genesis-local',
  claim: { claimId: 'claim-001', statement: 'ISOLATION minimizes totalDeaths', domain: 'biology' },
  evidence: { evidencePackId: 'pack-001', evidenceChainId: 'chain-001', evidenceUri: 'evidence://pack-001/chain-001' },
  provenance: {
    provenanceTrail: [
      { step: 1, action: 'discovery-loop-cycle-1', inputFingerprint: 'a'.repeat(64), outputFingerprint: 'b'.repeat(64), timestamp: '2026-09-15T14:29:00Z' },
      { step: 2, action: 'discovery-loop-cycle-2', inputFingerprint: 'b'.repeat(64), outputFingerprint: 'c'.repeat(64), timestamp: '2026-09-15T14:30:00Z' },
    ],
  },
};

async function signedCertificate(): Promise<{ cert: Certificate; publicKey: string }> {
  const unsigned = await buildCertificate(baseInput);
  const keys = await generateKeyPair();
  const publicKey = publicKeyToString(keys.publicKeyJwk);
  const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
  const cert = await buildCertificate(baseInput, { algorithm: 'ECDSA-P256-SHA256', publicKey, signatureValue, signedAt: baseInput.issuedAt });
  return { cert, publicKey };
}

describe('auditCertificate — the five verdicts', () => {
  it('STRUCTURALLY_INVALID: a required field is missing', async () => {
    const cert = await buildCertificate(baseInput);
    const broken = { ...cert, claim: { ...cert.claim, claimId: '' } } as Certificate;
    const result = await auditCertificate(broken);
    expect(result.verdict).toBe('STRUCTURALLY_INVALID');
    expect(result.errors.some((e) => e.includes('claimId'))).toBe(true);
  });

  it('INTEGRITY_VALID_UNSIGNED: real, untampered, unsigned certificate', async () => {
    const cert = await buildCertificate(baseInput);
    const result = await auditCertificate(cert);
    expect(result.verdict).toBe('INTEGRITY_VALID_UNSIGNED');
    expect(result.errors).toEqual([]);
  });

  it('INTEGRITY_INVALID: claim tampered after signing', async () => {
    const { cert } = await signedCertificate();
    const tampered: Certificate = { ...cert, claim: { ...cert.claim, statement: 'TAMPERED CLAIM' } };
    const result = await auditCertificate(tampered);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('claimFingerprint mismatch'))).toBe(true);
  });

  it('INTEGRITY_INVALID: evidence tampered after signing', async () => {
    const { cert } = await signedCertificate();
    const tampered: Certificate = { ...cert, evidence: { ...cert.evidence, evidencePackId: 'TAMPERED' } };
    const result = await auditCertificate(tampered);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('evidenceFingerprint mismatch'))).toBe(true);
  });

  it('INTEGRITY_INVALID: provenance chain broken (output does not feed next input)', async () => {
    const cert = await buildCertificate({
      ...baseInput,
      provenance: {
        provenanceTrail: [
          { step: 1, action: 'a', inputFingerprint: 'a'.repeat(64), outputFingerprint: 'b'.repeat(64), timestamp: '2026-09-15T14:29:00Z' },
          { step: 2, action: 'b', inputFingerprint: 'DIFFERENT-THAN-PREVIOUS-OUTPUT'.padEnd(64, '0'), outputFingerprint: 'c'.repeat(64), timestamp: '2026-09-15T14:30:00Z' },
        ],
      },
    });
    const result = await auditCertificate(cert);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('provenance chain broken'))).toBe(true);
  });

  it('INTEGRITY_INVALID: step numbers not strictly increasing', async () => {
    const cert = await buildCertificate({
      ...baseInput,
      provenance: {
        provenanceTrail: [
          { step: 2, action: 'a', inputFingerprint: 'a'.repeat(64), outputFingerprint: 'b'.repeat(64), timestamp: '2026-09-15T14:29:00Z' },
          { step: 1, action: 'b', inputFingerprint: 'b'.repeat(64), outputFingerprint: 'c'.repeat(64), timestamp: '2026-09-15T14:30:00Z' },
        ],
      },
    });
    const result = await auditCertificate(cert);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('is not greater than the previous step'))).toBe(true);
  });

  it('INTEGRITY_INVALID: signature bytes tampered (real ECDSA rejects it)', async () => {
    const { cert } = await signedCertificate();
    const tampered: Certificate = { ...cert, signature: { ...cert.signature!, signatureValue: 'ff'.repeat(64) } };
    const result = await auditCertificate(tampered);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('ECDSA-P256-SHA256 signature verification failed'))).toBe(true);
  });

  it('INTEGRITY_INVALID: signed with a DIFFERENT key than the one embedded in the certificate', async () => {
    const unsigned = await buildCertificate(baseInput);
    const signer = await generateKeyPair();
    const impostor = await generateKeyPair();
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, signer.privateKeyJwk);
    const cert = await buildCertificate(baseInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(impostor.publicKeyJwk), signatureValue, signedAt: baseInput.issuedAt,
    });
    const result = await auditCertificate(cert);
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('ECDSA-P256-SHA256 signature verification failed'))).toBe(true);
  });

  it('INTEGRITY_VALID_SIGNED_VERIFIED: real signature, signing key IS in the trust store', async () => {
    const { cert, publicKey } = await signedCertificate();
    const result = await auditCertificate(cert, new Set([publicKey]));
    expect(result.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
    expect(result.errors).toEqual([]);
  });

  it('INTEGRITY_VALID_SIGNED_UNTRUSTED: real signature, signing key is NOT in the trust store — crypto validity and trust are separate questions', async () => {
    const { cert } = await signedCertificate();
    const result = await auditCertificate(cert, new Set());
    expect(result.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
    expect(result.warnings.some((w) => w.includes('not in the trust store'))).toBe(true);
  });

  it('trusting the key after the fact upgrades the verdict from UNTRUSTED to VERIFIED — same certificate, same signature, different trust store', async () => {
    const { cert, publicKey } = await signedCertificate();
    const before = await auditCertificate(cert, new Set());
    const after = await auditCertificate(cert, new Set([publicKey]));
    expect(before.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
    expect(after.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
  });
});
