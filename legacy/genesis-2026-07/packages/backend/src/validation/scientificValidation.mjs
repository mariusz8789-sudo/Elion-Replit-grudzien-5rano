/**
 * Scientific Validation metrics (Phase 2). Each function measures a REAL, reproducible property of
 * Genesis's computational methods and returns a structured, honest result. Ground-truth labels are
 * never invented: recovery metrics require a supplied labelled set and echo its `labelProvenance`
 * (EXPERIMENTAL / COMPUTATIONAL_CRITERION / TEST_FIXTURE) so the epistemic status is explicit. Where
 * a capability is unavailable the metric returns BLOCKED_BY_RUNTIME / BLOCKED_BY_RESOURCES.
 */
import { canonicalHash } from '../provenance.mjs';
import * as stats from '../benchmark/stats.mjs';
import { REFERENCE_MOLECULES } from './knownChemistry.mjs';

export const VALIDATION_VERSION = 'genesis-scientific-validation/1';

const round = (x, d = 6) => (typeof x === 'number' && Number.isFinite(x) ? +x.toFixed(d) : x);

/** Descriptor correctness: RDKit molWt vs first-principles reference (g/mol). */
export function descriptorAccuracy(descriptorsFn, { tolerance = 0.6, molecules = REFERENCE_MOLECULES } = {}) {
  const cases = []; const predicted = []; const reference = [];
  for (const m of molecules) {
    const d = descriptorsFn(m.smiles);
    if (!d.ok || typeof d.data?.molWt !== 'number') {
      if (d.error === 'BLOCKED_BY_RUNTIME') return { status: 'BLOCKED_BY_RUNTIME', metric: 'descriptorAccuracy', reason: d.reason };
      cases.push({ name: m.name, ok: false, error: d.error ?? 'no_molWt' });
      continue;
    }
    const absError = round(Math.abs(d.data.molWt - m.referenceMolWt), 4);
    predicted.push(d.data.molWt); reference.push(m.referenceMolWt);
    cases.push({ name: m.name, formula: m.formula, referenceMolWt: m.referenceMolWt, computedMolWt: d.data.molWt, absError, withinTolerance: absError <= tolerance });
  }
  const scored = cases.filter((c) => c.withinTolerance !== undefined);
  return {
    status: 'COMPLETED', metric: 'descriptorAccuracy', labelProvenance: 'DETERMINISTIC_CHEMISTRY',
    n: scored.length, tolerance,
    rmse: round(stats.rmse(predicted, reference), 4), mae: round(stats.mae(predicted, reference), 4),
    pearsonR: predicted.length >= 2 ? round(stats.pearsonR(predicted, reference)) : NaN,
    maxAbsError: scored.length ? Math.max(...scored.map((c) => c.absError)) : NaN,
    pass: scored.length > 0 && scored.every((c) => c.withinTolerance), cases,
  };
}

/** Reproducibility: run `runFn` `runs` times → require bit-identical canonical hashes. */
export function reproducibility(runFn, { runs = 3, label = 'run' } = {}) {
  if (runs < 2) throw new Error('reproducibility needs >= 2 runs');
  const hashes = [];
  for (let i = 0; i < runs; i++) hashes.push(canonicalHash(runFn()));
  return { status: 'COMPLETED', metric: 'reproducibility', label, runs, reproducible: hashes.every((h) => h === hashes[0]), hash: hashes[0], hashes };
}

/**
 * Ranking stability: run the ranking twice (optionally under a benign perturbation, e.g. shuffled
 * input order) and measure Spearman rank-correlation of the resulting item scores. Stable = 1.0.
 * `rankFnA/rankFnB` each return [{ id, score }].
 */
export function rankingStability(rankFnA, rankFnB) {
  const a = rankFnA(); const b = rankFnB();
  const bScore = new Map(b.map((r) => [r.id, r.score]));
  const xs = []; const ys = [];
  for (const r of a) { if (bScore.has(r.id)) { xs.push(r.score); ys.push(bScore.get(r.id)); } }
  const rho = xs.length >= 2 ? stats.spearmanRho(xs, ys) : NaN;
  const identicalOrder = a.length === b.length && a.every((r, i) => r.id === b[i]?.id);
  return { status: 'COMPLETED', metric: 'rankingStability', n: xs.length, spearmanRho: round(rho), identicalOrder, stable: identicalOrder || rho === 1 };
}

/**
 * Known-item recovery on a LABELLED ranking. `labeledSet`:
 *   { items:[{ id, label:boolean }], labelProvenance, criterion? }
 * `rankFn(items) -> [{ id, score }]` best-first. Computes precision/recall/Top-K, EF, ROC-AUC.
 */
