#!/usr/bin/env node
/**
 * GENESIS — D-063 GOVERNMENT SERVICES E2E.
 *
 *   node scripts/gov-wow-services-e2e.mjs
 *
 * THE THREE SHAPES OF "PROVE IT" a government buyer actually asks for, run
 * end to end against this repository's real pinned SURPASS-2 (NCT03987919)
 * bytes, through the real D-057 custody chain:
 *
 *   1. BASELINE COMPARISON  — is this candidate better than the incumbent?
 *   2. CLAIM AUDIT          — is this claim substantiated?
 *   3. PARAMETRIC TRIGGER   — did the pre-agreed condition occur?
 *
 * WHAT "PASS" MEANS HERE. Not "a favourable answer came back". PASS means
 * every property the run claims is actually demonstrated: real pinned bytes
 * in, real computed risk ratios (never a supplied scalar), evidence classes
 * COMPUTED rather than declared, rules frozen BEFORE any data is read, and a
 * certificate issued only where the evidence genuinely supports one. Two of
 * the three answers below are UNFAVOURABLE, and that is the point: a claim
 * that the real counts refuse comes back CONTRADICTED, and a trigger whose
 * condition did not occur comes back NOT_TRIGGERED.
 *
 * Exit 0 = every property held. Exit 1 = at least one did not.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok });
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

function bundle(entry, outName) {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-d063-'));
  const out = path.join(dir, outName);
  execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
    path.join(REPO, entry),
    '--bundle', '--format=esm', '--platform=node', '--target=node22',
    '--loader:.html=text', '--loader:.csv=text',
    '--log-level=error', `--outfile=${out}`,
  ], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
  return out;
}

const F = 'packages/frontend/src';
const runs = await import(bundle(`${F}/core/govServices/govServiceRuns.ts`, 'runs.mjs'));
const audit = await import(bundle(`${F}/core/govServices/govClaimAudit.ts`, 'audit.mjs'));
const trigger = await import(bundle(`${F}/core/govServices/govParametricTrigger.ts`, 'trigger.mjs'));
const comparisons = await import(bundle(`${F}/core/discoveryChallenge/d063DoseBaselineComparisons.ts`, 'comparisons.mjs'));
const gate = await import(bundle(`${F}/core/orchestrator/winnerGate.ts`, 'gate.mjs'));
const baseline = await import(bundle(`${F}/core/discoveryChallenge/baselineComparison.ts`, 'baseline.mjs'));

const now = () => '1970-01-01T00:00:00Z';

console.log('\nGENESIS — D-063 GOVERNMENT SERVICES E2E');
console.log(`node ${process.version}\n`);

/* ---------------------------------------------------------------- */
console.log('1. BASELINE COMPARISON — candidate vs the frozen incumbent, on real counted outcomes');
/* ---------------------------------------------------------------- */
const set = comparisons.d063DoseBaselineComparisons();
record('all three real dose strata compared', new Set(set.comparisons.map((c) => c.doseId)).size === 3, `${set.comparisons.length} comparisons, ${set.skipped.length} term/arm pair(s) skipped for zero events`);
record('every comparison is DIRECT_RANDOMISED, COMPUTED not declared', set.comparisons.every((c) => c.record.evidenceClass === 'DIRECT_RANDOMISED'));
record('every risk ratio came from the real Katz estimator', set.comparisons.every((c) => c.record.harm.derivationMethod === 'KATZ_LOG_RISK_RATIO'));
record('efficacy is reported null, never fabricated as zero', set.comparisons.every((c) => c.record.efficacy === null), 'SURPASS-2 efficacy is a continuous HbA1c mean — it supports no risk ratio');

const worst = comparisons.worstHarmPerDose(set);
for (const w of worst) {
  console.log(`        ${w.doseId}: worst harm RR ${w.riskRatio.toFixed(4)} on "${w.term}"`);
}
record('no dose clears the frozen harm rule on its worst term', worst.every((w) => w.riskRatio >= 1), 'frozen rule requires harm strictly below the baseline (RR < 1)');
record('every non-clearing comparison states WHY', set.comparisons.filter((c) => !c.record.betterPerFrozenRule).every((c) => c.record.ruleReasons.length > 0));

const inventory = baseline.toPromotionInventory(set.comparisons[0].record);
record('the D-057 inventory carries the comparison OWN class and event count', inventory.length === 1 && inventory[0].evidenceClass === set.comparisons[0].record.evidenceClass && inventory[0].observationCount === set.comparisons[0].record.harm.totalEvents);
record('a NO_WINNER adjudication is never promoted, however strong the inventory', gate.canPromoteToWinnerRecord({ adjudicationVerdict: 'NO_WINNER', inventory }).outcome === 'NO_PROMOTION');
record('the D-057 COMPUTATIONAL wall stands (99 observations still NO_PROMOTION)', gate.canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [{ evidenceClass: 'COMPUTATIONAL', observationCount: 99 }] }).outcome === 'NO_PROMOTION');

/* ---------------------------------------------------------------- */
console.log('\n2. CLAIM AUDIT — regulator-grade substantiation');
/* ---------------------------------------------------------------- */
console.log(`        CLAIM: "${runs.D063_CLAIM_TEXT}"`);
const blockedAudit = await audit.runClaimAudit({ mode: 'PRODUCTION', claimText: runs.D063_CLAIM_TEXT, sources: [runs.D063_SURPASS2_SOURCE], parseClaims: () => [], now });
record('a PRODUCTION run with no custody store/port FAILS CLOSED', blockedAudit.kind === 'EXECUTION_BLOCKED' && blockedAudit.code === 'INVALID_EVIDENCE_PROVENANCE');

