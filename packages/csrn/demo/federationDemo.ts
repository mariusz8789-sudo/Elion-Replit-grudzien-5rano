/**
 * CSRN FEDERATION DEMO — OFFLINE SIMULATION of three independent instances
 * (never a real network — see `src/federation/instance.ts`'s own doc).
 * Run: `npm run demo:federation`.
 */
import { createInstance, ownPublicKeyId, storePack, trust } from '../src/federation/instance.js';
import { receiverAudit, simulateExchange } from '../src/federation/exchange.js';
import { buildCertificate } from '../src/cert/builder.js';
import { publicKeyToString, signFingerprint } from '../src/crypto/signing.js';
import type { UnsignedCertificateInput } from '../src/cert/types.js';

function bar(title: string): string {
  return `\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`;
}

async function main(): Promise<void> {
  console.log(bar('CSRN — FEDERATION DEMO (OFFLINE SIMULATION, not a real network)'));

  const rainfall = await createInstance('noaa-rainfall', 'rainfall');
  const biotech = await createInstance('pennington-biotech', 'biotech');
  const particle = await createInstance('cern-particle', 'particle');
  console.log('Three independent instances created, each with its own ECDSA P-256 keypair and in-memory store:');
  console.log('  -', rainfall.instanceId);
  console.log('  -', biotech.instanceId);
  console.log('  -', particle.instanceId);

  const input: UnsignedCertificateInput = {
    certId: 'cert-rain-001', issuedAt: new Date().toISOString(), issuer: rainfall.instanceId,
    claim: { claimId: 'claim-rainfall-peak', statement: 'Peak discharge 75.56 L/s', domain: 'rainfall' },
    evidence: { evidencePackId: 'pack-rain-001', evidenceChainId: 'chain-rain-001', evidenceUri: 'evidence://pack-rain-001/chain-rain-001' },
    provenance: { provenanceTrail: [{ step: 1, action: 'simulation', inputFingerprint: '0'.repeat(64), outputFingerprint: '1'.repeat(64), timestamp: new Date().toISOString() }] },
  };

  const unsigned = await buildCertificate(input);
  const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, rainfall.keyPair.privateKeyJwk);
  const cert = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey: publicKeyToString(rainfall.keyPair.publicKeyJwk), signatureValue, signedAt: input.issuedAt });
  storePack(rainfall, { evidencePackId: 'pack-rain-001', evidence: input.evidence, cert });
  console.log('\nRainfall published a real ECDSA-signed certificate for pack-rain-001.');

  simulateExchange(rainfall, biotech, 'pack-rain-001');
  const beforeTrust = await receiverAudit(biotech, 'pack-rain-001');
  console.log(bar('Biotech receives the pack, before deciding to trust rainfall'));
  console.log('verdict:', beforeTrust!.verdict, '(cryptographically valid, but not yet trusted)');

  trust(biotech, await ownPublicKeyId(rainfall));
  const afterTrust = await receiverAudit(biotech, 'pack-rain-001');
  console.log(bar('Biotech now trusts rainfall\'s public key'));
  console.log('verdict:', afterTrust!.verdict);

  simulateExchange(rainfall, particle, 'pack-rain-001');
  const particleVerdict = await receiverAudit(particle, 'pack-rain-001');
  console.log(bar('Particle received the same pack but never trusted rainfall'));
  console.log('verdict:', particleVerdict!.verdict);

  console.log(bar('Tamper detection — mutate biotech\'s OWN received copy'));
  const receivedRecord = biotech.packs.get('pack-rain-001')!;
  biotech.packs.set('pack-rain-001', { ...receivedRecord, cert: { ...receivedRecord.cert, claim: { ...receivedRecord.cert.claim, statement: 'TAMPERED: peak discharge 999.99 L/s' } } });
  const tamperedVerdict = await receiverAudit(biotech, 'pack-rain-001');
  console.log('verdict after tamper:', tamperedVerdict!.verdict);
  console.log('first error:', tamperedVerdict!.errors[0]);
  console.log('rainfall\'s own copy is unaffected:', rainfall.packs.get('pack-rain-001')!.cert.claim.statement);

  const expected = ['INTEGRITY_VALID_SIGNED_UNTRUSTED', 'INTEGRITY_VALID_SIGNED_VERIFIED', 'INTEGRITY_VALID_SIGNED_UNTRUSTED', 'INTEGRITY_INVALID'];
  const actual = [beforeTrust!.verdict, afterTrust!.verdict, particleVerdict!.verdict, tamperedVerdict!.verdict];
  const ok = actual.every((v, i) => v === expected[i]) && rainfall.packs.get('pack-rain-001')!.cert.claim.statement === 'Peak discharge 75.56 L/s';
  console.log(bar(ok ? 'FEDERATION DEMO: ALL VERDICTS MATCHED EXPECTATIONS' : 'FEDERATION DEMO: A VERDICT DID NOT MATCH — SEE ABOVE'));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
