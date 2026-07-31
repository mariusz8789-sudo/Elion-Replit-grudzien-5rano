/**
 * ADMET-AI (Chemprop D-MPNN ensemble) benchmark (Priority A). No PDBbind/TDC
 * raw dataset is downloadable from this runtime (egress-restricted), so
 * accuracy against held-out test compounds cannot be independently
 * reproduced here. What CAN be honestly checked, and is checked:
 *
 *  - Determinism: the ensemble runs in eval mode (no dropout); predicting
 *    the same SMILES twice must give identical values.
 *  - Endpoint-catalog completeness: the bundled model must expose the
 *    documented 52 TDC ADMET Benchmark Group endpoints.
 *  - Reference case (existing, already-validated aspirin case: execution +
 *    determinism + physicochemical cross-check against RDKit).
 *  - The model's OWN published per-endpoint benchmark metrics (AUROC/R²,
 *    Swanson et al. 2024) are surfaced AS-IS, explicitly labeled
 *    "publisher-reported" — never presented as independently reproduced by
 *    Genesis, because no held-out TDC test set is reachable from this
 *    runtime to reproduce them against.
 */
import * as admet from '../compute/admetAdapter.mjs';

const EXPECTED_ENDPOINT_COUNT = 52;
const DETERMINISM_SMILES = ['CC(=O)Oc1ccccc1C(=O)O', 'CCO', 'c1ccccc1'];

export function runAdmetBenchmark() {
  const t0 = Date.now();
  const cases = [];

  const d = admet.detect();
  if (!d.available) {
    return { engine: 'ADMET-AI', cases: [], metrics: null, blocker: 'BLOCKED_BY_RUNTIME', reason: d.reason, runtimeMs: Date.now() - t0 };
  }

  // 1. Reference case (existing, already-validated).
  const ref = admet.referenceCase();
  cases.push({ id: 'aspirin-reference-case', kind: 'reference-case', ok: ref.ok, pass: ref.ok && ref.pass, checks: ref.ok ? ref.checks : null });

  // 2. Endpoint-catalog completeness.
  const eps = admet.listEndpoints();
  cases.push({
    id: 'endpoint-catalog-completeness', kind: 'catalog-completeness', ok: eps.ok,
    pass: eps.ok && eps.endpoints.length === EXPECTED_ENDPOINT_COUNT,
    n: eps.ok ? eps.endpoints.length : null, expected: EXPECTED_ENDPOINT_COUNT,
  });

  // 3. Determinism: same SMILES predicted twice must match exactly (eval mode, no dropout).
  const p1 = admet.predict(DETERMINISM_SMILES);
  const p2 = admet.predict(DETERMINISM_SMILES);
  const detOk = p1.ok && p2.ok;
  const mismatches = [];
  if (detOk) {
    for (const smi of DETERMINISM_SMILES) {
      const a = p1.predictions[smi]; const b = p2.predictions[smi];
      for (const key of Object.keys(a ?? {})) {
        if (a[key] !== b[key]) mismatches.push({ smiles: smi, endpointId: key, run1: a[key], run2: b[key] });
      }
    }
  }
  cases.push({ id: 'prediction-determinism', kind: 'determinism', ok: detOk, pass: detOk && mismatches.length === 0, nCompared: DETERMINISM_SMILES.length, mismatches: mismatches.slice(0, 5) });

  // 4. Publisher-reported per-endpoint benchmark metrics (surfaced as-is, not reproduced here).
  const publisherMetrics = eps.ok
    ? eps.endpoints.filter((e) => e.publishedMetricValue != null).map((e) => ({ id: e.id, metric: e.publishedMetric, value: e.publishedMetricValue }))
    : [];

  const metrics = {
    catalogCompleteness: { n: eps.ok ? eps.endpoints.length : 0, expected: EXPECTED_ENDPOINT_COUNT, pass: eps.ok && eps.endpoints.length === EXPECTED_ENDPOINT_COUNT },
    determinismRate: detOk ? (DETERMINISM_SMILES.length * (eps.ok ? eps.endpoints.length : 0) - mismatches.length) / Math.max(1, DETERMINISM_SMILES.length * (eps.ok ? eps.endpoints.length : 0)) : NaN,
    publisherReportedMetrics: {
      n: publisherMetrics.length,
      meanAurocOrR2: publisherMetrics.length ? publisherMetrics.reduce((s, m) => s + m.value, 0) / publisherMetrics.length : null,
      source: 'ADMET-AI (Swanson et al. 2024, Bioinformatics) — TDC ADMET Benchmark Group leaderboard values bundled with the model; NOT reproduced from a held-out set by Genesis (TDC raw data is unreachable from this runtime)',
      note: 'publisher-reported, not independently verified',
    },
    successRate: cases.filter((c) => c.ok).length / cases.length,
  };

  return { engine: 'ADMET-AI', cases, metrics, runtimeMs: Date.now() - t0 };
}