const emptyClaim = await audit.runClaimAudit({ mode: 'SYNTHETIC_TEST_ONLY', claimText: '   ', sources: [], parseClaims: () => [], now });
record('an empty claim FAILS CLOSED — never certified for nothing', emptyClaim.kind === 'EXECUTION_BLOCKED' && emptyClaim.code === 'MALFORMED_PROBLEM');

const realAudit = await runs.runD063ClaimAudit({ now });
record('the real audit ran in PRODUCTION with verified custody', realAudit.kind === 'RUN' && realAudit.mode === 'PRODUCTION' && realAudit.evidenceCustody.every((c) => c.ok));
record('VERDICT = CONTRADICTED (the real counts refuse the claim)', realAudit.kind === 'RUN' && realAudit.verdict === 'CONTRADICTED', realAudit.kind === 'RUN' ? realAudit.evidence.map((e) => `${e.supports.toUpperCase()} ${e.evidenceClass} ${e.ref}`).join(' | ') : '');
record('NO certificate is issued for a contradicted claim', realAudit.kind === 'RUN' && realAudit.certificate === null);
record('provenance is stamped from custody, not from the parser', realAudit.kind === 'RUN' && realAudit.evidence.every((e) => e.hash !== 'SYNTHETIC_TEST_ONLY' && e.hashPolicy === runs.D063_SURPASS2_SOURCE.hashPolicy));

/* ---------------------------------------------------------------- */
console.log('\n3. PARAMETRIC TRIGGER — sovereign pre-agreed condition');
/* ---------------------------------------------------------------- */
console.log(`        RULE: max serious-AE rate across ${runs.D063_TRIGGER_RULE.window} randomised arms ${runs.D063_TRIGGER_RULE.relation} ${runs.D063_TRIGGER_RULE.threshold}`);
console.log('        (THE THRESHOLD IS A STATED DEMONSTRATION CONTRACT PARAMETER, not a regulatory or derived number)');

const badRule = await trigger.runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule: { ...runs.D063_TRIGGER_RULE, window: 0 }, sources: [runs.D063_SURPASS2_SOURCE], parseSeries: () => [1], now });
record('a nonsensical rule FAILS CLOSED before any data is read', badRule.kind === 'EXECUTION_BLOCKED' && badRule.code === 'INVALID_RULE');

const partial = await trigger.runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule: runs.D063_TRIGGER_RULE, sources: [runs.D063_SURPASS2_SOURCE], parseSeries: () => [0.99, 0.99], now });
record('a partial series returns INSUFFICIENT_DATA with NO certificate', partial.kind === 'RUN' && partial.verdict === 'INSUFFICIENT_DATA' && partial.certificate === null);

const realTrigger = await runs.runD063ParametricTrigger({ now });
record('the real trigger ran in PRODUCTION with verified custody', realTrigger.kind === 'RUN' && realTrigger.mode === 'PRODUCTION' && realTrigger.evidenceCustody.every((c) => c.ok));
record('VERDICT = NOT_TRIGGERED (the condition did not occur)', realTrigger.kind === 'RUN' && realTrigger.verdict === 'NOT_TRIGGERED', realTrigger.kind === 'RUN' ? `observed max ${realTrigger.observed.toFixed(5)} < threshold ${runs.D063_TRIGGER_RULE.threshold}` : '');
record('the certificate carries real custody hashes, not a synthetic marker', realTrigger.kind === 'RUN' && realTrigger.certificate.dataRefs.every((r) => r.hash !== 'SYNTHETIC_TEST_ONLY'));

const t2 = await runs.runD063ParametricTrigger({ now });
record('the run is deterministic — same bytes, same audit fingerprint', realTrigger.kind === 'RUN' && t2.kind === 'RUN' && realTrigger.auditFingerprint === t2.auditFingerprint);

const dataIndependent = await trigger.runParametricTrigger({ mode: 'SYNTHETIC_TEST_ONLY', rule: runs.D063_TRIGGER_RULE, sources: [runs.D063_SURPASS2_SOURCE], parseSeries: () => [0.5, 0.6, 0.7, 0.8], now });
record('the frozen rule fingerprint is IDENTICAL on data that flips the verdict', dataIndependent.kind === 'RUN' && dataIndependent.verdict === 'TRIGGERED' && dataIndependent.certificate.ruleFingerprint === realTrigger.certificate.ruleFingerprint, 'the seal cannot be data-dependent — that is what "frozen before the data" means');

/* ---------------------------------------------------------------- */
console.log('\nOUTCOME');
/* ---------------------------------------------------------------- */
const failed = checks.filter((c) => !c.ok);
console.log(`  BASELINE COMPARISON : no dose strata clears the frozen harm rule (worst RR >= 1 at every dose)`);
console.log(`  CLAIM AUDIT         : ${realAudit.kind === 'RUN' ? realAudit.verdict : realAudit.code} — no certificate`);
console.log(`  PARAMETRIC TRIGGER  : ${realTrigger.kind === 'RUN' ? realTrigger.verdict : realTrigger.code} — certificate issued, condition did not occur`);
console.log(`\n  ${checks.length - failed.length}/${checks.length} properties held.`);
if (failed.length > 0) {
  console.log('\n  FAILED:');
  for (const f of failed) console.log(`    - ${f.name}`);
  process.exit(1);
}
console.log('\n  PASS — every property this run claims is demonstrated on real pinned bytes.\n');
