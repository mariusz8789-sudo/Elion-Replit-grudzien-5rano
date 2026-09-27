#!/usr/bin/env node
/**
 * Genesis — Engine Readiness Audit CLI.
 *
 * Prints the read-only engine readiness report (packages/backend/src/compute/
 * engineReadinessReport.mjs) as JSON to stdout. Consumes the existing
 * toolchain registry and runtime probe; runs no new engine invocation.
 *
 * Usage:
 *   node scripts/engine-readiness-report.mjs                 # JSON to stdout
 *   node scripts/engine-readiness-report.mjs --out report.json
 */
import { writeFileSync } from 'node:fs';
import { buildEngineReadinessReport } from '../packages/backend/src/compute/engineReadinessReport.mjs';

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
  }
  return { out };
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  const report = buildEngineReadinessReport();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (out) {
    writeFileSync(out, json);
    console.error(`\nFull report written to ${out}`);
  }
}

main();
