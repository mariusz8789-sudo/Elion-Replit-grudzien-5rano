#!/usr/bin/env node
/**
 * GENESIS — emit the persisted, replay-verified LOWER-HARM WinnerRecord
 * (docs/DECISIONS.md D-116).
 *
 *   npm run winner-record:emit
 *
 * Runs the REAL, unmodified `runGovLowerHarmDiscovery({mode:'PRODUCTION'})`
 * through `replayGovLowerHarmDiscovery` (two independent runs), refuses to
 * write anything unless the two runs agree, then writes:
 *
 *   artifacts/lower-harm/winner-record.json        the WinnerRecord (or the NoWinnerBlocker)
 *   artifacts/lower-harm/research-recipe.json      the Research Recipe body (only when a WinnerRecord exists)
 *   artifacts/lower-harm/run-detail.json           candidate space, conjuncts, gate decisions, G2, evidence rows
 *   artifacts/lower-harm/replay-verification.json  both runs' audit/recipe/record fingerprints and the MATCH verdict
 *   artifacts/lower-harm/audit-seal.json           D-121: the SHA-256 seal of this verdict (last link of the chain)
 *   artifacts/lower-harm/audit-chain.json          D-121: the hash chain of every emitted verdict; each link commits to the previous digest
 *
 * The frontend test `__tests__/lowerHarmWinnerArtifact.test.ts` locks the
 * committed artifact to a live run: any change to data or rules that moves
 * the result fails that test until this script is deliberately re-run.
 *
 * Exit code 0 = replay MATCH and files written. Nothing here sets a winner —
 * a NO_WINNER run is written as such, with its blocker.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(REPO, 'artifacts', 'lower-harm');

const work = mkdtempSync(path.join(tmpdir(), 'genesis-winner-record-'));
const bundle = path.join(work, 'discovery.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/orchestrator/govLowerHarmDiscovery.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${bundle}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const discovery = await import(bundle);
const auditBundle = path.join(work, 'audit.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/audit/cryptoAudit.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${auditBundle}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const audit = await import(auditBundle);

console.log('GENESIS — LOWER-HARM WinnerRecord emit');
console.log(`node ${process.version}`);

const { ok, first, second } = await discovery.replayGovLowerHarmDiscovery({ mode: 'PRODUCTION' });
if (first.kind !== 'RUN' || second.kind !== 'RUN') {
  console.error(`EXECUTION_BLOCKED: ${first.kind === 'RUN' ? '' : first.error} ${second.kind === 'RUN' ? '' : second.error}`);
  process.exit(2);
}
const recordA = first.winnerRecord;
const recordB = second.winnerRecord;
// Compare the records by their own content fingerprint, not by raw JSON: the custody
// artifactId is re-minted by the store on every ingest of unchanged bytes (see
// govLowerHarmAdapters.ts::ingestEvidence) and is deliberately outside recordFingerprint.
const recordKey = (r) => (r === undefined ? 'none' : r.kind === 'WINNER_RECORD' ? `WINNER_RECORD:${r.recordFingerprint}` : `${r.kind}:${r.blockedAt}:${r.reason}`);
const recordMatch = recordKey(recordA) === recordKey(recordB);
console.log(`run A: verdict=${first.verdict} audit=${first.auditFingerprint} recipe=${first.recipeFingerprint ?? '-'} record=${recordA?.kind === 'WINNER_RECORD' ? recordA.recordFingerprint : recordA?.kind}`);
console.log(`run B: verdict=${second.verdict} audit=${second.auditFingerprint} recipe=${second.recipeFingerprint ?? '-'} record=${recordB?.kind === 'WINNER_RECORD' ? recordB.recordFingerprint : recordB?.kind}`);
const sealMatch = first.auditSeal?.sha256 === second.auditSeal?.sha256 && typeof first.auditSeal?.sha256 === 'string';
console.log(`seal A: sha256=${first.auditSeal?.sha256 ?? '-'}`);
console.log(`seal B: sha256=${second.auditSeal?.sha256 ?? '-'}`);
console.log(`replay: ${ok && recordMatch && sealMatch ? 'MATCH' : 'DRIFT'}`);
if (!ok || !recordMatch || !sealMatch) {
  console.error('Refusing to write an artifact from two runs that disagree.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
const write = (name, value) => { writeFileSync(path.join(OUT_DIR, name), JSON.stringify(value, null, 2) + '\n'); console.log(`  wrote ${path.relative(REPO, path.join(OUT_DIR, name))}`); };

write('winner-record.json', recordA);
write('run-detail.json', first.detail);
if (recordA?.kind === 'WINNER_RECORD') write('research-recipe.json', recordA.recipe);
write('replay-verification.json', {
  verdict: ok && recordMatch ? 'MATCH' : 'DRIFT',
  mode: 'PRODUCTION',
  runA: { verdict: first.verdict, winnerId: first.winner?.winnerId ?? null, auditFingerprint: first.auditFingerprint, recipeFingerprint: first.recipeFingerprint ?? null, recordFingerprint: recordA?.kind === 'WINNER_RECORD' ? recordA.recordFingerprint : null, stages: first.stages.length },
  runB: { verdict: second.verdict, winnerId: second.winner?.winnerId ?? null, auditFingerprint: second.auditFingerprint, recipeFingerprint: second.recipeFingerprint ?? null, recordFingerprint: recordB?.kind === 'WINNER_RECORD' ? recordB.recordFingerprint : null, stages: second.stages.length },
  stages: first.stages.map((s) => ({ stage: s.stage, status: s.status, fingerprint: s.fingerprint })),
  evidenceCustody: first.evidenceCustody === null ? null : { ok: first.evidenceCustody.ok, sourceId: first.evidenceCustody.sourceId, hash: first.evidenceCustody.record?.artifact?.hash ?? null, hashPolicy: first.evidenceCustody.record?.artifact?.hashPolicy ?? null },
});

// D-121 — chain this verdict's seal onto the committed ledger. A re-emit of an UNCHANGED
// verdict re-seals the same link (no duplicate); a changed verdict appends a new link that
// commits to the previous digest. Nothing is ever rewritten or dropped from the chain.
const chainPath = path.join(OUT_DIR, 'audit-chain.json');
const previousChain = existsSync(chainPath) ? JSON.parse(readFileSync(chainPath, 'utf8')) : [];
const previousCheck = await audit.verifyAuditChain(previousChain);
if (!previousCheck.ok) {
  console.error(`Refusing to extend a broken audit chain: ${previousCheck.reason} (link ${previousCheck.brokenAt})`);
  process.exit(3);
}
const snapshot = first.auditSeal.snapshot;
const last = previousChain.length > 0 ? previousChain[previousChain.length - 1] : null;
const unchanged = last !== null && JSON.stringify(last.snapshot) === JSON.stringify(snapshot);
const sealedAt = new Date().toISOString();
const chain = unchanged
  ? [...previousChain.slice(0, -1), await audit.sealAuditSnapshot(snapshot, previousChain.length > 1 ? previousChain[previousChain.length - 2] : null, sealedAt)]
  : [...previousChain, await audit.sealAuditSnapshot(snapshot, last, sealedAt)];
const chainCheck = await audit.verifyAuditChain(chain);
if (!chainCheck.ok) { console.error(`Audit chain failed to verify after sealing: ${chainCheck.reason}`); process.exit(3); }
const seal = chain[chain.length - 1];
write('audit-seal.json', seal);
write('audit-chain.json', chain);
console.log(`audit: sha256=${seal.sha256} chainIndex=${seal.chainIndex} previous=${seal.previousSha256 ?? 'none'} chain=${chain.length} link(s) ${unchanged ? '(verdict unchanged — link re-sealed)' : '(new link)'}`);

console.log(`\nOUTCOME: ${first.verdict}${recordA?.kind === 'WINNER_RECORD' ? ` — ${recordA.candidateName} (${recordA.winnerId}), gate ${recordA.gate.outcome}, recipe ${recordA.fingerprints.recipeFingerprint}` : ` — blocked at ${recordA?.blockedAt}`}`);
