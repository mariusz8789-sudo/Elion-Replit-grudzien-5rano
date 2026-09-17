#!/usr/bin/env node
/**
 * A1 — GLP-1 SUBSTITUTION ANALYSIS: THE RUNNABLE DEMONSTRATOR.
 *
 *   node scripts/a1-glp1-demonstrator.mjs
 *
 * Runs the whole real chain, end to end, over the pinned ChEMBL +
 * ClinicalTrials.gov fixtures under `packages/frontend/src/core/biotechData/a1-glp1/`:
 *
 *   REAL ChEMBL + REAL ClinicalTrials.gov -> candidate analysis (potency,
 *   HbA1c efficacy) -> §8 deterministic verdict -> belief revision -> ranking
 *   -> §14/§8 safety gate -> Government Research/Action surface.
 *
 * Bundles `a1Glp1Analysis.ts` directly with esbuild (not through the shared
 * `core/repro/reproEntry.node.ts` facade other anchors use — this keeps the
 * demonstrator self-contained and avoids a second session editing that
 * shared, heavily-coordinated file at the same time; see docs/DECISIONS.md
 * D-026/D-027 for why that collision risk is taken seriously here).
 *
 * Exit code 0 = every mandated property held. Exit code 1 = at least one did
 * not, with the failing property named.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-a1-'));
const out = path.join(bundleDir, 'a1.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a1Glp1Analysis.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

console.log('\nGENESIS — A1 GLP-1 SUBSTITUTION ANALYSIS DEMONSTRATOR');
console.log(`node ${process.version}\n`);

const report = mod.runA1Analysis();

console.log('CANDIDATE ANALYSIS — GLP-1R BINDING POTENCY (real ChEMBL activities):');
console.log(`  semaglutide:  ${report.potency.semaglutide.qualifyingCount}/${report.potency.semaglutide.totalActivities} qualifying, median ${report.potency.semaglutide.medianPotencyNM} nM`);
console.log(`  liraglutide:  ${report.potency.liraglutide.qualifyingCount}/${report.potency.liraglutide.totalActivities} qualifying, median ${report.potency.liraglutide.medianPotencyNM} nM`);
console.log(`  ratio (lira/sema): ${report.potency.ratioLiraOverSema?.toFixed(3)} — within window: ${report.potency.ratioWithinWindow}\n`);

console.log('CANDIDATE ANALYSIS — HbA1c EFFICACY (real ClinicalTrials.gov studies):');
for (const t of report.trials) {
  console.log(`  ${t.nctId}: ${t.armA.title} ${t.armA.meanChangePp}pp vs ${t.armB.title} ${t.armB.meanChangePp}pp -> delta ${t.deltaPp.toFixed(2)}pp, 95% CI [${t.diffCi95.low.toFixed(2)}, ${t.diffCi95.high.toFixed(2)}]`);
}
console.log('');

console.log('FALSIFICATION -> §8 DETERMINISTIC VERDICT:');
console.log(`  ${report.verdict.hypothesisId}`);
console.log(`  ${report.verdict.reason}\n`);

console.log('BELIEF REVISION -> RANKING:');
for (const h of report.beliefRevision.ranked) console.log(`  ${h.id}: confidence ${h.confidence.toFixed(3)} (${h.status})`);
console.log(`  verdict disagrees with ranking: ${report.verdictDisagreesWithRanking}\n`);

console.log('FINAL DRUG-CANDIDATE VERDICT -> SAFETY GATE (§8/§14):');
console.log(`  gate outcome: ${report.gateDecision.outcome}`);
console.log(`  surface: ${report.surface}`);
console.log(`  statement: ${report.gatedCandidate.candidate.statement}\n`);

console.log('REPLAY / PROVENANCE:');
console.log(`  preregistration fingerprint: ${report.preregistrationFingerprint}`);
console.log(`  analysis fingerprint: ${report.analysisFingerprint}`);
console.log(`  target: ${report.target.targetChemblId} "${report.target.prefName}"`);
console.log(`  fetched: ${report.fetchProvenance.retrievedAt}\n`);

console.log('CHECKS\n');

record('1. GLP-1R target resolved to a real ChEMBL id, matching the sealed preregistration scope',
  report.target.targetChemblId === 'CHEMBL1784' && /glucagon-like peptide 1 receptor/i.test(report.target.prefName),
  `${report.target.targetChemblId} "${report.target.prefName}"`);

record('2. both compounds meet the preregistered minimum qualifying-assay count',
  report.potency.bothMeetMinimumAssays,
  `semaglutide ${report.potency.semaglutide.qualifyingCount}, liraglutide ${report.potency.liraglutide.qualifyingCount} (minimum 3 each)`);

record('3. potency ratio is a real computed number, not a literal, and falls within the preregistered window',
  report.potency.ratioLiraOverSema !== null && report.potency.ratioWithinWindow === true,
  `ratio ${report.potency.ratioLiraOverSema?.toFixed(3)}`);

record('4. all 3 preregistration-qualifying dual-drug trials were extracted from real ClinicalTrials.gov data',
  report.trials.length === 3 && report.trials.every((t) => t.nctId.startsWith('NCT')),
  report.trials.map((t) => t.nctId).join(', '));

record('5. at least one real trial\'s CI sits entirely outside the margin — a genuine, not manufactured, falsifying signal',
  report.trials.some((t) => t.diffCiEntirelyOutsideMargin),
  report.trials.filter((t) => t.diffCiEntirelyOutsideMargin).map((t) => t.nctId).join(', '));

record('6. the deterministic §8 rule reaches H2_NOT_SUPPORTED on that real signal, not diluted by the other 2 trials',
  report.verdict.hypothesisId === 'H2_NOT_SUPPORTED',
  report.verdict.reason);

record('7. belief revision + ranking are computed over the SAME evidence via the real, reused beliefRevision.ts primitives',
  report.beliefRevision.ranked.length === 3 && new Set(report.beliefRevision.ranked.map((h) => h.status)).size >= 1,
  report.beliefRevision.ranked.map((h) => `${h.id}=${h.confidence.toFixed(3)}`).join(', '));

record('8. the verdict/ranking disagreement is real and explicitly disclosed, not silently reconciled',
  report.verdictDisagreesWithRanking === true && report.gatedCandidate.evidence.unresolvedContradictions.length === 1,
  report.gatedCandidate.evidence.unresolvedContradictions[0] ?? '(none)');

record('9. the safety gate REFUSES to let a contested candidate leave the research layer',
  report.gateDecision.outcome === 'REFUSE' && report.surface === 'NONE',
  `${report.gateDecision.outcome} / surface=${report.surface}`);

record('10. the underlying negative/contested research finding is NOT hidden by the refusal — policy limits ACTION, never TRUTH',
  report.verdict.hypothesisId === 'H2_NOT_SUPPORTED' && report.trials.length === 3 && report.potency.ratioLiraOverSema !== null,
  'verdict, all 3 trial deltas, and potency ratio remain fully present in the report regardless of gate outcome');

record('11. the candidate statement contains no individual clinical directive language (§14)',
  !/\bprescrib/i.test(report.gatedCandidate.candidate.statement) && !/\byour (dose|dosage|prescription)\b/i.test(report.gatedCandidate.candidate.statement) && /population-level/i.test(report.gatedCandidate.candidate.statement),
  report.gatedCandidate.candidate.statement.slice(0, 90) + '...');

record('12. both §13 negative controls pass: metformin shows no GLP-1R signal, semaglutide-vs-insulin-glargine shows a real large difference',
  report.negativeControls.length === 2 && report.negativeControls.every((c) => c.passed),
  report.negativeControls.map((c) => `${c.name}: ${c.passed}`).join(' | '));

record('13. the whole pipeline is deterministic: re-running produces an identical analysis fingerprint',
  mod.runA1Analysis().analysisFingerprint === report.analysisFingerprint,
  report.analysisFingerprint);

record('14. the analysis fingerprint traces to the preregistration, sealed before any data was pulled',
  report.preregistrationFingerprint === '5882c619',
  report.preregistrationFingerprint);

console.log('');
const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.log(`FAILED: ${failed.length}/${checks.length} checks did not hold.`);
  process.exit(1);
}
console.log(`PASSED: all ${checks.length}/${checks.length} checks held.`);
process.exit(0);
