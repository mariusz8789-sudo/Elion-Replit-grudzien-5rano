import { describe, expect, it } from 'vitest';
import { buildCertificate, buildUnsignedCertificate, computeCertificateFingerprint, computeSignedPayloadFingerprint } from '../src/cert/builder.js';
import { generateKeyPair, publicKeyToString, signFingerprint } from '../src/crypto/signing.js';
import type { UnsignedCertificateInput } from '../src/cert/types.js';

const baseInput: UnsignedCertificateInput = {
  certId: 'cert-001', issuedAt: '2026-09-15T14:32:00Z', issuer: 'genesis-local',
  claim: { claimId: 'claim-001', statement: 'ISOLATION minimizes totalDeaths', domain: 'biology' },
  evidence: { evidencePackId: 'pack-001', evidenceChainId: 'chain-001', evidenceUri: 'evidence://pack-001/chain-001' },
  provenance: { provenanceTrail: [{ step: 1, action: 'discovery-loop-cycle', inputFingerprint: 'i'.repeat(64), outputFingerprint: 'o'.repeat(64), timestamp: '2026-09-15T14:30:00Z' }] },
};

describe('Certificate builder — signed-payload / certificate fingerprint separation (the v2 circular-dependency fix)', () => {
  it('signedPayloadFingerprint is the SAME before and after attaching a signature — signing never mutates what was signed', async () => {
    const unsigned = await buildUnsignedCertificate(baseInput);
    const keys = await generateKeyPair();
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
    const signed = await buildCertificate(baseInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(keys.publicKeyJwk), signatureValue, signedAt: baseInput.issuedAt,
    });
    expect(signed.integrity.signedPayloadFingerprint).toBe(unsigned.integrity.signedPayloadFingerprint);
  });

  it('certificateFingerprint (full cert) DIFFERS from signedPayloadFingerprint, and changes once a signature is attached', async () => {
    const unsigned = await buildCertificate(baseInput, null);
    const keys = await generateKeyPair();
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
    const signed = await buildCertificate(baseInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(keys.publicKeyJwk), signatureValue, signedAt: baseInput.issuedAt,
    });

    const unsignedCertFingerprint = await computeCertificateFingerprint(unsigned);
    const signedCertFingerprint = await computeCertificateFingerprint(signed);

    // The full-certificate fingerprint legitimately changes once a signature is attached...
    expect(signedCertFingerprint).not.toBe(unsignedCertFingerprint);
    // ...but the fingerprint that was actually SIGNED never does — this is the fix itself,
    // stated as an assertion: certificateFingerprint and signedPayloadFingerprint are NEVER the same value.
    expect(signedCertFingerprint).not.toBe(signed.integrity.signedPayloadFingerprint);
    expect(unsignedCertFingerprint).not.toBe(unsigned.integrity.signedPayloadFingerprint);
  });

  it('computeSignedPayloadFingerprint is deterministic: the same input always fingerprints the same', async () => {
    const a = await computeSignedPayloadFingerprint(baseInput);
    const b = await computeSignedPayloadFingerprint(baseInput);
    expect(a).toBe(b);
  });

  it('changing the claim changes signedPayloadFingerprint (no accidental insensitivity to real content)', async () => {
    const a = await computeSignedPayloadFingerprint(baseInput);
    const b = await computeSignedPayloadFingerprint({ ...baseInput, claim: { ...baseInput.claim, statement: 'DIFFERENT CLAIM' } });
    expect(a).not.toBe(b);
  });

  it('an unsigned certificate really has signature: null, not a placeholder object', async () => {
    const cert = await buildCertificate(baseInput);
    expect(cert.signature).toBeNull();
  });
});
