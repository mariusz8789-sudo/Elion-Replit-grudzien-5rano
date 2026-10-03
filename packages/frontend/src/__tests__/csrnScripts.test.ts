import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Certificate } from '@genesis-os/csrn';
import { afterAll, describe, expect, it } from 'vitest';
import { REDOCK_EVIDENCE_PATH, verifyRedockEvidence, type GenesisPublicKeyFile } from '../core/reviewer/redockCertificate';

/**
 * The owner's key tooling exercised end to end with DISPOSABLE keys in a temp directory: keygen → sign → verify →
 * tamper → rotate. The production key is never generated here; the scripts refuse to run in CI, so the child
 * processes get an environment without CI markers (a disposable key written outside the repository, then deleted).
 */
const REPO = resolve(__dirname, '../../../..');
const dir = mkdtempSync(join(tmpdir(), 'genesis-csrn-script-'));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CI' && k !== 'GITHUB_ACTIONS')) as NodeJS.ProcessEnv;
const run = (script: string, args: string[], env = cleanEnv) => spawnSync('node', [join(REPO, 'scripts', script), ...args], { cwd: REPO, env, encoding: 'utf8' });
const pub = join(dir, 'public.json');
const wellKnown = join(dir, 'well-known.json');
const evidence = readFileSync(join(REPO, REDOCK_EVIDENCE_PATH), 'utf8');
const readKey = (): GenesisPublicKeyFile => JSON.parse(readFileSync(pub, 'utf8'));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('csrn-keygen / csrn-sign with disposable keys', () => {
  it('refuses to run in CI, so the production key can never be created there', () => {
    const r = run('csrn-keygen.mjs', ['--private-out', join(dir, 'ci.jwk'), '--public-out', pub, '--well-known-out', wellKnown], { ...cleanEnv, CI: 'true' });
    expect(r.status).toBe(2);
    expect(existsSync(join(dir, 'ci.jwk'))).toBe(false);
  });

  it('refuses a private key path inside the repository', () => {
    const r = run('csrn-keygen.mjs', ['--private-out', join(REPO, 'inside.private.jwk'), '--public-out', pub, '--well-known-out', wellKnown]);
    expect(r.status).toBe(2);
    expect(existsSync(join(REPO, 'inside.private.jwk'))).toBe(false);
  });

  it('keygen writes a 0600 private key outside the repository, an ACTIVE public file with a recomputable keyId, and never prints the private key', async () => {
    const priv = join(dir, 'k1.jwk');
    const r = run('csrn-keygen.mjs', ['--private-out', priv, '--public-out', pub, '--well-known-out', wellKnown]);
    expect(r.status, r.stderr).toBe(0);
    expect(statSync(priv).mode & 0o777).toBe(0o600);
    const key = readKey();
    expect(key.status).toBe('ACTIVE');
    expect(key.keyId).toMatch(/^[a-f0-9]{64}$/);
    expect(readFileSync(wellKnown, 'utf8')).toBe(readFileSync(pub, 'utf8'));
    const d = JSON.parse(readFileSync(priv, 'utf8')).d as string;
    expect(d.length).toBeGreaterThan(20);
    expect(r.stdout + r.stderr).not.toContain(d);
    expect(JSON.stringify(key)).not.toContain(d);
    const again = run('csrn-keygen.mjs', ['--private-out', join(dir, 'k1b.jwk'), '--public-out', pub, '--well-known-out', wellKnown]);
    expect(again.status, 'an ACTIVE key is not replaced without --rotate').toBe(2);
  });

  it('sign produces SIGNED_BY_GENESIS_KEY; a wrong private key, an edited file and a relabelled claim do not', async () => {
    const out = join(dir, 'cert.json');
    const signed = run('csrn-sign.mjs', ['--key', join(dir, 'k1.jwk'), '--public-key', pub, '--out', out]);
    expect(signed.status, signed.stderr).toBe(0);
    const certificate = JSON.parse(readFileSync(out, 'utf8')) as Certificate;
    const good = await verifyRedockEvidence(certificate, evidence, readKey());
    expect(good.signer).toBe('SIGNED_BY_GENESIS_KEY');
    expect(good.epistemicStatus).toBe('MODEL_ESTIMATE');

    const edited = evidence.replace(/"bestAffinityKcalMol"\s*:\s*-?[0-9.]+/, '"bestAffinityKcalMol": -99.9');
    expect(edited).not.toBe(evidence);
    expect((await verifyRedockEvidence(certificate, edited, readKey())).unaltered).toBe(false);
    const promoted = { ...certificate, claim: { ...certificate.claim, epistemicStatus: 'REAL_MEASUREMENT' } } as Certificate;
    expect((await verifyRedockEvidence(promoted, evidence, readKey())).auditVerdict).toBe('INTEGRITY_INVALID');

    const other = join(dir, 'other.jwk');
    expect(run('csrn-keygen.mjs', ['--private-out', other, '--public-out', join(dir, 'other-pub.json'), '--well-known-out', join(dir, 'other-wk.json')]).status).toBe(0);
    const wrong = run('csrn-sign.mjs', ['--key', other, '--public-key', pub, '--out', join(dir, 'wrong.json')]);
    expect(wrong.status).toBe(2);
    expect(existsSync(join(dir, 'wrong.json'))).toBe(false);
  });

  it('--rotate retires the old key (still verifies its window), the new key signs, and a REVOKED key verifies nothing', async () => {
    const oldCert = JSON.parse(readFileSync(join(dir, 'cert.json'), 'utf8')) as Certificate;
    const oldKeyId = readKey().keyId;
    const r = run('csrn-keygen.mjs', ['--rotate', '--private-out', join(dir, 'k2.jwk'), '--public-out', pub, '--well-known-out', wellKnown]);
    expect(r.status, r.stderr).toBe(0);
    const rotated = readKey();
    expect(rotated.keyId).not.toBe(oldKeyId);
    expect(rotated.previousKeys?.map((k) => [k.status, k.keyId])).toEqual([['RETIRED', oldKeyId]]);
    expect((await verifyRedockEvidence(oldCert, evidence, rotated)).signer).toBe('SIGNED_BY_GENESIS_KEY');
    const newOut = join(dir, 'cert2.json');
    expect(run('csrn-sign.mjs', ['--key', join(dir, 'k2.jwk'), '--public-key', pub, '--out', newOut]).status).toBe(0);
    const newCert = JSON.parse(readFileSync(newOut, 'utf8')) as Certificate;
    expect((await verifyRedockEvidence(newCert, evidence, rotated)).signer).toBe('SIGNED_BY_GENESIS_KEY');
    const revoked: GenesisPublicKeyFile = { ...rotated, previousKeys: rotated.previousKeys!.map((k) => ({ ...k, status: 'REVOKED' as const })) };
    expect((await verifyRedockEvidence(oldCert, evidence, revoked)).signer).toBe('SIGNED_UNTRUSTED');
  });
});
