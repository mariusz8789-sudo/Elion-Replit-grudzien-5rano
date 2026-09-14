#!/usr/bin/env node
/**
 * LOWER-HARM FULL FUNNEL — mandate step 10, part 3 (docs/DECISIONS.md D-050).
 * TOP10 -> TOP2 -> frozen falsification -> G2 -> adjudication -> comparison
 * -> WINNER | NO_WINNER. Runtime evidence independent of the vitest suite.
 *
 *   node scripts/gov-drug-lower-harm-funnel-demonstrator.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-lower-harm-funnel-'));
const out = path.join(bundleDir, 'funnel.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/govDrugLowerHarmFunnel.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('GENESIS — GOV-DRUG-DISCOVERY-E2E-02-LOWER-HARM — FULL FUNNEL');
console.log(`node ${process.version}\n`);

const r = mod.runLowerHarmFunnel();

console.log(`CANDIDATE POOL: ${r.candidatePool.total} real, mechanism-generated candidates\n`);

console.log('HARD FILTER (efficacy floor + safety veto):');
console.log(`  qualifying: ${r.hardFilter.qualifying.length}  eliminated: ${r.hardFilter.eliminated.length}\n`);

console.log('DIVERSITY / REDUNDANCY CHECK:');
console.log(`  distinct mechanism classes among qualifiers: ${r.diversity.distinctMechanismClasses}`);
for (const g of r.diversity.sameSignatureGroups) console.log(`  same-signature group (not collapsed): ${g.join(', ')}`);
console.log();

console.log(`TOP${r.top10.cap} (filled ${r.top10.filled}):`);
for (const c of r.top10.candidates) console.log(`  ${c.report.summary.prefName} (${c.report.summary.moleculeChemblId})  score ${c.lowerHarmScore?.toFixed(4)}`);
console.log();

console.log('TOP2:');
for (const c of r.top2.candidates) console.log(`  ${c.report.summary.prefName} (${c.report.summary.moleculeChemblId})`);
for (const e of r.top2.excluded) console.log(`  excluded: ${e.candidateId} — ${e.reason}`);
console.log();

console.log('FROZEN FALSIFICATION CRITERIA (before G2 ran):');
console.log(`  ${JSON.stringify(r.falsificationCriteria)}\n`);

console.log('G2 FALSIFICATION:');
console.log(`  outcome: ${r.g2Result.outcome}`);
if (r.g2Result.outcome === 'EXPERIMENT_SELECTED') {
  console.log(`  observable: ${r.g2Result.spec.observableId}  falsificationPower: ${(r.g2Result.spec.falsificationPower * 100).toFixed(0)}%  unresolvedPairs: ${r.g2Result.spec.unresolvedPairs.length}`);
  for (const e of r.g2Result.spec.expectedOutcomePerHypothesis) console.log(`    ${e.hypothesisId}: expected ${e.expectedOutcome.toPrecision(4)}`);
} else {
  console.log(`  reason: ${r.g2Result.reason}`);
}
console.log();

console.log('ADJUDICATION (safety/governance gate per TOP2 candidate):');
for (const a of r.adjudicated) console.log(`  ${a.candidateId}: ${a.decision.outcome}${a.decision.failures.length > 0 ? ` (${a.decision.failures.map((f) => f.criterion).join(', ')})` : ''}`);
console.log();

console.log('VERDICT:', r.verdict.label);
console.log('WINNER:', r.verdict.winnerId ?? '(none)');
console.log('WHY:');
for (const c of r.verdict.conjuncts) console.log(`  [${c.held ? 'HELD' : 'FAILED'}] ${c.criterion}: ${c.detail}`);
console.log(`\n${r.verdict.reason}\n`);

console.log('runFingerprint:', r.runFingerprint);

const checks = [];
function record(name, ok) {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
}
console.log('\nINVARIANT CHECKS:');
record('never a forced winner: label matches the conjunct evaluation exactly', (r.verdict.label === 'WINNER') === r.verdict.conjuncts.every((c) => c.held));
record('deterministic across two independent runs', mod.runLowerHarmFunnel().runFingerprint === r.runFingerprint);
record('TOP10 never exceeds its cap', r.top10.candidates.length <= r.top10.cap);
record('TOP2 never exceeds 2', r.top2.candidates.length <= 2);
record('diversity check never eliminates a candidate (signatures.length === qualifying.length)', r.diversity.signatures.length === r.hardFilter.qualifying.length);

const allOk = checks.every((c) => c.ok);
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — ${checks.filter((c) => c.ok).length}/${checks.length} invariants held.`);
process.exit(allOk ? 0 : 1);
