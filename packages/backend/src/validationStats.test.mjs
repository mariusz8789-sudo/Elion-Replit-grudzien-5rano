/**
 * Retrieval / ranking metrics (precision, recall, F1, P@K, R@K, hit@K, enrichment, ROC-AUC, Spearman)
 * added to benchmark/stats.mjs for the Scientific Validation Suite. Pure math — exact expected values.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as s from './benchmark/stats.mjs';

describe('retrieval metrics', () => {
  const ranked = [true, true, false, true, false, false, false, false, false, false]; // 3 positives of 10

  test('precision / recall / f1', () => {
    assert.equal(s.precision(3, 1), 0.75);
    assert.equal(s.recall(3, 1), 0.75);
    assert.equal(s.f1Score(0.75, 0.75), 0.75);
    assert.ok(Number.isNaN(s.precision(0, 0)));
  });

  test('confusionAtK / precisionAtK / recallAtK / hitAtK', () => {
    const c = s.confusionAtK(ranked, 5);
    assert.deepEqual({ tp: c.tp, fp: c.fp, fn: c.fn, tn: c.tn }, { tp: 3, fp: 2, fn: 0, tn: 5 });
    assert.equal(s.precisionAtK(ranked, 5), 0.6);
    assert.equal(s.recallAtK(ranked, 5), 1);
    assert.equal(s.hitAtK(ranked, 1), 1);
    assert.equal(s.hitAtK([false, false, true], 1), 0);
  });

  test('enrichmentFactor concentrates positives at the top', () => {
    // top 10% = 1 item, which is positive → observed 1.0 / baseline 0.3 = 3.333…
    assert.ok(Math.abs(s.enrichmentFactor(ranked, 0.1) - (1 / (3 / 10))) < 1e-9);
    // a random-order ranking gives EF ~ 1 at full fraction
    assert.equal(s.enrichmentFactor(ranked, 1), 1);
  });

  test('rocAuc: perfect ranking = 1, inverted = 0, ties handled', () => {
    const scores = [0.9, 0.85, 0.4, 0.8, 0.3, 0.2, 0.1, 0.05, 0.02, 0.01];
    assert.equal(s.rocAuc(scores, ranked), 1);
    assert.equal(s.rocAuc(scores.map((x) => -x), ranked), 0);
    assert.equal(s.rocAuc([1, 1, 1, 1], [true, false, true, false]), 0.5); // all ties → 0.5
    assert.ok(Number.isNaN(s.rocAuc([1, 2, 3], [true, true, true]))); // one class
  });

  test('spearmanRho: identical ranks = 1, reversed = -1', () => {
    assert.equal(s.spearmanRho([1, 2, 3, 4], [1, 2, 3, 4]), 1);
    assert.equal(s.spearmanRho([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  });
});
