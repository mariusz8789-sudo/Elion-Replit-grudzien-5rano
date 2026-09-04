/**
 * Quantum chemistry (PySCF) benchmark (Priority A). Ground truth here is
 * physics/mathematics that MUST hold for any correct Hartree-Fock
 * implementation — never a recalled literature number (except the one
 * existing, already-vetted textbook anchor reused from qmAdapter's own
 * reference case):
 *
 *  - Variational principle: enlarging the basis set can only lower (or
 *    leave unchanged) the RHF energy, never raise it.
 *  - Translation invariance: rigid-translating a molecule must not change
 *    its energy (no external field in vacuum single-point QM).
 *  - Permutation invariance: relabeling identical atoms must not change
 *    the energy.
 *  - The bundled H2 RHF/STO-3G literature anchor (already validated
 *    elsewhere in the codebase) is reused here as one more benchmark case.
 */
import * as qm from '../compute/qmAdapter.mjs';
import { rmse } from './stats.mjs';

const H2_GEOM = [{ element: 'H', x: 0, y: 0, z: 0 }, { element: 'H', x: 0, y: 0, z: 0.74 }];
const H2O_GEOM = [
  { element: 'O', x: 0, y: 0, z: 0.1173 },
  { element: 'H', x: 0, y: 0.7572, z: -0.4692 },
  { element: 'H', x: 0, y: -0.7572, z: -0.4692 },
];

function translate(atoms, dx, dy, dz) {
  return atoms.map((a) => ({ element: a.element, x: a.x + dx, y: a.y + dy, z: a.z + dz }));
}

export function runQmBenchmark() {
  const t0 = Date.now();
  const cases = [];

  const d = qm.detect();
  if (!d.available) {
    return { engine: 'PySCF', cases: [], metrics: null, blocker: 'BLOCKED_BY_RUNTIME', reason: d.reason, runtimeMs: Date.now() - t0 };
  }

  // 1. Literature anchor (existing, already-validated H2 RHF/STO-3G reference case).
  const ref = qm.referenceCase();
  cases.push({
    id: 'h2-literature-anchor', kind: 'literature-anchor', ok: ref.ok, pass: ref.ok && ref.pass,
    energyHartree: ref.energyHartree, expected: ref.expected, tol: ref.tol,
    source: 'Standard RHF/STO-3G textbook value for H2 at 0.74 Å (reused from the existing PySCF adapter reference case)',
  });

  // 2. Variational principle: STO-3G (minimal) -> 6-31G (larger) must not raise the energy.
  for (const [id, geom, charge, spin] of [['h2', H2_GEOM, 0, 0], ['h2o', H2O_GEOM, 0, 0]]) {
    const small = qm.singlePoint({ atoms: geom, charge, spin, method: 'RHF', basis: 'sto-3g' });
    const large = qm.singlePoint({ atoms: geom, charge, spin, method: 'RHF', basis: '6-31g' });
    const ok = small.ok && large.ok;
    cases.push({
      id: `${id}-variational-sto3g-vs-631g`, kind: 'variational-principle', ok,
      pass: ok && large.data.energyHartree <= small.data.energyHartree + 1e-6,
      stoEnergy: ok ? small.data.energyHartree : null, largerBasisEnergy: ok ? large.data.energyHartree : null,
      law: 'variational theorem: E(larger basis) <= E(smaller basis)',
    });
  }

  // 3. Translation invariance: rigid shift must not change the energy (to numerical precision).
  {
    const base = qm.singlePoint({ atoms: H2O_GEOM, method: 'RHF', basis: 'sto-3g' });
    const shifted = qm.singlePoint({ atoms: translate(H2O_GEOM, 5.0, -3.0, 2.0), method: 'RHF', basis: 'sto-3g' });
    const ok = base.ok && shifted.ok;
    cases.push({
      id: 'h2o-translation-invariance', kind: 'translation-invariance', ok,
      pass: ok && Math.abs(base.data.energyHartree - shifted.data.energyHartree) < 1e-6,
      baseEnergy: ok ? base.data.energyHartree : null, shiftedEnergy: ok ? shifted.data.energyHartree : null,
      law: 'single-point energy in vacuum must be invariant under rigid translation',
    });
  }

  // 4. Permutation invariance: relabeling identical H atoms must not change the energy.
  {
    const a = qm.singlePoint({ atoms: H2_GEOM, method: 'RHF', basis: 'sto-3g' });
    const b = qm.singlePoint({ atoms: [H2_GEOM[1], H2_GEOM[0]], method: 'RHF', basis: 'sto-3g' });
    const ok = a.ok && b.ok;
    cases.push({
      id: 'h2-permutation-invariance', kind: 'permutation-invariance', ok,
      pass: ok && Math.abs(a.data.energyHartree - b.data.energyHartree) < 1e-9,
      law: 'relabeling identical atoms must not change the computed energy',
    });
  }

  const anchorCases = cases.filter((c) => c.kind === 'literature-anchor');
  const invariantCases = cases.filter((c) => c.kind !== 'literature-anchor');

  const metrics = {
    literatureAnchor: { n: anchorCases.length, passRate: anchorCases.filter((c) => c.pass).length / (anchorCases.length || 1), rmseVsExpected: rmse(anchorCases.filter((c)=>c.ok).map((c) => c.energyHartree), anchorCases.filter((c)=>c.ok).map((c) => c.expected)) },
    physicalInvariants: { n: invariantCases.length, passRate: invariantCases.filter((c) => c.pass).length / (invariantCases.length || 1) },
    successRate: cases.filter((c) => c.ok).length / cases.length,
  };

  return { engine: 'PySCF', cases, metrics, runtimeMs: Date.now() - t0 };
}
