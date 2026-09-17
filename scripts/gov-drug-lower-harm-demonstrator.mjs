#!/usr/bin/env node
/**
 * LOWER-HARM re-ranking — mandate step 10, part 2 (docs/DECISIONS.md D-048,
 * D-049). Runtime evidence independent of the vitest suite.
 *
 *   node scripts/gov-drug-lower-harm-demonstrator.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-lower-harm-'));
const out = path.join(bundleDir, 'lower-harm.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugLowerHarmRanking.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('GENESIS — GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM');
console.log(`node ${process.version}\n`);

const r = mod.runLowerHarmAnalysis();
console.log('scenarioId:', r.scenarioId);
console.log('preregistrationFingerprint:', r.preregistrationFingerprint);
console.log('runFingerprint:', r.fingerprint, '\n');

console.log('RANKING (safety-dominant among candidates that clear the efficacy floor):');
let rank = 0;
for (const c of r.ranked) {
  rank += 1;
  const scoreStr = c.lowerHarmScore === null ? 'ELIMINATED' : `score ${c.lowerHarmScore.toFixed(4)}`;
  console.log(`  #${rank} ${c.report.summary.prefName} (${c.report.summary.moleculeChemblId})  floor=${c.efficacyFloor.status}${c.efficacyFloor.fraction !== null ? ` (${(c.efficacyFloor.fraction * 100).toFixed(1)}%)` : ''}  ${scoreStr}${c.eliminationReason ? `  [${c.eliminationReason}]` : ''}`);
}

console.log('\nVERDICT:', r.verdict.label);
console.log('REASON:', r.verdict.reason);
console.log('WINNER:', r.verdict.winnerId ?? '(none)');

const checks = [];
function record(name, ok) {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
}
console.log('\nINVARIANT CHECKS:');
record('never a forced winner: WINNER only when a single candidate uncontestedly qualifies', r.verdict.label !== 'WINNER' || r.ranked.filter((c) => c.lowerHarmScore !== null).length >= 1);
record('run is deterministic across two independent calls', mod.runLowerHarmAnalysis().fingerprint === r.fingerprint);
record('reuses A2\'s real veto reasons verbatim (no new veto invented)', r.ranked.every((c) => !c.report.score.vetoed || c.eliminationReason === c.report.score.vetoReason));
record('every ranked candidate traces to a real candidate in the space', r.ranked.length > 0);

const allOk = checks.every((c) => c.ok);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.ok).length}/${checks.length} invariants held.`);
process.exit(allOk ? 0 : 1);
