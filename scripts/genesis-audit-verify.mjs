#!/usr/bin/env node
/**
 * GENESIS — verify the committed cryptographic audit trail (docs/DECISIONS.md D-121).
 *
 *   npm run audit:verify
 *
 * Recomputes SHA-256 over artifacts/lower-harm/audit-seal.json and every link of
 * artifacts/lower-harm/audit-chain.json, checks that the seal is the chain's last
 * link, and that the seal commits to the SAME fingerprints the other committed
 * artifacts carry (winner-record.json, replay-verification.json). Read-only.
 *
 * Exit code 0 = everything verifies. Any tampered byte in any file exits 1.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(REPO, 'artifacts', 'lower-harm');
const read = (name) => JSON.parse(readFileSync(path.join(DIR, name), 'utf8'));

const work = mkdtempSync(path.join(tmpdir(), 'genesis-audit-verify-'));
const bundle = path.join(work, 'audit.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/audit/cryptoAudit.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${bundle}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const audit = await import(bundle);

const seal = read('audit-seal.json');
const chain = read('audit-chain.json');
const record = read('winner-record.json');
const replay = read('replay-verification.json');

const checks = [];
const sealCheck = await audit.verifyAuditSeal(seal);
checks.push(['audit-seal.json digest', sealCheck.ok, sealCheck.reason]);
const chainCheck = await audit.verifyAuditChain(chain);
checks.push([`audit-chain.json (${chain.length} link(s))`, chainCheck.ok, chainCheck.ok ? null : `${chainCheck.reason} at link ${chainCheck.brokenAt}`]);
checks.push(['seal is the last chain link', chain.length > 0 && chain[chain.length - 1].sha256 === seal.sha256, null]);
checks.push(['seal.auditFingerprint == replay-verification runA', seal.snapshot.auditFingerprint === replay.runA.auditFingerprint, null]);
checks.push(['seal.recipeFingerprint == replay-verification runA', seal.snapshot.recipeFingerprint === replay.runA.recipeFingerprint, null]);
const recordFp = record?.kind === 'WINNER_RECORD' ? record.recordFingerprint : null;
checks.push(['seal.record == winner-record.json', (seal.snapshot.record?.kind === 'WINNER_RECORD' ? seal.snapshot.record.recordFingerprint : null) === recordFp && (seal.snapshot.record?.kind ?? null) === (record?.kind ?? null), null]);
checks.push(['seal.custody.hash == replay-verification custody', (seal.snapshot.custody?.hash ?? null) === (replay.evidenceCustody?.hash ?? null), null]);
checks.push(['seal.stages == replay-verification stages', JSON.stringify(seal.snapshot.stages) === JSON.stringify(replay.stages), null]);

console.log('GENESIS — audit trail verification (D-121)');
let ok = true;
for (const [name, pass, reason] of checks) {
  ok &&= pass;
  console.log(`  ${pass ? 'OK  ' : 'FAIL'} ${name}${reason ? ` — ${reason}` : ''}`);
}
console.log(`\nseal sha256 ${seal.sha256}\nchain index ${seal.chainIndex} previous ${seal.previousSha256 ?? 'none'} sealedAt ${seal.sealedAt ?? '-'}\nverdict ${seal.snapshot.verdict} ${seal.snapshot.record?.kind === 'WINNER_RECORD' ? `${seal.snapshot.record.candidateName} (${seal.snapshot.record.winnerId}) gate ${seal.snapshot.record.gateOutcome}` : seal.snapshot.record?.kind ?? 'no record'}`);
console.log(`\nAUDIT_TRAIL: ${ok ? 'VERIFIED' : 'BROKEN'}`);
process.exit(ok ? 0 : 1);
