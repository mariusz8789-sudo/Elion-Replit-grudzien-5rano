#!/usr/bin/env node
/**
 * SIGN THE COMMITTED D-150 REDOCK EVIDENCE WITH THE GENESIS CSRN KEY.
 *
 *   node scripts/csrn-sign.mjs --key ~/genesis-csrn-private.jwk
 *   node scripts/csrn-sign.mjs --unsigned        # certificate without a signature
 *
 * Builds the certificate with the same code the Reviewer Room verifies with
 * (packages/frontend/src/core/reviewer/redockCertificate.ts), signs its
 * signedPayloadFingerprint with the existing CSRN ECDSA P-256 code, re-verifies it
 * against the PUBLISHED key file, and only then writes
 * docs/evidence/finalist-falsification-2026-09-27.csrn-cert.json.
 *
 * Refuses: to run in CI; a key file inside the repository; a private key whose
 * public half is not the ACTIVE published key; a certificate that does not verify.
 * The private key is read from disk and never printed or written anywhere.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_KEY_PATH, REPO, argValue, assertOutsideRepo, loadCsrn, refuseInCi } from './csrn-lib.mjs';

const SCRIPT = 'csrn-sign';
const argv = process.argv.slice(2);
const unsigned = argv.includes('--unsigned');
const keyPath = argValue(argv, '--key');
const keyFilePath = path.resolve(argValue(argv, '--public-key') ?? PUBLIC_KEY_PATH);
if (!unsigned) {
  refuseInCi(SCRIPT);
  if (!keyPath) {
    console.error(`${SCRIPT}: pass --key <path to the private JWK> (or --unsigned).`);
    process.exit(2);
  }
  assertOutsideRepo(keyPath, SCRIPT);
}

const csrn = await loadCsrn();
const recordText = readFileSync(path.join(REPO, csrn.REDOCK_EVIDENCE_PATH), 'utf8');
const outPath = path.resolve(argValue(argv, '--out') ?? path.join(REPO, csrn.REDOCK_CERTIFICATE_PATH));
const input = await csrn.redockCertificateInput(recordText);
const keyFile = JSON.parse(readFileSync(keyFilePath, 'utf8'));

let certificate;
if (unsigned) {
  certificate = await csrn.buildCertificate(input);
} else {
  if (keyFile.status !== 'ACTIVE') {
    console.error(`${SCRIPT}: ${keyFilePath} is ${keyFile.status}; generate the key first (scripts/csrn-keygen.mjs).`);
    process.exit(2);
  }
  const privateKeyJwk = JSON.parse(readFileSync(path.resolve(keyPath), 'utf8'));
  const { kty, crv, x, y } = privateKeyJwk;
  const publicKeyJwk = { kty, crv, x, y };
  const keyId = await csrn.computePublicKeyId(publicKeyJwk);
  if (keyId !== keyFile.keyId) {
    console.error(`${SCRIPT}: this private key (keyId ${keyId}) is not the published Genesis key (${keyFile.keyId}). Refusing to sign.`);
    process.exit(2);
  }
  const draft = await csrn.buildCertificate(input);
  const signatureValue = await csrn.signFingerprint(draft.integrity.signedPayloadFingerprint, privateKeyJwk);
  certificate = await csrn.buildCertificate(input, {
    algorithm: 'ECDSA-P256-SHA256', publicKey: csrn.publicKeyToString(publicKeyJwk), signatureValue, signedAt: new Date().toISOString(),
  });
}

const check = await csrn.verifyRedockEvidence(certificate, recordText, keyFile);
const expected = unsigned ? 'UNSIGNED' : 'SIGNED_BY_GENESIS_KEY';
if (!check.unaltered || check.signer !== expected) {
  console.error(`${SCRIPT}: the certificate does not verify (${check.auditVerdict}, signer ${check.signer}): ${check.errors.join('; ')}. Nothing written.`);
  process.exit(1);
}
writeFileSync(outPath, `${JSON.stringify(certificate, null, 2)}\n`);
console.log(`${unsigned ? 'Unsigned' : 'Signed'} certificate written: ${path.relative(REPO, outPath)}`);
console.log(`  classification:   ${check.epistemicStatus}`);
console.log(`  signed payload:   ${certificate.integrity.signedPayloadFingerprint}`);
console.log(`  certified file:   ${check.certifiedFileSha256}`);
console.log(`  signer:           ${check.signer}${check.signerKeyId ? ` (keyId ${check.signerKeyId})` : ''}`);
