import { createDemoInstances, storeEvidencePack, trustPublicKey } from '../federation/instance.js';
import { simulateExchange, receiverAudit, encodeEvidenceUri } from '../federation/exchange.js';
import { buildUnsignedCertificate, attachSignature } from '../src/cert/builder.js';
import { signPayload, SIGNATURE_ALGORITHM, publicKeyId } from '../src/crypto/signing.js';
import type { UnsignedCertificateInput } from '../src/cert/builder.js';

async function main(): Promise<void> {
  console.log('=== CSRN reference — real ECDSA P-256 federation demo ===\n');

  const { rainfall, biotech, particle } = await createDemoInstances();
  console.log('Instances created, each with a real ECDSA P-256 key pair:');
  console.log('  -', rainfall.instanceId, '| public key kty/crv:', rainfall.keyPair.publicKeyJwk.kty, rainfall.keyPair.publicKeyJwk.crv);
  console.log('  -', biotech.instanceId, '| trusted keys so far:', biotech.trustedPublicKeys.size);
  console.log('  -', particle.instanceId, '\n');

  // 1. Rainfall builds and signs a certificate.
  const packId = 'pack-rain-001';
  const evidenceUri = encodeEvidenceUri(rainfall.instanceId, rainfall.domain, packId);
  const input: UnsignedCertificateInput = {
    certId: 'cert-rain-001',
    issuedAt: '2026-09-15T14:32:00Z',
    issuer: rainfall.instanceId,
    claim: { claimId: 'claim-rainfall-peak', statement: 'Peak discharge 75.56 L/s', domain: 'rainfall' },
    evidence: { evidencePackId: packId, evidenceChainId: 'chain-rain-001', evidenceUri },
    provenance: {
      provenanceTrail: [
        { step: 1, action: 'simulate-peak-discharge', inputFingerprint: 'i1'.padEnd(64, '0'), outputFingerprint: 'o1'.padEnd(64, '0'), timestamp: '2026-09-15T14:30:00Z' },
      ],
    },
  };

  const unsigned = await buildUnsignedCertificate(input);
  console.log('Rainfall: signedPayloadFingerprint =', unsigned.integrity.signedPayloadFingerprint.slice(0, 16) + '...');

  const signatureValue = await signPayload(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
  const signedCert = attachSignature(unsigned, {
    algorithm: SIGNATURE_ALGORITHM,
    publicKey: rainfall.keyPair.publicKeyJwk,
    signatureValue,
    signedAt: input.issuedAt,
  });
  storeEvidencePack(rainfall, { evidencePackId: packId, evidenceChainId: 'chain-rain-001', evidence: input.evidence, cert: signedCert });
  console.log('Rainfall: published ECDSA-signed certificate\n');

  // 2. Biotech receives it, audits before trusting.
  simulateExchange(rainfall, biotech, evidenceUri);
  const beforeTrust = await receiverAudit(biotech, packId);
  console.log('Biotech audit (before trusting rainfall):', beforeTrust!.verdict);
  console.log('  warnings:', beforeTrust!.warnings.join('; ') || '(none)');

  // 3. Biotech decides to trust rainfall's key.
  trustPublicKey(biotech, rainfall.keyPair.publicKeyJwk);
  const afterTrust = await receiverAudit(biotech, packId);
  console.log('Biotech audit (after trusting rainfall):', afterTrust!.verdict, '\n');

  // 4. Particle receives the same pack but never trusts rainfall.
  simulateExchange(rainfall, particle, evidenceUri);
  const particleAudit = await receiverAudit(particle, packId);
  console.log('Particle audit (never trusted rainfall):', particleAudit!.verdict, '\n');

  // 5. A tampered copy: Biotech's own stored certificate gets altered after receipt.
  const biotechCopy = biotech.packs.get(packId)!;
  const tamperedCert = { ...biotechCopy.cert, claim: { ...biotechCopy.cert.claim, statement: 'TAMPERED: peak discharge 999.99 L/s' } };
  biotech.packs.set(packId, { ...biotechCopy, cert: tamperedCert });
  biotech.certs.set(tamperedCert.certId, tamperedCert);

  const tamperedAudit = await receiverAudit(biotech, packId);
  console.log('Biotech audit (after local tampering, still trusting rainfall\'s key):', tamperedAudit!.verdict);
  console.log('  first error:', tamperedAudit!.errors[0] ?? '(none)');

  console.log('\nRainfall public key id (for reference):', publicKeyId(rainfall.keyPair.publicKeyJwk).slice(0, 40) + '...');
  console.log('\n=== Demo complete — every verdict above came from a real crypto.subtle.verify call. ===');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
