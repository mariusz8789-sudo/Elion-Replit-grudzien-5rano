#!/usr/bin/env node
/**
 * GENESIS CSRN SIGNING KEY — generate once, on the owner's own machine.
 *
 *   node scripts/csrn-keygen.mjs --private-out ~/genesis-csrn-private.jwk
 *
 * Writes:
 *   - the PRIVATE key (JWK, file mode 0600) to --private-out, which must be outside
 *     this repository and must not exist yet. It is never printed.
 *   - the PUBLIC key file docs/keys/genesis-csrn-signing-key.json and the identical
 *     packages/frontend/public/.well-known/genesis-csrn-key.json.
 *
 * keyId = SHA-256 of the canonical JSON of {crv, kty, x, y} (CSRN
 * `computePublicKeyId`). Refuses to run in CI, and refuses to replace an ACTIVE key
 * (rotation is a deliberate, separate step: --rotate moves the ACTIVE key into
 * previousKeys as RETIRED, valid only until now, so what it already signed still verifies;
 * a key that is compromised is marked REVOKED by hand instead and verifies nothing).
 *
 * This is an ECDSA P-256 integrity and origin signature. It is not a qualified or
 * legal electronic signature.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { PUBLIC_KEY_PATH, WELL_KNOWN_PATH, argValue, assertOutsideRepo, loadCsrn, refuseInCi } from './csrn-lib.mjs';

const SCRIPT = 'csrn-keygen';
refuseInCi(SCRIPT);
const argv = process.argv.slice(2);
const privateOut = path.resolve(argValue(argv, '--private-out') ?? path.join(homedir(), 'genesis-csrn-private.jwk'));
const publicOut = path.resolve(argValue(argv, '--public-out') ?? PUBLIC_KEY_PATH);
const wellKnownOut = path.resolve(argValue(argv, '--well-known-out') ?? WELL_KNOWN_PATH);

assertOutsideRepo(privateOut, SCRIPT);
if (existsSync(privateOut)) {
  console.error(`${SCRIPT}: ${privateOut} already exists; not overwriting a private key.`);
  process.exit(2);
}
const rotate = argv.includes('--rotate');
let previousKeys = [];
if (existsSync(publicOut)) {
  const current = JSON.parse(readFileSync(publicOut, 'utf8'));
  previousKeys = Array.isArray(current.previousKeys) ? current.previousKeys : [];
  if (current.status === 'ACTIVE') {
    if (!rotate) {
      console.error(`${SCRIPT}: ${publicOut} already holds an ACTIVE key (${current.keyId}). Pass --rotate to retire it, or mark it REVOKED if it is compromised.`);
      process.exit(2);
    }
    previousKeys = [...previousKeys, { status: 'RETIRED', keyId: current.keyId, publicKeyJwk: current.publicKeyJwk, validFrom: current.validFrom, validUntil: new Date().toISOString() }];
  } else if (current.status === 'REVOKED' && current.keyId) {
    // A revoked key stays on record so nothing it signed is ever trusted again.
    previousKeys = [...previousKeys, { status: 'REVOKED', keyId: current.keyId, publicKeyJwk: current.publicKeyJwk, validFrom: current.validFrom, validUntil: current.validUntil ?? new Date().toISOString() }];
  } else if (rotate) {
    console.error(`${SCRIPT}: --rotate needs an ACTIVE key to retire; ${publicOut} is ${current.status}.`);
    process.exit(2);
  }
}

const csrn = await loadCsrn();
const { privateKeyJwk, publicKeyJwk } = await csrn.generateKeyPair();
const { kty, crv, x, y } = publicKeyJwk;
const keyId = await csrn.computePublicKeyId({ kty, crv, x, y });

const keyFile = {
  kind: 'GENESIS_CSRN_PUBLIC_KEY',
  version: 1,
  status: 'ACTIVE',
  algorithm: 'ECDSA-P256-SHA256',
  keyId,
  publicKeyJwk: { kty, crv, x, y },
  validFrom: new Date().toISOString(),
  validUntil: null,
  ...(previousKeys.length ? { previousKeys } : {}),
  keyIdMethod: 'SHA-256 (hex) of the canonical JSON (sorted keys) of {crv, kty, x, y}; packages/csrn computePublicKeyId',
  notice: 'Public half of the Genesis CSRN evidence-signing key. A valid signature means the signed evidence was not altered and was signed by the holder of this key. It is not a qualified or legal electronic signature, and it is not laboratory validation.',
};

mkdirSync(path.dirname(privateOut), { recursive: true });
writeFileSync(privateOut, `${JSON.stringify(privateKeyJwk)}\n`, { mode: 0o600, flag: 'wx' });
for (const out of [publicOut, wellKnownOut]) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(keyFile, null, 2)}\n`);
}

console.log(`Genesis CSRN key generated.`);
console.log(`  keyId:        ${keyId}`);
console.log(`  private key:  ${privateOut} (mode 0600; keep it off the repository, CI and Railway)`);
console.log(`  public key:   ${publicOut}`);
console.log(`  well-known:   ${wellKnownOut}`);
console.log(`Next: node scripts/csrn-sign.mjs --key ${privateOut}`);
