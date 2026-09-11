import { describe, it, expect } from 'vitest';
import {
  buildUnsignedCertificate, attachSignature, computeSignedPayloadFingerprint, computeCertificateFingerprint,
  type UnsignedCertificateInput, type Certificate,
} from '../src/cert/builder.js';
import { auditCertificate } from '../src/audit/auditor.js';
import { generateKeyPair, signPayload, publicKeyId, SIGNATURE_ALGORITHM, type JsonWebKey } from '../src/crypto/signing.js';

const baseInput: UnsignedCertificateInput = {
  certId: 'cert-001',
  issuedAt: '2026-09-15T14:32:00Z',
  issuer: 'genesis-local',
  claim: { claimId: 'claim-001', statement: 'Peak discharge exceeds 70 L/s', domain: 'rainfall' },
  evidence: { evidencePackId: 'pack-001', evidenceChainId: 'chain-001', evidenceUri: 'evidence://genesis-local/rainfall/pack-001' },
  provenance: {
    provenanceTrail: [
      { step: 1, action: 'simulate', inputFingerprint: 'i'.repeat(64), outputFingerprint: 'o'.repeat(64), timestamp: '2026-09-15T14:30:00Z' },
    ],
  },
};

/** Builds, signs and attaches a signature over `input` with a fresh key pair — the shared setup every "valid" test starts from. */
async function buildSignedCertificate(input: UnsignedCertificateInput): Promise<{ cert: Certificate; publicKeyJwk: JsonWebKey }> {
  const unsigned = await buildUnsignedCertificate(input);
  const keyPair = await generateKeyPair();
  const signatureValue = await signPayload(unsigned.integrity.signedPayloadFingerprint, keyPair.privateKeyJwk);
  const cert = attachSignature(unsigned, {
    algorithm: SIGNATURE_ALGORITHM,
    publicKey: keyPair.publicKeyJwk,
    signatureValue,
    signedAt: input.issuedAt,
  });
  return { cert, publicKeyJwk: keyPair.publicKeyJwk };
}

