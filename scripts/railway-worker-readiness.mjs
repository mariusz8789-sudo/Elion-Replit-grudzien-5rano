#!/usr/bin/env node
/**
 * Genesis — Railway Scientific Worker Readiness CLI.
 *
 * Prints the read-only Railway worker readiness matrix (packages/backend/src/
 * compute/railwayWorkerReadiness.mjs) as JSON to stdout. Reuses the existing
 * canonical toolchain registry and data adapters; runs no new engine and adds
 * no new registry.
 *
 * Usage:
 *   node scripts/railway-worker-readiness.mjs                 # JSON to stdout
 *   node scripts/railway-worker-readiness.mjs --out report.json
 */
import { writeFileSync } from 'node:fs';
import { buildRailwayWorkerReadiness } from '../packages/backend/src/compute/railwayWorkerReadiness.mjs';

function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = argv[++i];
  }
  return { out };
}

function main() {
  const { out } = parseArgs(process.argv.slice(2));
  const report = buildRailwayWorkerReadiness();
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  if (out) {
    writeFileSync(out, json);
    console.error(`\nFull report written to ${out}`);
  }
}

main();
