/**
 * Scientific Validation benchmark — adapts the validation suite into the benchmark-runner shape so
 * `runBenchmarkSuite` aggregates it alongside the per-engine benchmarks. Each measured metric becomes
 * a case (ok = executed, pass = meets its acceptance criterion). No fabricated numbers.
 */
import { runValidationSuite } from '../validation/suite.mjs';

export function runValidationBenchmark() {
  const t0 = Date.now();
  const r = runValidationSuite({});
  const m = r.metrics;
  const cases = [];
  const push = (id, kind, ok, pass, extra = {}) => cases.push({ id, kind, ok, pass, ...extra });

  push('descriptor-correctness', 'accuracy', m.descriptorAccuracy.status === 'COMPLETED', m.descriptorAccuracy.pass === true, { mae: m.descriptorAccuracy.mae, pearsonR: m.descriptorAccuracy.pearsonR });
  for (const rep of m.reproducibility ?? []) push(`reproducibility-${rep.label}`, 'reproducibility', true, rep.reproducible === true, { hash: rep.hash });
  if (m.rankingStability?.status === 'COMPLETED') push('ranking-stability', 'stability', true, m.rankingStability.stable === true, { spearmanRho: m.rankingStability.spearmanRho });
  if (m.rankingRecovery?.status === 'COMPLETED') push('ranking-recovery', 'recovery', true, Number.isFinite(m.rankingRecovery.rocAuc), { rocAuc: m.rankingRecovery.rocAuc, labelProvenance: m.rankingRecovery.labelProvenance });
  push('truth-accuracy', 'truth', m.truth.status === 'COMPLETED', m.truth.accuracy === 1, { accuracy: m.truth.accuracy, consistency: m.truth.consistency });
  push('mcre-accuracy', 'mcre', m.mcre.status === 'COMPLETED', m.mcre.accuracy === 1, { accuracy: m.mcre.accuracy, consistency: m.mcre.consistency });

  return {
    engine: 'scientific-validation', cases,
    metrics: { readiness: r.readiness.overall, readinessBand: r.readiness.overallBand, enginesExecuted: r.enginesExecuted, blockedEngines: r.blockedEngines },
    validation: r, runtimeMs: Date.now() - t0,
  };
}