describe('CSRN reference — real ECDSA P-256 signature semantics', () => {
  it('valid signature, trusted key -> INTEGRITY_VALID_SIGNED_VERIFIED', async () => {
    const { cert, publicKeyJwk } = await buildSignedCertificate(baseInput);
    const result = await auditCertificate(cert, new Set([publicKeyId(publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
    expect(result.errors).toHaveLength(0);
  });

  it('valid signature, untrusted key -> INTEGRITY_VALID_SIGNED_UNTRUSTED (crypto still valid)', async () => {
    const { cert } = await buildSignedCertificate(baseInput);
    const result = await auditCertificate(cert, new Set()); // empty trust store
    expect(result.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
    expect(result.warnings.some((w) => w.includes('not in the trusted set'))).toBe(true);
  });

  it('no signature at all -> INTEGRITY_VALID_UNSIGNED', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const result = await auditCertificate(unsigned, new Set());
    expect(result.verdict).toBe('INTEGRITY_VALID_UNSIGNED');
  });

  it('tampered claim after signing -> INTEGRITY_INVALID, names claimFingerprint', async () => {
    const { cert, publicKeyJwk } = await buildSignedCertificate(baseInput);
    const tampered: Certificate = { ...cert, claim: { ...cert.claim, statement: 'TAMPERED' } };
    const result = await auditCertificate(tampered, new Set([publicKeyId(publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('claimFingerprint mismatch'))).toBe(true);
  });

  it('tampered evidence after signing -> INTEGRITY_INVALID, names evidenceFingerprint', async () => {
    const { cert, publicKeyJwk } = await buildSignedCertificate(baseInput);
    const tampered: Certificate = { ...cert, evidence: { ...cert.evidence, evidencePackId: 'TAMPERED' } };
    const result = await auditCertificate(tampered, new Set([publicKeyId(publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('evidenceFingerprint mismatch'))).toBe(true);
  });

  it('tampered provenance after signing -> INTEGRITY_INVALID, names provenanceFingerprint', async () => {
    const { cert, publicKeyJwk } = await buildSignedCertificate(baseInput);
    const tampered: Certificate = {
      ...cert,
      provenance: { ...cert.provenance, provenanceTrail: [{ ...cert.provenance.provenanceTrail[0]!, action: 'TAMPERED' }] },
    };
    const result = await auditCertificate(tampered, new Set([publicKeyId(publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('provenanceFingerprint mismatch'))).toBe(true);
  });

  it('broken provenance chain (output/input mismatch across steps) -> INTEGRITY_INVALID', async () => {
    const brokenInput: UnsignedCertificateInput = {
      ...baseInput,
      certId: 'cert-broken-chain',
      provenance: {
        provenanceTrail: [
          { step: 1, action: 'simulate', inputFingerprint: 'a'.repeat(64), outputFingerprint: 'b'.repeat(64), timestamp: '2026-09-15T14:30:00Z' },
          { step: 2, action: 'verify', inputFingerprint: 'NOT-B', outputFingerprint: 'c'.repeat(64), timestamp: '2026-09-15T14:31:00Z' },
        ],
      },
    };
    const unsigned = await buildUnsignedCertificate(brokenInput);
    const result = await auditCertificate(unsigned, new Set());
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors.some((e) => e.includes('provenance chain broken'))).toBe(true);
  });

  it('tampered signature bytes -> INTEGRITY_INVALID, ECDSA verification failed', async () => {
    const { cert, publicKeyJwk } = await buildSignedCertificate(baseInput);
    const tampered: Certificate = { ...cert, signature: { ...cert.signature!, signatureValue: 'ff'.repeat(64) } };
    const result = await auditCertificate(tampered, new Set([publicKeyId(publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors).toContain('ECDSA signature verification failed');
  });

  it('wrong public key embedded (signature made by a DIFFERENT key) -> INTEGRITY_INVALID', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const realSigner = await generateKeyPair();
    const impostor = await generateKeyPair();
    const signatureValue = await signPayload(unsigned.integrity.signedPayloadFingerprint, realSigner.privateKeyJwk);
    // The signature was produced by realSigner's private key, but the embedded public key is the impostor's.
    const cert = attachSignature(unsigned, {
      algorithm: SIGNATURE_ALGORITHM, publicKey: impostor.publicKeyJwk, signatureValue, signedAt: baseInput.issuedAt,
    });
    const result = await auditCertificate(cert, new Set([publicKeyId(impostor.publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
    expect(result.errors).toContain('ECDSA signature verification failed');
  });

  it('unsupported signature algorithm -> STRUCTURALLY_INVALID, never reaches crypto', async () => {
    const { cert } = await buildSignedCertificate(baseInput);
    const tampered: Certificate = { ...cert, signature: { ...cert.signature!, algorithm: 'RSA-FAKE' as never } };
    const result = await auditCertificate(tampered, new Set());
    expect(result.verdict).toBe('STRUCTURALLY_INVALID');
    expect(result.errors.some((e) => e.includes(SIGNATURE_ALGORITHM))).toBe(true);
  });

  it('malformed certificate (missing claim) -> STRUCTURALLY_INVALID', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const malformed = { ...unsigned, claim: undefined as never };
    const result = await auditCertificate(malformed, new Set());
    expect(result.verdict).toBe('STRUCTURALLY_INVALID');
    expect(result.errors).toContain('claim is required');
  });

  it('rebuilding the same input twice yields the same signedPayloadFingerprint (deterministic)', async () => {
    const fp1 = await computeSignedPayloadFingerprint(baseInput);
    const fp2 = await computeSignedPayloadFingerprint(baseInput);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('attaching a signature never changes signedPayloadFingerprint — no circular dependency', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const before = unsigned.integrity.signedPayloadFingerprint;
    const keyPair = await generateKeyPair();
    const signatureValue = await signPayload(before, keyPair.privateKeyJwk);
    const signed = attachSignature(unsigned, {
      algorithm: SIGNATURE_ALGORITHM, publicKey: keyPair.publicKeyJwk, signatureValue, signedAt: baseInput.issuedAt,
    });
    expect(signed.integrity.signedPayloadFingerprint).toBe(before);
  });

  it('certificateFingerprint differs from signedPayloadFingerprint and changes when a signature is attached', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const unsignedCertFp = await computeCertificateFingerprint(unsigned);
    expect(unsignedCertFp).not.toBe(unsigned.integrity.signedPayloadFingerprint);

    const keyPair = await generateKeyPair();
    const signatureValue = await signPayload(unsigned.integrity.signedPayloadFingerprint, keyPair.privateKeyJwk);
    const signed = attachSignature(unsigned, {
      algorithm: SIGNATURE_ALGORITHM, publicKey: keyPair.publicKeyJwk, signatureValue, signedAt: baseInput.issuedAt,
    });
    const signedCertFp = await computeCertificateFingerprint(signed);
    // Adding a signature changes the WHOLE-certificate fingerprint (used for storage/identification)...
    expect(signedCertFp).not.toBe(unsignedCertFp);
    // ...but never the signed-payload fingerprint (what was actually signed).
    expect(signed.integrity.signedPayloadFingerprint).toBe(unsigned.integrity.signedPayloadFingerprint);
  });

  it('two different real key pairs never verify against each other\'s signatures', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const a = await generateKeyPair();
    const b = await generateKeyPair();
    const signatureValue = await signPayload(unsigned.integrity.signedPayloadFingerprint, a.privateKeyJwk);
    const cert = attachSignature(unsigned, {
      algorithm: SIGNATURE_ALGORITHM, publicKey: b.publicKeyJwk, signatureValue, signedAt: baseInput.issuedAt,
    });
    const result = await auditCertificate(cert, new Set([publicKeyId(a.publicKeyJwk), publicKeyId(b.publicKeyJwk)]));
    expect(result.verdict).toBe('INTEGRITY_INVALID');
  });
});
