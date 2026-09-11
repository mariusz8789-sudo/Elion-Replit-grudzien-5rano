import { describe, expect, it } from 'vitest';
import { createInstance, ownPublicKeyId, storePack, trust } from '../src/federation/instance.js';
import { receiverAudit, simulateExchange } from '../src/federation/exchange.js';
import { buildCertificate } from '../src/cert/builder.js';
import { publicKeyToString, signFingerprint } from '../src/crypto/signing.js';
import type { Certificate, UnsignedCertificateInput } from '../src/cert/types.js';

const claimInput: UnsignedCertificateInput = {
  certId: 'cert-rain-001', issuedAt: '2026-09-15T14:32:00Z', issuer: 'noaa-rainfall',
  claim: { claimId: 'claim-rainfall-peak', statement: 'Peak discharge 75.56 L/s', domain: 'rainfall' },
  evidence: { evidencePackId: 'pack-rain-001', evidenceChainId: 'chain-rain-001', evidenceUri: 'evidence://pack-rain-001/chain-rain-001' },
  provenance: { provenanceTrail: [{ step: 1, action: 'simulation', inputFingerprint: 'a'.repeat(64), outputFingerprint: 'b'.repeat(64), timestamp: '2026-09-15T14:30:00Z' }] },
};

describe('Federation — offline simulation of independent instances (not a real network)', () => {
  it('two instances have genuinely independent stores and keypairs', async () => {
    const rainfall = await createInstance('noaa-rainfall', 'rainfall');
    const biotech = await createInstance('pennington-biotech', 'biotech');
    expect(rainfall.packs).not.toBe(biotech.packs);
    expect(await ownPublicKeyId(rainfall)).not.toBe(await ownPublicKeyId(biotech));
  });

  it('exchange copies a pack from sender to receiver; a real ECDSA-signed cert survives the copy', async () => {
    const rainfall = await createInstance('noaa-rainfall', 'rainfall');
    const biotech = await createInstance('pennington-biotech', 'biotech');

    const unsigned = await buildCertificate(claimInput);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
    const cert: Certificate = await buildCertificate(claimInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(rainfall.keyPair.publicKeyJwk), signatureValue, signedAt: claimInput.issuedAt,
    });
    storePack(rainfall, { evidencePackId: 'pack-rain-001', evidence: claimInput.evidence, cert });

    const received = simulateExchange(rainfall, biotech, 'pack-rain-001');
    expect(received).not.toBeNull();
    expect(biotech.packs.has('pack-rain-001')).toBe(true);

    const r1 = await receiverAudit(biotech, 'pack-rain-001');
    expect(r1!.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED'); // biotech has not decided to trust rainfall yet
  });

  it('receiver-side trust transition: UNTRUSTED before trusting the sender key, VERIFIED after', async () => {
    const rainfall = await createInstance('noaa-rainfall', 'rainfall');
    const biotech = await createInstance('pennington-biotech', 'biotech');

    const unsigned = await buildCertificate(claimInput);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
    const cert: Certificate = await buildCertificate(claimInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(rainfall.keyPair.publicKeyJwk), signatureValue, signedAt: claimInput.issuedAt,
    });
    storePack(rainfall, { evidencePackId: 'pack-rain-001', evidence: claimInput.evidence, cert });
    simulateExchange(rainfall, biotech, 'pack-rain-001');

    expect((await receiverAudit(biotech, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
    trust(biotech, await ownPublicKeyId(rainfall));
    expect((await receiverAudit(biotech, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
  });

  it('an instance that never receives a pack, or never trusts, independently disagrees with one that does — real per-instance decisions, not a shared verdict', async () => {
    const rainfall = await createInstance('noaa-rainfall', 'rainfall');
    const biotech = await createInstance('pennington-biotech', 'biotech');
    const particle = await createInstance('cern-particle', 'particle');

    const unsigned = await buildCertificate(claimInput);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
    const cert: Certificate = await buildCertificate(claimInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(rainfall.keyPair.publicKeyJwk), signatureValue, signedAt: claimInput.issuedAt,
    });
    storePack(rainfall, { evidencePackId: 'pack-rain-001', evidence: claimInput.evidence, cert });

    simulateExchange(rainfall, biotech, 'pack-rain-001');
    trust(biotech, await ownPublicKeyId(rainfall));
    simulateExchange(rainfall, particle, 'pack-rain-001'); // particle never trusts

    expect((await receiverAudit(biotech, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');
    expect((await receiverAudit(particle, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
  });

  it('tamper detection: mutating the RECEIVED copy after exchange is caught on next audit, and never touches the sender\'s own copy', async () => {
    const rainfall = await createInstance('noaa-rainfall', 'rainfall');
    const biotech = await createInstance('pennington-biotech', 'biotech');

    const unsigned = await buildCertificate(claimInput);
    const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
    const cert: Certificate = await buildCertificate(claimInput, {
      algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(rainfall.keyPair.publicKeyJwk), signatureValue, signedAt: claimInput.issuedAt,
    });
    storePack(rainfall, { evidencePackId: 'pack-rain-001', evidence: claimInput.evidence, cert });
    trust(biotech, await ownPublicKeyId(rainfall));
    simulateExchange(rainfall, biotech, 'pack-rain-001');

    expect((await receiverAudit(biotech, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_VERIFIED');

    // Tamper the RECEIVER's own copy (never the sender's original).
    const receivedRecord = biotech.packs.get('pack-rain-001')!;
    biotech.packs.set('pack-rain-001', { ...receivedRecord, cert: { ...receivedRecord.cert, claim: { ...receivedRecord.cert.claim, statement: 'TAMPERED: peak discharge 999.99 L/s' } } });

    const afterTamper = await receiverAudit(biotech, 'pack-rain-001');
    expect(afterTamper!.verdict).toBe('INTEGRITY_INVALID');

    // The sender's own copy is completely unaffected — independent stores, not shared state.
    // (rainfall never added its own key to its own trust store, so this is UNTRUSTED rather
    // than VERIFIED — the point here is only that its claim text survived untouched.)
    expect(rainfall.packs.get('pack-rain-001')!.cert.claim.statement).toBe('Peak discharge 75.56 L/s');
    expect((await receiverAudit(rainfall, 'pack-rain-001'))!.verdict).toBe('INTEGRITY_VALID_SIGNED_UNTRUSTED');
  });
});
