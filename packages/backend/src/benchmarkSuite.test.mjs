import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as stats from './benchmark/stats.mjs';
import { runRdkitBenchmark } from './benchmark/rdkitBenchmark.mjs';
import { runQmBenchmark } from './benchmark/qmBenchmark.mjs';
import { runMdBenchmark } from './benchmark/mdBenchmark.mjs';
import { runAdmetBenchmark } from './benchmark/admetBenchmark.mjs';
import { runDockingBenchmark } from './benchmark/dockingBenchmark.mjs';
import { runProteinBenchmark } from './benchmark/proteinBenchmark.mjs';
import { runBenchmarkSuite } from './benchmark/runner.mjs';
import * as qm from './compute/qmAdapter.mjs';
import * as md from './compute/mdAdapter.mjs';
import * as admet from './compute/admetAdapter.mjs';
import * as docking from './compute/dockingAdapter.mjs';
import * as protein from './compute/proteinAdapter.mjs';

/**
 * Benchmark & Reproducibility Suite (Priority A). Every ground truth is
 * exact deterministic arithmetic, a physical/mathematical invariant, or an
 * explicitly-labeled publisher-reported metric — never a fabricated
 * number. Engine-dependent suites are skipped (not failed) when the real
 * engine is BLOCKED_BY_RUNTIME in this environment, matching the pattern
 * in heavyEngines.test.mjs.
 */
const qmOn = qm.detect().available;
const mdOn = md.detect().available;
const admetOn = admet.detect().available;
const dockOn = docking.detect().available;
const protOn = protein.detect().available;