export function rankingRecovery({ labeledSet, rankFn, ks = [1, 5, 10], enrichmentFractions = [0.1, 0.2] } = {}) {
  if (!labeledSet || !Array.isArray(labeledSet.items) || labeledSet.items.length === 0) {
    return { status: 'BLOCKED_BY_RESOURCES', metric: 'rankingRecovery', reason: 'no labelled reference set — real known-active recovery requires EXPERIMENTAL labels (never fabricated)' };
  }
  const totalPos = labeledSet.items.filter((i) => i.label).length;
  if (totalPos === 0 || totalPos === labeledSet.items.length) {
    return { status: 'BLOCKED_BY_RESOURCES', metric: 'rankingRecovery', reason: 'labelled set must contain both positives and negatives' };
  }
  const labelById = new Map(labeledSet.items.map((i) => [i.id, Boolean(i.label)]));
  const ranked = rankFn(labeledSet.items);
  const rankedLabels = ranked.map((r) => labelById.get(r.id) === true);
  const scores = ranked.map((r) => (typeof r.score === 'number' ? r.score : 0));
  const topK = {};
  for (const k of ks) topK[`top${k}`] = { precisionAtK: round(stats.precisionAtK(rankedLabels, k)), recallAtK: round(stats.recallAtK(rankedLabels, k)), hitAtK: stats.hitAtK(rankedLabels, k) };
  const enrichment = {};
  for (const f of enrichmentFractions) enrichment[`ef${Math.round(f * 100)}`] = round(stats.enrichmentFactor(rankedLabels, f));
  const p = stats.precisionAtK(rankedLabels, totalPos); const r = stats.recallAtK(rankedLabels, totalPos);
  return {
    status: 'COMPLETED', metric: 'rankingRecovery', labelProvenance: labeledSet.labelProvenance ?? 'UNSPECIFIED',
    criterion: labeledSet.criterion ?? null, n: labeledSet.items.length, positives: totalPos,
    precision: round(p), recall: round(r), f1: round(stats.f1Score(p, r)),
    topK, enrichment, rocAuc: round(stats.rocAuc(scores, rankedLabels)),
    note: labeledSet.labelProvenance === 'EXPERIMENTAL'
      ? 'metrics computed against EXPERIMENTAL labels — genuine known-active recovery'
      : 'metrics validate the ranking + recovery MACHINERY against non-experimental labels; real biological recovery requires EXPERIMENTAL labels',
  };
}

/** Truth Engine benchmark + consistency. `cases`: [{ name, proposal, expectedDecision }]. */
export function truthEngineBenchmark(cases, runTruth, { consistencyRuns = 2 } = {}) {
  const results = cases.map((c) => {
    const decisions = []; let error = null;
    try { for (let i = 0; i < consistencyRuns; i++) decisions.push(runTruth(c.proposal)?.decision ?? null); }
    catch (e) { error = String(e?.message ?? e); }
    const consistent = decisions.length > 0 && decisions.every((d) => d === decisions[0]);
    const actual = decisions[0] ?? null;
    return { name: c.name, expected: c.expectedDecision, actual, correct: actual === c.expectedDecision, consistent, error };
  });
  const scored = results.filter((r) => !r.error);
  return {
    status: 'COMPLETED', metric: 'truthEngineBenchmark', n: results.length,
    accuracy: scored.length ? round(scored.filter((r) => r.correct).length / scored.length) : NaN,
    consistency: scored.length ? round(scored.filter((r) => r.consistent).length / scored.length) : NaN,
    results,
  };
}

/** MCRE benchmark + consistency. `cases`: [{ name, input, expectConflict }]. `detectFn(input) -> conflicts[]`. */
export function mcreBenchmark(cases, detectFn, { consistencyRuns = 2 } = {}) {
  const results = cases.map((c) => {
    const counts = []; let error = null;
    try { for (let i = 0; i < consistencyRuns; i++) counts.push((detectFn(c.input) ?? []).length); }
    catch (e) { error = String(e?.message ?? e); }
    const consistent = counts.length > 0 && counts.every((n) => n === counts[0]);
    const detected = (counts[0] ?? 0) > 0;
    return { name: c.name, expectConflict: c.expectConflict, detected, conflicts: counts[0] ?? 0, correct: detected === c.expectConflict, consistent, error };
  });
  const scored = results.filter((r) => !r.error);
  return {
    status: 'COMPLETED', metric: 'mcreBenchmark', n: results.length,
    accuracy: scored.length ? round(scored.filter((r) => r.correct).length / scored.length) : NaN,
    consistency: scored.length ? round(scored.filter((r) => r.consistent).length / scored.length) : NaN,
    results,
  };
}
