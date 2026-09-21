#!/usr/bin/env node
/**
 * VIRTUAL SPLIT-BRAIN LAB — demonstrator.
 *
 * Runs the classic paradigms, then runs the refusal: the consciousness
 * question is NOT adjudicated, and the circularity that forbids adjudicating
 * it is demonstrated by flipping the one switch the simulator has.
 *
 *   node scripts/splitbrain-e2e.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleDir = mkdtempSync(path.join(tmpdir(), 'genesis-splitbrain-'));
const out = path.join(bundleDir, 'splitbrain.mjs');
execFileSync(path.join(REPO, 'node_modules/.bin/esbuild'), [
  path.join(REPO, 'packages/frontend/src/core/neuro/splitBrainExperiments.ts'),
  '--bundle', '--format=esm', '--platform=node', '--target=node22', '--log-level=error', `--outfile=${out}`,
], { cwd: REPO, stdio: ['ignore', 'ignore', 'inherit'] });
const m = await import(out);

console.log('GENESIS — VIRTUAL SPLIT-BRAIN LAB (SIMULATION / TOY — not a clinical model)');
console.log(`node ${process.version}\n`);

const row = (name, r) => console.log(
  `  ${name.padEnd(34)} verbal=${String(r.verbal).padEnd(8)} leftHand=${String(r.leftHand).padEnd(8)} confab=${String(r.confabulation)}`,
);

console.log('CLASSIC PARADIGMS');
row('severed + LVF "KEY"', m.runLateralisedWord('KEY', 'LVF', m.SEVERED));
row('severed + RVF "KEY"', m.runLateralisedWord('KEY', 'RVF', m.SEVERED));
row('severed chimeric HE|ART', m.runChimeric('HE', 'ART', m.SEVERED));
row('INTACT control + LVF "KEY"', m.runLateralisedWord('KEY', 'LVF', m.INTACT));
row('INTACT chimeric HE|ART', m.runChimeric('HE', 'ART', m.INTACT));
row('severed, interpreter lesioned', m.runLateralisedWord('KEY', 'LVF', m.SEVERED_NO_INTERPRETER));
const action = m.runInterpreterAction('pick-apple', m.SEVERED);
console.log(`\n  interpreter narrative: ${String(action.interpreterNarrative)}`);

console.log('\nTOY SELF-CONSISTENCY (these can fail)');
let allHold = true;
for (const check of m.checkToyConsistency()) {
  allHold = allHold && check.holds;
  console.log(`  ${check.holds ? 'HOLDS  ' : 'BROKEN '} ${check.name}`);
  if (!check.holds) console.log(`          ${check.detail}`);
}

console.log('\nCONSCIOUSNESS QUESTION');
for (const v of m.adjudicateConsciousness()) {
  console.log(`  ${v.hypothesisId.padEnd(32)} ${v.verdict}`);
  console.log(`      because: ${v.reason}`);
}
const probe = m.probeCircularity();
console.log('\nWHY IT IS NOT ADJUDICATED (demonstrated, not asserted)');
console.log(`  observation            : ${probe.observation}`);
console.log(`  under severed          : ${probe.underSevered}`);
console.log(`  under intact           : ${probe.underIntact}`);
console.log(`  determined by config   : ${probe.determinedByConfigAlone}  <- the "evidence" is the input we set`);

const verdictsClean = m.adjudicateConsciousness().every((v) => v.verdict === 'NOT_ADJUDICABLE_BY_THIS_SIMULATION');
console.log(`\nRESULT: ${allHold && verdictsClean ? 'CONSISTENT — paradigms reproduced, consciousness NOT adjudicated' : 'FAILED'}`);
process.exit(allHold && verdictsClean ? 0 : 1);
