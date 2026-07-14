import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { dominates, paretoFrontIndices, hypervolume2D, bestScalar } from './campaign/pareto.mjs';
import { analyzeAndDecide, DECISIONS, isStop } from './campaign/nextExperiment.mjs';

/** Rdzeń kampanii — czyste, deterministyczne funkcje (bez RDKit): Pareto + decyzje. */

describe('pareto', () => {
  test('dominates (minimization)', () => {
    assert.equal(dominates([1, 1], [2, 2]), true);
    assert.equal(dominates([1, 2], [2, 1]), false); // trade-off, no domination
    assert.equal(dominates([1, 1], [1, 1]), false); // equal, not strict
  });
  test('pareto front picks non-dominated', () => {
    const v = [[1, 4], [2, 2], [4, 1], [3, 3]]; // [3,3] dominated by [2,2]
    const idx = paretoFrontIndices(v).sort();
    assert.deepEqual(idx, [0, 1, 2]);
  });
  test('hypervolume is monotonic non-decreasing as points are added', () => {
    const ref = [5, 5];
    const a = hypervolume2D([[2, 3]], ref);
    const b = hypervolume2D([[2, 3], [3, 2]], ref);
    const c = hypervolume2D([[2, 3], [3, 2], [1, 4]], ref);
    assert.ok(b >= a, `b(${b}) >= a(${a})`);
    assert.ok(c >= b, `c(${c}) >= b(${b})`);
    // single point area = (5-2)*(5-3) = 6
    assert.equal(a, 6);
  });
  test('bestScalar returns min sum', () => {
    assert.equal(bestScalar([[1, 4], [2, 1]]), 3);
  });
});

describe('adaptive next-experiment decisions', () => {
  const base = {
    generation: 1,
    strategy: { transformationWeights: { 'add-methyl': 1, 'add-fluoro': 1 }, parentSelection: 'pareto' },
    history: [{ hypervolume: 1, bestScalar: 2 }, { hypervolume: 2, bestScalar: 1.5 }],
    budget: { maxGenerations: 10 },
    stopping: { patience: 2, minImprovement: 1e-3, diversityFloor: 0.15 },
  };

  test('disables a transformation with zero successes (and next strategy sets weight 0)', () => {
    const r = analyzeAndDecide({
      ...base,
      metrics: { hypervolume: 2, bestScalar: 1.5, paretoSize: 2, diversity: 0.5,
        transformationStats: { 'add-methyl': { attempts: 3, successes: 0, paretoContrib: 0 }, 'add-fluoro': { attempts: 3, successes: 2, paretoContrib: 1 } },
        rejections: {}, retainedCount: 5 },
    });
    assert.equal(r.decision, DECISIONS.DISABLE_LOW_VALUE_TRANSFORMATION);
    assert.equal(r.newStrategy.transformationWeights['add-methyl'], 0); // <-- realna zmiana wykonania
    assert.equal(r.newStrategy.transformationWeights['add-fluoro'], 1);
  });

  test('increases diversity when population diversity drops below floor', () => {
    const r = analyzeAndDecide({
      ...base,
      metrics: { hypervolume: 2, bestScalar: 1.5, paretoSize: 2, diversity: 0.05,
        transformationStats: { 'add-methyl': { attempts: 3, successes: 2, paretoContrib: 0 }, 'add-fluoro': { attempts: 3, successes: 2, paretoContrib: 1 } },
        rejections: {}, retainedCount: 5 },
    });
    assert.equal(r.decision, DECISIONS.INCREASE_DIVERSITY);
    assert.equal(r.newStrategy.parentSelection, 'diverse');
  });

  test('stops on resource limit (generation >= maxGenerations)', () => {
    const r = analyzeAndDecide({ ...base, generation: 10,
      metrics: { hypervolume: 2, bestScalar: 1.5, paretoSize: 2, diversity: 0.5, transformationStats: {}, rejections: {}, retainedCount: 5 } });
    assert.equal(r.decision, DECISIONS.STOP_RESOURCE_LIMIT);
    assert.equal(isStop(r.decision), true);
  });

  test('stops on stagnation (no hypervolume improvement over patience)', () => {
    const r = analyzeAndDecide({
      ...base, generation: 3,
      history: [{ hypervolume: 5 }, { hypervolume: 5 }, { hypervolume: 5 }],
      metrics: { hypervolume: 5, bestScalar: 1.5, paretoSize: 2, diversity: 0.5, transformationStats: {}, rejections: {}, retainedCount: 5 },
    });
    assert.equal(r.decision, DECISIONS.STOP_NO_IMPROVEMENT);
  });

  test('stops when objective threshold reached', () => {
    const r = analyzeAndDecide({ ...base,
      stopping: { ...base.stopping, objectiveThreshold: 1.0 },
      metrics: { hypervolume: 2, bestScalar: 0.5, paretoSize: 2, diversity: 0.5, transformationStats: {}, rejections: {}, retainedCount: 5 } });
    assert.equal(r.decision, DECISIONS.STOP_OBJECTIVE_REACHED);
  });
});
