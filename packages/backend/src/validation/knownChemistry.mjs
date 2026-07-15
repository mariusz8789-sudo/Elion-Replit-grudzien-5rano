/**
 * Public-domain reference chemistry for computational validation (Phase 1/2). These are
 * DETERMINISTIC chemical facts (molecular formulae + IUPAC conventional atomic weights), not
 * experimental biology and not fabricated measurements: the reference molecular weight is COMPUTED
 * here from the formula and standard atomic weights, transparently, so a descriptor engine (RDKit)
 * can be validated against first principles. Nothing here asserts activity, binding, or efficacy.
 */

// IUPAC conventional atomic weights (g/mol) — standard reference constants.
export const ATOMIC_WEIGHTS = Object.freeze({
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974,
  S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904, Na: 22.990, K: 39.098,
});

/** Parse a simple molecular formula (e.g. "C9H8O4") into element counts. */
export function parseFormula(formula) {
  const counts = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m;
  while ((m = re.exec(String(formula))) !== null) {
    if (!m[1]) continue;
    counts[m[1]] = (counts[m[1]] ?? 0) + (m[2] ? Number(m[2]) : 1);
  }
  return counts;
}

/** Reference average molecular weight computed from the formula + standard atomic weights. */
export function referenceMolWt(formula) {
  const counts = parseFormula(formula);
  let mw = 0;
  for (const [el, n] of Object.entries(counts)) {
    if (!(el in ATOMIC_WEIGHTS)) throw new Error(`no atomic weight for element ${el}`);
    mw += ATOMIC_WEIGHTS[el] * n;
  }
  return +mw.toFixed(3);
}

/** Well-known, public-domain reference molecules (name, canonical-ish SMILES, molecular formula). */
export const REFERENCE_MOLECULES = Object.freeze([
  { name: 'water', smiles: 'O', formula: 'H2O', drugLike: false },
  { name: 'methanol', smiles: 'CO', formula: 'CH4O', drugLike: false },
  { name: 'ethanol', smiles: 'CCO', formula: 'C2H6O', drugLike: false },
  { name: 'acetic acid', smiles: 'CC(=O)O', formula: 'C2H4O2', drugLike: false },
  { name: 'benzene', smiles: 'c1ccccc1', formula: 'C6H6', drugLike: false },
  { name: 'toluene', smiles: 'Cc1ccccc1', formula: 'C7H8', drugLike: false },
  { name: 'phenol', smiles: 'Oc1ccccc1', formula: 'C6H6O', drugLike: false },
  { name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O', formula: 'C9H8O4', drugLike: true },
  { name: 'paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1', formula: 'C8H9NO2', drugLike: true },
  { name: 'ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1', formula: 'C13H18O2', drugLike: true },
  { name: 'caffeine', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', formula: 'C8H10N4O2', drugLike: true },
  { name: 'naproxen', smiles: 'COc1ccc2cc(C(C)C(=O)O)ccc2c1', formula: 'C14H14O3', drugLike: true },
  { name: 'glucose', smiles: 'OCC1OC(O)C(O)C(O)C1O', formula: 'C6H12O6', drugLike: false },
]).map((m) => ({ ...m, referenceMolWt: referenceMolWt(m.formula) }));
