/**
 * Benchmark & Reproducibility Suite runner (Priority A). Orchestrates every
 * per-engine benchmark on REAL adapters — no mocks, no fabricated numbers.
 * Each benchmark module independently reports BLOCKED_BY_RUNTIME (engine
 * missing) or BLOCKED_BY_RESOURCES (external data unreachable) rather than
 * inventing a result. The runner aggregates pass/fail counts and stamps the
 * report with runtime environment + a content hash for reproducibility
 * comparison across runs (Priority B groundwork).
 */
import { createHash } from 'node:crypto';
import { probeEnvironment } from '../compute/scienceEnv.mjs';
import { runRdkitBenchmark } from './rdkitBenchmark.mjs';
import { runQmBenchmark } from './qmBenchmark.mjs';
import { runMdBenchmark } from './mdBenchmark.mjs';
import { runAdmetBenchmark } from './admetBenchmark.mjs';
import { runDockingBenchmark } from './dockingBenchmark.mjs';
import { runProteinBenchmark } from './proteinBenchmark.mjs';
import { runValidationBenchmark } from './validationBenchmark.mjs';

const BENCHMARKS = [
  { id: 'rdkit', run: runRdkitBenchmark },
  { id: 'pyscf', run: runQmBenchmark },
  { id: 'openmm', run: runMdBenchmark },
  { id: 'admet', run: runAdmetBenchmark },
  { id: 'docking', run: runDockingBenchmark },
  { id: 'protein', run: runProteinBenchmark },
  { id: 'scientific-validation', run: runValidationBenchmark },
];

/** Strips non-deterministic timing fields (wall-clock ms varies run-to-run) before hashing. */
function stripTiming(value) {
  if (Array.isArray(value)) return value.map(stripTiming);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'runtimeMs') continue;
      out[k] = stripTiming(v);
    }
    return out;
  }
  return value;
}

function sha256(obj) {
  return createHash('sha256').update(JSON.stringify(stripTiming(obj))).digest('hex');
}

/**
 * Runs every engine's benchmark. `only` optionally restricts to a subset of
 * benchmark ids (e.g. ['rdkit', 'pyscf']) for fast local iteration.
 */
export function runBenchmarkSuite({ only } = {}) {
  const t0 = Date.now();
  const selected = only ? BENCHMARKS.filter((b) => only.includes(b.id)) : BENCHMARKS;
  const env = probeEnvironment();

  const results = {};
  for (const b of selected) {
    try {
      results[b.id] = b.run();
    } catch (err) {
      results[b.id] = { engine: b.id, cases: [], metrics: null, blocker: 'EXECUTION_ERROR', reason: String(err?.message ?? err).slice(0, 300) };
    }
  }

  let totalCases = 0; let totalOk = 0; let totalScored = 0; let totalPassed = 0;
  const blocked = [];
  for (const [id, r] of Object.entries(results)) {
    if (r.blocker) { blocked.push({ id, blocker: r.blocker, reason: r.reason }); continue; }
    for (const c of r.cases ?? []) {
      totalCases += 1;
      if (c.ok) totalOk += 1;
      if (c.pass !== null && c.pass !== undefined) { totalScored += 1; if (c.pass) totalPassed += 1; }
    }
  }

  const summary = {
    engines: selected.map((b) => b.id),
    enginesBlocked: blocked,
    totalCases, totalOk, totalScored, totalPassed,
    executionSuccessRate: totalCases ? totalOk / totalCases : NaN,
    overallPassRate: totalScored ? totalPassed / totalScored : NaN,
  };

  const report = {
    suite: 'Genesis Benchmark & Reproducibility Suite',
    generatedAt: new Date().toISOString(),
    environment: env.ok ? env.runtime : { error: env.error },
    results,
    summary,
    runtimeMs: Date.now() - t0,
  };
  report.contentHash = sha256({ results, summary });
  return report;
}
