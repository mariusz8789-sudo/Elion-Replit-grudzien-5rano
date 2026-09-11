/**
 * CSRN E2E DEMO — one certificate, built, signed, audited, then tampered
 * and re-audited. Prints real computed fingerprints/verdicts; nothing here
 * is a canned string. Run: `npm run demo`.
 */
import { buildCertificate } from '../src/cert/builder.js';
import { auditCertificate } from '../src/cert/auditor.js';
import { generateKeyPair, publicKeyToString, signFingerprint } from '../src/crypto/signing.js';
import type { UnsignedCertificateInput } from '../src/cert/types.js';

function bar(title: string): string {
  return `\n${'='.repeat(70)}\n${title}\n${'='.repeat(70)}`;
}

async function main(): Promise<void> {
  console.log(bar('CSRN — E2E DEMO (offline, single instance)'));

  const input: UnsignedCertificateInput = {
    certId: 'cert-demo-001',
    issuedAt: new Date().toISOString(),
    issuer: 'genesis-local',
    claim: { claimId: 'claim-demo-001', statement: 'ISOLATION minimizes modeled totalDeaths among the declared candidates', domain: 'biology' },
    evidence: { evidencePackId: 'pack-demo-001', evidenceChainId: 'chain-demo-001', evidenceUri: 'evidence://pack-demo-001/chain-demo-001' },
    provenance: {
      provenanceTrail: [{ step: 1, action: 'discovery-loop-cycle', inputFingerprint: '0'.repeat(64), outputFingerprint: '1'.repeat(64), timestamp: new Date().toISOString() }],
    },
  };

  const unsigned = await buildCertificate(input);
  console.log('Unsigned certificate built.');
  console.log('  signedPayloadFingerprint:', unsigned.integrity.signedPayloadFingerprint);

  const keys = await generateKeyPair();
  const publicKey = publicKeyToString(keys.publicKeyJwk);
  const signatureValue = await signFingerprint(unsigned.integrity.signedPayloadFingerprint, keys.privateKeyJwk);
  const signed = await buildCertificate(input, { algorithm: 'ECDSA-P256-SHA256', publicKey, signatureValue, signedAt: input.issuedAt });
  console.log('Signed with a real ECDSA P-256 keypair (crypto.subtle.generateKey/sign).');
  console.log('  signatureValue (hex, first 32 chars):', signatureValue.slice(0, 32) + '…');

  console.log(bar('AUDIT — untrusted key'));
  const untrusted = await auditCertificate(signed, new Set());
  console.log('verdict:', untrusted.verdict);
  console.log('warnings:', untrusted.warnings.join('; ') || '(none)');

  console.log(bar('AUDIT — trusted key'));
  const trusted = await auditCertificate(signed, new Set([publicKey]));
  console.log('verdict:', trusted.verdict);

  console.log(bar('AUDIT — tampered claim'));
  const tampered = { ...signed, claim: { ...signed.claim, statement: 'TAMPERED CLAIM' } };
  const tamperedResult = await auditCertificate(tampered, new Set([publicKey]));
  console.log('verdict:', tamperedResult.verdict);
  console.log('errors:', tamperedResult.errors.join('; '));

  console.log(bar('AUDIT — malformed certificate (missing claimId)'));
  const malformed = { ...signed, claim: { ...signed.claim, claimId: '' } };
  const malformedResult = await auditCertificate(malformed, new Set([publicKey]));
  console.log('verdict:', malformedResult.verdict);
  console.log('errors:', malformedResult.errors.join('; '));

  const allExpectedVerdicts = [untrusted.verdict, trusted.verdict, tamperedResult.verdict, malformedResult.verdict];
  const expected = ['INTEGRITY_VALID_SIGNED_UNTRUSTED', 'INTEGRITY_VALID_SIGNED_VERIFIED', 'INTEGRITY_INVALID', 'STRUCTURALLY_INVALID'];
  const ok = allExpectedVerdicts.every((v, i) => v === expected[i]);
  console.log(bar(ok ? 'E2E DEMO: ALL VERDICTS MATCHED EXPECTATIONS' : 'E2E DEMO: A VERDICT DID NOT MATCH — SEE ABOVE'));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
