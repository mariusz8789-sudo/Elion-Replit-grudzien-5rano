/**
 * Protein structure ingestion (Biopython) benchmark (Priority A). Ground
 * truth is exact-by-construction: every PDB fixture below is authored by
 * this module, so the correct chain/residue/hetero/water/backbone counts
 * are known exactly and independently of the parser under test — never a
 * recalled literature number.
 */
import * as protein from '../compute/proteinAdapter.mjs';

const TWO_MODEL_PDB = [
  'MODEL        1',
  'ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N',
  'ATOM      2  CA  ALA A   1       1.000   0.000   0.000  1.00  0.00           C',
  'ATOM      3  C   ALA A   1       2.000   0.000   0.000  1.00  0.00           C',
  'ATOM      4  O   ALA A   1       3.000   0.000   0.000  1.00  0.00           O',
  'ENDMDL',
  'MODEL        2',
  'ATOM      1  N   ALA A   1       0.100   0.000   0.000  1.00  0.00           N',
  'ATOM      2  CA  ALA A   1       1.100   0.000   0.000  1.00  0.00           C',
  'ATOM      3  C   ALA A   1       2.100   0.000   0.000  1.00  0.00           C',
  'ATOM      4  O   ALA A   1       3.100   0.000   0.000  1.00  0.00           O',
  'ENDMDL',
  'END', '',
].join('\n');

const HETERO_AND_WATER_PDB = [
  'ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N',
  'ATOM      2  CA  ALA A   1       1.000   0.000   0.000  1.00  0.00           C',
  'ATOM      3  C   ALA A   1       2.000   0.000   0.000  1.00  0.00           C',
  'ATOM      4  O   ALA A   1       3.000   0.000   0.000  1.00  0.00           O',
  'HETATM    5  O   HOH A   2       5.000   5.000   5.000  1.00  0.00           O',
  'HETATM    6  O   HOH A   3       6.000   6.000   6.000  1.00  0.00           O',
  'HETATM    7  O   HOH A   4       7.000   7.000   7.000  1.00  0.00           O',
  'HETATM    8 ZN   ZN  A   5       8.000   8.000   8.000  1.00  0.00          ZN',
  'END', '',
].join('\n');

const CLEAN_TWO_CHAIN_PDB = [
  'ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N',
  'ATOM      2  CA  ALA A   1       1.000   0.000   0.000  1.00  0.00           C',
  'ATOM      3  C   ALA A   1       2.000   0.000   0.000  1.00  0.00           C',
  'ATOM      4  O   ALA A   1       3.000   0.000   0.000  1.00  0.00           O',
  'ATOM      5  N   GLY A   2       4.000   0.000   0.000  1.00  0.00           N',
  'ATOM      6  CA  GLY A   2       5.000   0.000   0.000  1.00  0.00           C',
  'ATOM      7  C   GLY A   2       6.000   0.000   0.000  1.00  0.00           C',
  'ATOM      8  O   GLY A   2       7.000   0.000   0.000  1.00  0.00           O',
  'TER       9      GLY A   2',
  'ATOM     10  N   ALA B   1      10.000   0.000   0.000  1.00  0.00           N',
  'ATOM     11  CA  ALA B   1      11.000   0.000   0.000  1.00  0.00           C',
  'ATOM     12  C   ALA B   1      12.000   0.000   0.000  1.00  0.00           C',
  'ATOM     13  O   ALA B   1      13.000   0.000   0.000  1.00  0.00           O',
  'TER      14      ALA B   1',
  'END', '',
].join('\n');

export function runProteinBenchmark() {
  const t0 = Date.now();
  const cases = [];

  const d = protein.detect();
  if (!d.available) {
    return { engine: 'Biopython', cases: [], metrics: null, blocker: 'BLOCKED_BY_RUNTIME', reason: d.reason, runtimeMs: Date.now() - t0 };
  }

  // 1. Reference case (existing, already-validated).
  const ref = protein.referenceCase();
  cases.push({ id: 'reference-case', kind: 'reference-case', ok: ref.ok, pass: ref.ok && ref.pass, report: ref.ok ? ref.report : null });

  // 2. Determinism: parsing the same PDB text twice must give an identical report.
  const v1 = protein.validatePdb(CLEAN_TWO_CHAIN_PDB);
  const v2 = protein.validatePdb(CLEAN_TWO_CHAIN_PDB);
  const detOk = v1.ok && v2.ok;
  cases.push({ id: 'parse-determinism', kind: 'determinism', ok: detOk, pass: detOk && JSON.stringify(v1.report) === JSON.stringify(v2.report) });

  // 3. Exact-by-construction: two clean chains, 2+1 residues, no hetero/waters, backbone-complete.
  const clean = protein.validatePdb(CLEAN_TWO_CHAIN_PDB);
  cases.push({
    id: 'two-chain-exact-counts', kind: 'exact-construction', ok: clean.ok,
    pass: clean.ok && clean.report.chains.length === 2 && clean.report.residues === 3
      && clean.report.aminoAcids === 3 && clean.report.heteroResidues === 0 && clean.report.waters === 0
      && clean.report.residuesMissingBackbone.length === 0 && clean.report.needsPreparation === false
      && clean.report.status === 'READY',
    report: clean.ok ? clean.report : null, expected: { chains: 2, residues: 3, aminoAcids: 3, heteroResidues: 0, waters: 0, status: 'READY' },
  });

  // 4. Exact-by-construction: 3 waters + 1 non-water heteroatom, deliberately authored.
  const het = protein.validatePdb(HETERO_AND_WATER_PDB);
  cases.push({
    id: 'hetero-water-exact-counts', kind: 'exact-construction', ok: het.ok,
    pass: het.ok && het.report.waters === 3 && het.report.heteroResidues === 1 && het.report.needsPreparation === true && het.report.status === 'ADDITIONAL_INPUT_REQUIRED',
    report: het.ok ? het.report : null, expected: { waters: 3, heteroResidues: 1, status: 'ADDITIONAL_INPUT_REQUIRED' },
  });

  // 5. Exact-by-construction: 2 MODEL records must be detected and flagged for preparation.
  const multi = protein.validatePdb(TWO_MODEL_PDB);
  cases.push({
    id: 'multi-model-detection', kind: 'exact-construction', ok: multi.ok,
    pass: multi.ok && multi.report.models === 2 && multi.report.needsPreparation === true,
    report: multi.ok ? multi.report : null, expected: { models: 2, needsPreparation: true },
  });

  const exactCases = cases.filter((c) => c.kind === 'exact-construction');

  const metrics = {
    exactConstructionPassRate: exactCases.filter((c) => c.pass).length / (exactCases.length || 1),
    successRate: cases.filter((c) => c.ok).length / cases.length,
    overallPassRate: cases.filter((c) => c.pass).length / cases.length,
  };

  return { engine: 'Biopython', cases, metrics, runtimeMs: Date.now() - t0 };
}
