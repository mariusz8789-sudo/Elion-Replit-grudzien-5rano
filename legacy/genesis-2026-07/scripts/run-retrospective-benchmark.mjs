#!/usr/bin/env node
/**
 * Execute the retrospective benchmark against a real pre-registration.
 *
 *   npm run benchmark:retrospective -- --prereg campaigns/retrospective-benchmark-001/preregistration.json --db packages/backend/data/corpus.db
 *
 * Runs `runBenchmark` for real, against whatever corpus actually exists at
 * --db. It does not build a corpus, does not skip disqualified targets quietly,
 * and does not round a null or a thrown error down into a plausible-looking
 * number. Whatever `runBenchmark` actually returns — including "every target
 * disqualified because the corpus is empty" — is written out verbatim.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openCorpus } from '../packages/backend/src/lookingGlass/store.mjs';
import { runBenchmark, formatReport } from '../packages/backend/src/lookingGlass/benchmark.mjs';
import { parsePreregistration } from '../packages/backend/src/lookingGlass/preregistration.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const preregPath = arg('prereg');
const dbPath = arg('db', ':memory:');
const outPath = arg('out', preregPath ? `${dirname(preregPath)}/benchmark-report.json` : null);

if (!preregPath) {
  console.error('Usage: npm run benchmark:retrospective -- --prereg <path/to/preregistration.json> [--db <corpus.db>] [--out <report.json>]');
  process.exit(2);
}

const preregText = readFileSync(preregPath, 'utf8');
const prereg = parsePreregistration(preregText, { ref: preregPath });
console.log(`Pre-registration loaded: ${prereg.targets.length} target(s), fingerprint ${prereg.fingerprint.slice(0, 16)}…, sha256 ${prereg.sha256.slice(0, 16)}…`);

const db = openCorpus(dbPath);
console.log(`Corpus opened at ${dbPath === ':memory:' ? '(in-memory — no persistent corpus exists)' : dbPath}.`);

let report;
try {
  report = runBenchmark(db, prereg.targets, {
    cutoffYear: prereg.cutoffYear,
    preregistration: prereg,
    nullControls: 20,
  });
} catch (err) {
  console.error(`\nrunBenchmark THREW rather than returning a result: ${err.message}`);
  console.error('This is reported as-is. A thrown error here is not a "0 hits" result — it means the');
  console.error('harness refused to compute one at all (e.g. a fail-closed guard on the vocabulary),');
  console.error('and that refusal is itself the honest output of this run.');
  const failure = { ok: false, thrown: err.message, preregistrationRef: preregPath, cutoffYear: prereg.cutoffYear, executedAt: new Date().toISOString() };
  if (outPath) { mkdirSync(dirname(outPath), { recursive: true }); writeFileSync(outPath, JSON.stringify(failure, null, 2) + '\n'); }
  console.log('\n' + JSON.stringify(failure, null, 2));
  process.exit(1);
}

console.log('\n' + formatReport(report));

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ executedAt: new Date().toISOString(), ...report }, null, 2) + '\n');
  console.log(`\nFull report written to ${outPath}`);
}
