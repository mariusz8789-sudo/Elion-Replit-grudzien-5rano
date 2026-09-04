/**
 * Molecular dynamics (OpenMM) benchmark (Priority A). Ground truth here is a
 * physical law and measured engine determinism — never a recalled
 * literature number:
 *
 *  - Energy conservation: a true NVE run (Verlet integrator, no thermostat)
 *    on an isolated Hamiltonian system must conserve total energy. Real
 *    drift is measured and reported, not assumed.
 *  - Force-field determinism: a single-point energy evaluation of an
 *    IDENTICAL, unminimized configuration must reproduce within a tight
 *    relative tolerance. Measured finding: PME's reciprocal-space FFT is
 *    not perfectly bit-exact run-to-run even single-threaded (~1e-8
 *    relative) — a documented floating-point limitation, so the pass bar
 *    is a tolerance, not bitwise equality.
 *  - The existing minimization + NVT reference case (energy must drop on
 *    minimization; NVT must hold temperature in a physical range) is reused
 *    as a third, independent case.
 *
 * Explicitly NOT claimed: bit-exact reproducibility of a MINIMIZED
 * configuration across independent runs. Measured directly during this
 * benchmark's construction: minimizing a disordered water box is a rugged,
 * near-degenerate energy landscape where floating-point-level rounding
 * differences (present even with single-threaded evaluation, from the PME
 * FFT above) can steer L-BFGS into a different local minimum, producing
 * total-energy differences of tens of kJ/mol between nominally identical
 * runs. That is real physics/numerics of high-dimensional minimization, not
 * an engine bug — asserting it as reproducible would be a fabricated claim.
 */
import * as md from '../compute/mdAdapter.mjs';

export function runMdBenchmark() {
  const t0 = Date.now();
  const cases = [];

  const d = md.detect();
  if (!d.available) {
    return { engine: 'OpenMM', cases: [], metrics: null, blocker: 'BLOCKED_BY_RUNTIME', reason: d.reason, runtimeMs: Date.now() - t0 };
  }

  // 1. NVE energy conservation (physical law).
  const nve = md.energyConservationCase({ steps: 600 });
  cases.push({
    id: 'nve-energy-conservation', kind: 'physical-law', ok: nve.ok, pass: nve.ok && nve.pass,
    relativeDrift: nve.ok ? nve.data.relativeDrift : null,
    maxAbsDriftKjmol: nve.ok ? nve.data.maxAbsDriftKjmol : null,
    law: nve.ok ? nve.law : null,
  });

  // 2. Force-field evaluation determinism (unminimized configuration, tight relative tolerance).
  const det = md.forceFieldDeterminismCase({});
  cases.push({
    id: 'force-field-determinism', kind: 'determinism', ok: det.ok, pass: det.ok && det.pass,
    relativeDifference: det.ok ? det.data.relativeDifference : null,
    tolerance: det.ok ? det.data.tolerance : null,
    note: 'unminimized single-point evaluation only — see module doc for why minimized-trajectory reproducibility is not claimed',
  });

  // 3. Existing minimization + NVT reference case, reused as a third independent check.
  const ref = md.referenceCase({ steps: 200 });
  cases.push({
    id: 'minimization-and-nvt-reference', kind: 'reference-case', ok: ref.ok, pass: ref.ok && ref.pass,
    potentialEnergyInitialKjmol: ref.ok ? ref.data.potentialEnergyInitialKjmol : null,
    potentialEnergyMinimizedKjmol: ref.ok ? ref.data.potentialEnergyMinimizedKjmol : null,
    temperatureK: ref.ok ? ref.data.temperatureK : null,
  });

  const metrics = {
    energyConservation: { relativeDrift: nve.ok ? nve.data.relativeDrift : null, pass: nve.ok && nve.pass, threshold: 0.02 },
    forceFieldDeterminism: { relativeDifference: det.ok ? det.data.relativeDifference : null, pass: det.ok && det.pass, tolerance: det.ok ? det.data.tolerance : null },
    successRate: cases.filter((c) => c.ok).length / cases.length,
    overallPassRate: cases.filter((c) => c.pass).length / cases.length,
  };

  return { engine: 'OpenMM', cases, metrics, runtimeMs: Date.now() - t0 };
}
