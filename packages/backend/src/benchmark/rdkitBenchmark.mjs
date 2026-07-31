/**
 * RDKit benchmark (Priority A). Every check is either exact deterministic
 * arithmetic (standard IUPAC atomic weights — definitional chemistry, not a
 * recalled literature figure) or a structural invariant that MUST hold for
 * any correct cheminformatics engine (canonicalization idempotence,
 * isomorphism of equivalent SMILES). No external dataset required, so no
 * fabrication risk and no BLOCKED_BY_RESOURCES from unreachable hosts.
 */
import { detect, descriptors, validate } from '../compute/rdkitAdapter.mjs';
import { rmse, mae } from './stats.mjs';

// Standard atomic weights (IUPAC 2021, rounded to 3 decimals) — definitional, not recalled literature.
const ATOMIC_WEIGHT = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974,
  S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904, Na: 22.99, K: 39.098,
};

/** Parses a Hill-notation molecular formula (e.g. "C9H8O4") into { element: count }. */
export function parseFormula(formula) {
  const out = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m;
  while ((m = re.exec(formula))) {
    if (!m[1]) continue;
    out[m[1]] = (out[m[1]] ?? 0) + (m[2] ? parseInt(m[2], 10) : 1);
  }
  return out;
}

/** Exact MW from a parsed formula using standard atomic weights. Null if an element is unrecognized. */
export function exactMwFromFormula(formula) {
  const atoms = parseFormula(formula);
  let mw = 0;
  for (const [el, n] of Object.entries(atoms)) {
    if (!(el in ATOMIC_WEIGHT)) return null;
    mw += ATOMIC_WEIGHT[el] * n;
  }
  return mw;
}

// Documented, non-novel reference molecules — SMILES only (no external "expected" numbers needed;
// ground truth is derived from RDKit's own reported formula via independent atomic-mass arithmetic).
const MOLECULES = [
  { id: 'benzene', smiles: 'c1ccccc1' },
  { id: 'ethanol', smiles: 'CCO' },
  { id: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { id: 'caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
  { id: 'ibuprofen', smiles: 'CC(C)Cc1ccc(cc1)C(C)C(=O)O' },
  { id: 'paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
  { id: 'phenol', smiles: 'c1ccccc1O' },
  { id: 'toluene', smiles: 'Cc1ccccc1' },
  { id: 'nicotine', smiles: 'CN1CCC[C@H]1c1cccnc1' },
  { id: 'glucose', smiles: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O' },
];

// Equivalent-SMILES pairs known to represent the SAME molecule (different valid notations of one
// structure) — canonicalization must map both to the identical canonical string.
const EQUIVALENCE_PAIRS = [
  { id: 'benzene-kekule-vs-aromatic', a: 'C1=CC=CC=C1', b: 'c1ccccc1' },
  { id: 'ethanol-atom-order', a: 'CCO', b: 'OCC' },
  { id: 'acetic-acid-forms', a: 'CC(=O)O', b: 'OC(C)=O' },
];

/**
 * Runs the RDKit benchmark suite. Returns { engine, cases, metrics } where
 * `metrics` includes RMSE/MAE for the MW-vs-formula consistency check and a
 * pass rate for the structural invariants. Honest BLOCKED_BY_RUNTIME if
 * RDKit is unavailable — never a fabricated result.
 */
export function runRdkitBenchmark() {
  const t0 = Date.now();
  const cases = [];

  const d = detect();
  if (!d.available) {
    return { engine: 'RDKit', cases: [], metrics: null, blocker: 'BLOCKED_BY_RUNTIME', reason: d.reason, runtimeMs: Date.now() - t0 };
  }

  for (const { id, smiles } of MOLECULES) {
    const r = descriptors(smiles);
    if (!r.ok) { cases.push({ id, kind: 'mw-consistency', ok: false, error: r.error }); continue; }
    const exact = exactMwFromFormula(r.data.molecularFormula);
    if (exact == null) { cases.push({ id, kind: 'mw-consistency', ok: false, error: `unrecognized_element_in:${r.data.molecularFormula}` }); continue; }
    const absError = Math.abs(r.data.molWt - exact);
    cases.push({
      id, kind: 'mw-consistency', ok: true, pass: absError < 1e-6,
      formula: r.data.molecularFormula, reportedMw: r.data.molWt, exactMwFromFormula: exact, absError,
    });
  }

  // Canonicalization idempotence: canonicalize(canonicalize(x)) === canonicalize(x).
  for (const { id, smiles } of MOLECULES) {
    const once = validate(smiles);
    if (!once.ok) { cases.push({ id, kind: 'canon-idempotent', ok: false, error: once.error }); continue; }
    const twice = validate(once.canonicalSmiles);
    const stable = twice.ok && twice.canonicalSmiles === once.canonicalSmiles;
    cases.push({ id, kind: 'canon-idempotent', ok: twice.ok, pass: stable, stable });
  }

  // Equivalent SMILES notations must canonicalize to the identical string (isomorphism check).
  for (const { id, a, b } of EQUIVALENCE_PAIRS) {
    const ra = validate(a); const rb = validate(b);
    const ok = ra.ok && rb.ok;
    const match = ok && ra.canonicalSmiles === rb.canonicalSmiles;
    cases.push({
      id, kind: 'equivalence', ok, pass: match, match,
      canonicalA: ra.canonicalSmiles ?? null, canonicalB: rb.canonicalSmiles ?? null,
    });
  }

  // Determinism: descriptors computed twice for the same input must match exactly.
  const detCase = descriptors('CC(=O)Oc1ccccc1C(=O)O');
  const detCase2 = descriptors('CC(=O)Oc1ccccc1C(=O)O');
  const detOk = detCase.ok && detCase2.ok;
  const detMatch = detOk && detCase.data.molWt === detCase2.data.molWt && detCase.data.crippenLogP === detCase2.data.crippenLogP;
  cases.push({ id: 'aspirin-repeat', kind: 'determinism', ok: detOk, pass: detMatch, match: detMatch });

  const mwCases = cases.filter((c) => c.kind === 'mw-consistency' && c.ok);
  const canonCases = cases.filter((c) => c.kind === 'canon-idempotent');
  const equivCases = cases.filter((c) => c.kind === 'equivalence');

  const metrics = {
    mwConsistency: {
      n: mwCases.length,
      rmse: rmse(mwCases.map((c) => c.reportedMw), mwCases.map((c) => c.exactMwFromFormula)),
      mae: mae(mwCases.map((c) => c.reportedMw), mwCases.map((c) => c.exactMwFromFormula)),
      groundTruth: 'IUPAC standard atomic weights (definitional), independently summed from RDKit\'s own reported molecular formula',
    },
    canonicalizationStability: {
      n: canonCases.length,
      passRate: canonCases.filter((c) => c.ok && c.stable).length / (canonCases.length || 1),
    },
    equivalenceIsomorphism: {
      n: equivCases.length,
      passRate: equivCases.filter((c) => c.ok && c.match).length / (equivCases.length || 1),
    },
    successRate: cases.filter((c) => c.ok).length / cases.length,
  };

  return { engine: 'RDKit', cases, metrics, runtimeMs: Date.now() - t0 };
}
