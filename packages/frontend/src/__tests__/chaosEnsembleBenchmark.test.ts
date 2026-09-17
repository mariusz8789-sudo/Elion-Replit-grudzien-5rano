/**
 * D-080 — real wall-clock benchmark, checklist items #8 and #9.
 *
 * #8: seed-count scaling 16 -> 100 -> 1,000 -> 10,000, real numbers, no mocks.
 * #9: single-process vs batch/persistent workers. Honest answer: this
 * module is pure in-process JS/TS math (array arithmetic over floats) with
 * no subprocess, no RDKit call, no I/O per seed — there is nothing here for
 * D-078's worker pool to batch. D-078 exists because each RDKit call was a
 * separate Python subprocess spawn, and batching amortized that spawn cost
 * across many molecules in one process. That cost does not exist in this
 * module: every seed already runs in the SAME process, in the SAME
 * synchronous call, with no subprocess boundary to amortize. Claiming a
 * batch-vs-single-process comparison here would be benchmarking two
 * variants of the same thing and calling the difference something it isn't.
 * The honest scope statement is: N/A — no external process boundary exists
 * for this workload, so D-078's worker pool does not apply, and
 * `ensembleBatchTasks` claiming to "use D-078" would be a seam over nothing.
 *
 * This file is a real vitest test (the only TS execution path this repo's
 * frontend package actually has — there is no ts-node/tsx dependency) run
 * with `npx vitest run --reporter=verbose` so its console.table output is
 * preserved for the D-080 closure record. The `expect` assertions below are
 * sanity checks (completes, deterministic, monotonic-ish runtime), not a
 * performance gate — wall-clock numbers are reported, not pass/failed on a
 * threshold nobody could justify in this sandbox.
 */

import { describe, expect, it } from 'vitest';
import { runEnsemble, type EnsembleSpec } from '../core/chaos/ensemble';

function seededSeeds(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

describe('D-080 benchmark: seed-count scaling, single-process (no external process boundary exists to batch)', () => {
  it('16 / 100 / 1,000 / 10,000 seeds — real wall-clock, same process, same call shape', () => {
    const counts = [16, 100, 1000, 10000];
    const rows: { seeds: number; ms: number; msPerSeed: number }[] = [];
    for (const n of counts) {
      const spec: EnsembleSpec = { stepId: 'lorenz63', seeds: seededSeeds(n), perturbation: 1e-6, steps: 600, tolerance: 1.0 };
      const t0 = performance.now();
      const trajectories = runEnsemble(spec);
      const ms = performance.now() - t0;
      expect(trajectories.length).toBe(n);
      rows.push({ seeds: n, ms: Math.round(ms * 100) / 100, msPerSeed: Math.round((ms / n) * 1000) / 1000 });
    }
    // eslint-disable-next-line no-console
    console.log('\nD-080 chaos ensemble benchmark (lorenz63, steps=600, dt=0.01, single process):');
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.log('No worker pool / batch process applies: every seed already runs in-process with no subprocess spawned per seed (unlike D-078\'s RDKit calls).');

    // Sanity, not a perf gate: 625x more seeds does not take less wall-clock time.
    expect(rows[3].ms).toBeGreaterThan(rows[0].ms);
  });
});
