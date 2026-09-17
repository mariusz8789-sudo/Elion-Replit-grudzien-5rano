import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { openDurableChain, loadChain, verifyChain } from './security/auditChain.mjs';
import { verifyLockfileProvenance, scanForSecrets, TRUSTED_REGISTRIES } from './security/supplyChain.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmpFile = (name) => path.join(mkdtempSync(path.join(tmpdir(), 'sec-')), name);

/* ------------------------------------------------------------ durable chain */

test('DURABLE AUDIT: the chain survives a restart', () => {
  const f = tmpFile('audit.jsonl');
  const log = openDurableChain(f);
  log.append({ event: 'AUTH_FAIL', actor: 'sys', payload: { u: 'x' }, at: 1 });
  log.append({ event: 'PIN_DRIFT', actor: 'sys', payload: { pin: 'GIPR' }, at: 2 });
  assert.equal(log.verify().ok, true);

  const reopened = openDurableChain(f);
  assert.equal(reopened.chain.length, 2);
  assert.equal(reopened.verify().ok, true);
  assert.equal(reopened.chain[0].payload.u, 'x');
});

test('DURABLE AUDIT: a log edited on disk REFUSES to open — never appends onto a lie', () => {
  const f = tmpFile('audit.jsonl');
  const log = openDurableChain(f);
  log.append({ event: 'AUTH_FAIL', actor: 'sys', payload: { u: 'x' }, at: 1 });
  log.append({ event: 'RATE_LIMITED', actor: 'sys', payload: null, at: 2 });

  writeFileSync(f, readFileSync(f, 'utf8').replace('"u":"x"', '"u":"tampered"'));
  assert.throws(() => openDurableChain(f), /AUDIT_CHAIN_BROKEN.*CHAIN_TAMPERED_AT_0/s);
});

test('DURABLE AUDIT: deleting a record is detected, not silently accepted as a shorter log', () => {
  const f = tmpFile('audit.jsonl');
  const log = openDurableChain(f);
  log.append({ event: 'AUTH_FAIL', actor: 'a', payload: null, at: 1 });
  log.append({ event: 'RATE_LIMITED', actor: 'b', payload: null, at: 2 });

  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
  writeFileSync(f, `${lines[1]}\n`);
  assert.throws(() => openDurableChain(f), /AUDIT_CHAIN_BROKEN.*CHAIN_SEQ_GAP_AT_0/s);
});

test('DURABLE AUDIT: a malformed line is a damaged record, not a missing one', () => {
  const f = tmpFile('audit.jsonl');
  writeFileSync(f, '{"seq":0,"not":"json"\n');
  const loaded = loadChain(f);
  assert.equal(loaded.ok, false);
  assert.match(loaded.code, /AUDIT_MALFORMED_AT_0/);
  assert.throws(() => openDurableChain(f), /AUDIT_CHAIN_BROKEN/);
});

test('DURABLE AUDIT: a fresh file opens clean and an empty chain is still not "verified"', () => {
  const loaded = loadChain(tmpFile('nothing.jsonl'));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.fresh, true);
  assert.equal(verifyChain(loaded.chain).ok, false, 'an empty chain proves nothing');
});

/* ------------------------------------------------------------- supply chain */

test('SUPPLY CHAIN: the REAL lockfile passes provenance — measured, not assumed', () => {
  const r = verifyLockfileProvenance(path.join(REPO_ROOT, 'package-lock.json'));
  assert.equal(r.code !== 'LOCKFILE_MISSING', true, 'the repository must have a lockfile at all');
  assert.ok(r.registryPackages > 100, `expected a real dependency tree, saw ${r.registryPackages}`);
  assert.deepEqual(r.findings, [], `provenance findings: ${JSON.stringify(r.findings.slice(0, 3))}`);
  assert.equal(r.ok, true);
});

test('SUPPLY CHAIN: a package from an untrusted registry is a finding', () => {
  const f = tmpFile('lock.json');
  writeFileSync(f, JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root' },
      'node_modules/good': { version: '1.0.0', resolved: 'https://registry.npmjs.org/good/-/good-1.0.0.tgz', integrity: 'sha512-x' },
      'node_modules/evil': { version: '1.0.0', resolved: 'https://evil.registry.example/evil.tgz', integrity: 'sha512-y' },
    },
  }));
  const r = verifyLockfileProvenance(f);
  assert.equal(r.ok, false);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].code, 'UNTRUSTED_REGISTRY');
  assert.equal(r.findings[0].pkg, 'node_modules/evil');
});

test('SUPPLY CHAIN: a floating version and a missing integrity are each findings', () => {
  const f = tmpFile('lock.json');
  writeFileSync(f, JSON.stringify({
    lockfileVersion: 3,
    packages: {
      '': { name: 'root' },
      'node_modules/floaty': { version: '^1.0.0', resolved: 'https://registry.npmjs.org/floaty/-/floaty-1.0.0.tgz', integrity: 'sha512-x' },
      'node_modules/naked': { version: '2.0.0', resolved: 'https://registry.npmjs.org/naked/-/naked-2.0.0.tgz' },
    },
  }));
  const r = verifyLockfileProvenance(f);
  const codes = r.findings.map((x) => x.code).sort();
  assert.deepEqual(codes, ['MISSING_INTEGRITY', 'NON_EXACT_VERSION']);
});

test('SUPPLY CHAIN: a missing lockfile fails closed rather than passing vacuously', () => {
  const r = verifyLockfileProvenance(path.join(tmpdir(), `no-lock-${Date.now()}.json`));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'LOCKFILE_MISSING');
  assert.ok(TRUSTED_REGISTRIES.includes('registry.npmjs.org'));
});

/* ------------------------------------------------------------------ secrets */

test('SECRETS: real credential shapes are caught, and the secret is NEVER echoed back', () => {
  const key = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const out = scanForSecrets(`line one\nkey: ${key}\nline three`);
  assert.equal(out.clean, false);
  assert.equal(out.findings[0].patternId, 'AWS_ACCESS_KEY');
  assert.equal(out.findings[0].line, 2);
  // a scanner that logs what it found has moved the secret, not caught it
  assert.equal(JSON.stringify(out).includes(key), false);
});

test('SECRETS: ordinary source code is clean', () => {
  assert.equal(scanForSecrets('const answer = 42;\nexport default answer;').clean, true);
  assert.equal(scanForSecrets('').clean, true);
  assert.equal(scanForSecrets(null).clean, true);
});

test('SECRETS: a private key block is caught', () => {
  // ASSEMBLED, NOT WRITTEN OUT. The repository's own P0.4 scanner
  // (envContract.test.mjs) greps the whole tree for secret-shaped material,
  // and a test that spells the header literally is itself such material — this
  // file failed that scan until the header was built at runtime. A fixture for
  // a secret detector must not be a secret, which is the same reason the AWS
  // key below is concatenated rather than typed.
  const header = (kind) => `${'-'.repeat(5)}BEGIN ${kind}PRIVATE KEY${'-'.repeat(5)}`;
  assert.equal(scanForSecrets(header('RSA ')).findings[0].patternId, 'PRIVATE_KEY');
  assert.equal(scanForSecrets(header('')).findings[0].patternId, 'PRIVATE_KEY');
  assert.equal(scanForSecrets(header('EC ')).findings[0].patternId, 'PRIVATE_KEY');
});