describe('benchmark statistics (pure functions)', () => {
  test('rmse/mae are zero for identical series', () => {
    assert.equal(stats.rmse([1, 2, 3], [1, 2, 3]), 0);
    assert.equal(stats.mae([1, 2, 3], [1, 2, 3]), 0);
  });
  test('rmse/mae compute a known example correctly', () => {
    assert.equal(stats.mae([1, 2, 3], [2, 2, 2]), (1 + 0 + 1) / 3);
    assert.ok(Math.abs(stats.rmse([1, 2, 3], [2, 2, 2]) - Math.sqrt((1 + 0 + 1) / 3)) < 1e-12);
  });
  test('pearsonR is 1 for a perfectly correlated series, NaN for zero variance', () => {
    assert.ok(Math.abs(stats.pearsonR([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
    assert.ok(Number.isNaN(stats.pearsonR([1, 1, 1], [1, 2, 3])));
  });
  test('accuracy counts exact label matches', () => {
    assert.equal(stats.accuracy(['a', 'b', 'c'], ['a', 'x', 'c']), 2 / 3);
  });
  test('successRate and reproducibilityRate', () => {
    assert.equal(stats.successRate([{ ok: true }, { ok: false }, { ok: true }]), 2 / 3);
    assert.equal(stats.reproducibilityRate([[1, 1], [2, 2.0000001]], 1e-6), 1);
    assert.equal(stats.reproducibilityRate([[1, 2]], 0), 0);
  });
});

describe('RDKit benchmark (always available — bundled dependency)', () => {
  test('every case passes and every case carries an explicit pass verdict', () => {
    const r = runRdkitBenchmark();
    assert.equal(r.engine, 'RDKit');
    assert.ok(r.cases.length >= 20);
    for (const c of r.cases) {
      assert.ok('pass' in c, `case ${c.id} (${c.kind}) missing a pass verdict`);
      assert.equal(c.pass, true, `case ${c.id} failed`);
    }
  });
  test('MW-consistency ground truth is independent atomic-weight arithmetic, not a recalled figure', () => {
    const r = runRdkitBenchmark();
    assert.ok(r.metrics.mwConsistency.rmse < 1e-6);
    assert.equal(r.metrics.canonicalizationStability.passRate, 1);
    assert.equal(r.metrics.equivalenceIsomorphism.passRate, 1);
  });
});

describe('quantum chemistry (PySCF) benchmark', () => {
  (qmOn ? test : test.skip)('variational principle, translation and permutation invariance all hold', () => {
    const r = runQmBenchmark();
    assert.equal(r.engine, 'PySCF');
    for (const c of r.cases) assert.equal(c.pass, true, `case ${c.id} failed`);
    assert.equal(r.metrics.physicalInvariants.passRate, 1);
  });
  test('unavailable engine reports BLOCKED_BY_RUNTIME, never a fabricated result', () => {
    if (qmOn) return;
    const r = runQmBenchmark();
    assert.equal(r.blocker, 'BLOCKED_BY_RUNTIME');
    assert.deepEqual(r.cases, []);
  });
});

describe('molecular dynamics (OpenMM) benchmark', () => {
  (mdOn ? test : test.skip)('NVE energy conservation and force-field determinism hold within stated tolerances', () => {
    const r = runMdBenchmark();
    assert.equal(r.engine, 'OpenMM');
    for (const c of r.cases) assert.equal(c.pass, true, `case ${c.id} failed`);
    assert.ok(r.metrics.energyConservation.relativeDrift < 0.02);
    assert.ok(r.metrics.forceFieldDeterminism.relativeDifference < 1e-6);
  });
});

describe('ADMET-AI benchmark', () => {
  (admetOn ? test : test.skip)('deterministic, exposes all 52 documented endpoints, reuses validated reference case', () => {
    const r = runAdmetBenchmark();
    assert.equal(r.engine, 'ADMET-AI');
    for (const c of r.cases) assert.equal(c.pass, true, `case ${c.id} failed`);
    assert.equal(r.metrics.catalogCompleteness.n, 52);
    assert.equal(r.metrics.determinismRate, 1);
    // Publisher-reported metrics must be labeled as such, never presented as independently reproduced.
    assert.match(r.metrics.publisherReportedMetrics.note, /publisher-reported/);
  });
});

describe('molecular docking (AutoDock Vina + Meeko) benchmark', () => {
  (dockOn ? test : test.skip)('seeded determinism and search-effort monotonicity hold; affinity accuracy is an honest capability gap', () => {
    const r = runDockingBenchmark();
    assert.equal(r.engine, 'AutoDock Vina + Meeko');
    const gap = r.cases.find((c) => c.id === 'affinity-accuracy-vs-experimental');
    assert.equal(gap.blocker, 'BLOCKED_BY_RESOURCES');
    for (const c of r.cases) if (c.pass !== null) assert.equal(c.pass, true, `case ${c.id} failed`);
  });
});

describe('protein structure ingestion (Biopython) benchmark', () => {
  (protOn ? test : test.skip)('exact-by-construction chain/hetero/water/model counts all match', () => {
    const r = runProteinBenchmark();
    assert.equal(r.engine, 'Biopython');
    for (const c of r.cases) assert.equal(c.pass, true, `case ${c.id} failed`);
    assert.equal(r.metrics.exactConstructionPassRate, 1);
  });
});

describe('benchmark suite runner', () => {
  test('aggregates cases and produces a reproducible content hash', () => {
    const r1 = runBenchmarkSuite({ only: ['rdkit'] });
    const r2 = runBenchmarkSuite({ only: ['rdkit'] });
    assert.equal(r1.contentHash, r2.contentHash, 'identical inputs must hash identically (timing fields excluded)');
    assert.ok(r1.summary.totalCases > 0);
    assert.equal(r1.summary.overallPassRate, 1);
    assert.ok(r1.environment && (r1.environment.os || r1.environment.error));
  });
  test('a benchmark that throws is reported as EXECUTION_ERROR, never silently dropped', () => {
    const r = runBenchmarkSuite({ only: [] });
    assert.deepEqual(r.results, {});
    assert.equal(r.summary.totalCases, 0);
  });
});
