#!/usr/bin/env node
/**
 * Genesis — Benchmark & Reproducibility Suite (Priority A).
 *
 * Runs every real scientific-engine benchmark (RDKit, PySCF, OpenMM,
 * ADMET-AI, AutoDock Vina + Meeko, Biopython) against ground truth that is
 * either exact deterministic arithmetic, a physical/mathematical invariant,
 * or an explicitly-labeled publisher-reported metric — never a fabricated
 * number. Engines unavailable in this runtime report BLOCKED_BY_RUNTIME;
 * checks that need unreachable external data report BLOCKED_BY_RESOURCES.
 * Neither is a failure — both are honest, reported states.
 *
 * Usage:
 *   node scripts/benchmark-suite.mjs                 # full suite
 *   node scripts/benchmark-suite.mjs rdkit pyscf      # subset (fast iteration)
 *   node scripts/benchmark-suite.mjs --json           # machine-readable, full report to stdout
 *   node scripts/benchmark-suite.mjs --out report.json
 *
 * One reproducible command:  npm run benchmark
 */
import { writeFileSync } from 'node:fs';
import { runBenchmarkSuite } from '../packages/backend/src/benchmark/runner.mjs';

const bar = (t) => `\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`;

function parseArgs(argv) {
  const only = [];
  let json = false;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--out') out = argv[++i];
    else if (!a.startsWith('--')) only.push(a);
  }
  return { only: only.length ? only : undefined, json, out };
}

function fmtPct(x) {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'n/a';
}

function printHuman(report) {
  console.log(bar('GENESIS — BENCHMARK & REPRODUCIBILITY SUITE'));
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Content hash (sha256): ${report.contentHash}`);
  console.log(`Runtime: ${report.runtimeMs} ms\n`);

  for (const [id, r] of Object.entries(report.results)) {
    console.log(`--- ${id} (${r.engine ?? id}) ---`);
    if (r.blocker) {
      console.log(`  ${r.blocker}: ${r.reason ?? 'n/a'}`);
      continue;
    }
    for (const c of r.cases) {
      const mark = c.pass === true ? 'PASS' : c.pass === false ? 'FAIL' : c.ok ? 'INFO' : 'ERROR';
      const extra = c.blocker ? ` [${c.blocker}]` : '';
      console.log(`  [${mark}] ${c.id}${extra}`);
    }
    if (r.metrics) {
      for (const [k, v] of Object.entries(r.metrics)) {
        if (v && typeof v === 'object') continue; // nested detail — see --json for full report
        console.log(`    ${k}: ${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toPrecision(4)) : v}`);
      }
    }
    console.log('');
  }

  console.log(bar('SUMMARY'));
  console.log(`Engines run:            ${report.summary.engines.join(', ')}`);
  if (report.summary.enginesBlocked.length) {
    console.log('Engines blocked (honest, not a failure):');
    for (const b of report.summary.enginesBlocked) console.log(`  - ${b.id}: ${b.blocker} (${b.reason ?? 'n/a'})`);
  }
  console.log(`Total cases executed:   ${report.summary.totalCases}`);
  console.log(`Execution success rate: ${fmtPct(report.summary.executionSuccessRate)} (${report.summary.totalOk}/${report.summary.totalCases})`);
  console.log(`Overall pass rate:      ${fmtPct(report.summary.overallPassRate)} (${report.summary.totalPassed}/${report.summary.totalScored})`);
}

function main() {
  const { only, json, out } = parseArgs(process.argv.slice(2));
  const report = runBenchmarkSuite({ only });

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  if (out) {
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.error(`\nFull report written to ${out}`);
  }

  const failed = report.summary.totalScored > 0 && report.summary.totalPassed < report.summary.totalScored;
  process.exit(failed ? 1 : 0);
}

main();
