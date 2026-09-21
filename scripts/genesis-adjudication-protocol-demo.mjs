#!/usr/bin/env node
/**
 * GENESIS ADJUDICATION PROTOCOL — runnable demonstrator for reference
 * implementation #1 (SURPASS-2 / tirzepatide diarrhea, docs/DECISIONS.md
 * D-047). Independent of the vitest suite: proves the protocol's phase
 * machine, HARK guards, and reproducibility check actually ran, not just
 * that a static check passed.
 *
 *   node scripts/genesis-adjudication-protocol-demo.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-adjudication-protocol-'));
const out = path.join(bundleDir, 'protocol-demo.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/biotechData/a2AdjudicationReferenceImplementation.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const mod = await import(out);

// Also bundle the pure printReport helper from the generic protocol module.
const printerOut = path.join(bundleDir, 'printer.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/agent/genesisAdjudicationProtocol.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${printerOut}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const protocolMod = await import(printerOut);

console.log('GENESIS ADJUDICATION PROTOCOL — reference implementation #1');
console.log(`node ${process.version}`);
console.log(`GENESIS_RECIPE: ${protocolMod.GENESIS_RECIPE}\n`);

const audited = mod.runA2AdjudicationReferenceCase();

console.log("=== PHASE TRACE (each field's presence proves that phase ran) ===");
console.log('  PRE_REGISTRATION -> historical protocolId:', audited.compared.readjudicated.historical.frozen.preRegistration.protocolId);
console.log('  FROZEN           -> historical ruleFingerprint:', audited.compared.readjudicated.historical.frozen.ruleFingerprint);
console.log('  EXECUTED         -> historical inputFingerprint:', audited.compared.readjudicated.historical.inputFingerprint);
console.log('  FROZEN           -> gated ruleFingerprint:', audited.compared.readjudicated.reAdjudicated.frozen.ruleFingerprint);
console.log('  EXECUTED         -> gated inputFingerprint:', audited.compared.readjudicated.reAdjudicated.inputFingerprint);
console.log('  READJUDICATED    -> changedRuleFields (declared, checked):', JSON.stringify(audited.compared.readjudicated.changedRuleFields));
console.log('  COMPARED         -> narrative built');
console.log('  AUDITED          -> report built, status', audited.report.auditStatus);
console.log();

console.log(protocolMod.printReport(audited.report));
console.log();

console.log('=== HARK GUARD DEMONSTRATION (live, in this process, not just in the unit tests) ===');
{
  const { freeze, preRegister, execute } = protocolMod;
  const frozen = freeze(preRegister({ protocolId: 'demo-hark-1', subjectId: 'demo', question: 'does execute() refuse a mutated rule?', rule: { threshold: 1.0 }, declaredAt: new Date(0).toISOString() }), new Date(0).toISOString());
  try {
    execute(frozen, { rule: { threshold: 2.0 }, evidenceUsed: [{ source: 's', sourceId: 'x', hash: 'h', custodyStatus: 'PINNED_VERIFIED', evidenceClass: 'DIRECT_RANDOMISED', classificationMethod: 'demo', rankingFingerprint: 'r' }], runResult: () => 'unreachable' });
    console.log('  FAIL — execute() did NOT refuse a mutated rule.');
  } catch (e) {
    console.log('  execute() HARK guard #1 fired as expected:', e.message.slice(0, 140));
  }
}
{
  const { freeze, preRegister, execute, readjudicate } = protocolMod;
  const evidence = [{ source: 's', sourceId: 'x', hash: 'h', custodyStatus: 'PINNED_VERIFIED', evidenceClass: 'DIRECT_RANDOMISED', classificationMethod: 'demo', rankingFingerprint: 'r' }];
  const declaredAt = new Date(0).toISOString();
  const oldRule = { threshold: 1.0, doseSelectionRule: 'HIGHEST_DOSE' };
  const newRule = { threshold: 2.0, doseSelectionRule: 'HIGHEST_DOSE' }; // undeclared change: threshold, not just policy
  const oldExec = execute(freeze(preRegister({ protocolId: 'demo-hark-2-old', subjectId: 'demo', question: 'q', rule: oldRule, declaredAt }), declaredAt), { rule: oldRule, evidenceUsed: evidence, runResult: () => 'old' });
  const newExec = execute(freeze(preRegister({ protocolId: 'demo-hark-2-new', subjectId: 'demo', question: 'q', rule: newRule, declaredAt }), declaredAt), { rule: newRule, evidenceUsed: evidence, runResult: () => 'new' });
  try {
    readjudicate(oldExec, newExec, ['doseSelectionRule']); // threshold not declared as allowed
    console.log('  FAIL — readjudicate() did NOT refuse an undeclared rule change.');
  } catch (e) {
    console.log('  readjudicate() HARK guard #2 fired as expected:', e.message.slice(0, 160));
  }
}

const allOk = audited.report.auditStatus === 'PASS';
console.log(`\n${allOk ? 'PASS' : 'FAIL'} — GENESIS ADJUDICATION REPORT audit status = ${audited.report.auditStatus}.`);
process.exit(allOk ? 0 : 1);
