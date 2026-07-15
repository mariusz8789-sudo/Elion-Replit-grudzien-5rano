/**
 * Production docking pipeline — structure parsing, reference-ligand extraction, deterministic grid,
 * receptor preparation, and real AutoDock Vina execution. Fast tests assert the fail-closed contract
 * without Vina; a guarded suite drives the REAL Vina + Meeko + gemmi pipeline when installed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as docking from './compute/dockingAdapter.mjs';

const on = docking.detect().available;

describe('docking adapter — fail-closed contract', () => {
  test('parseStructure rejects non-string input', () => {
    const r = docking.parseStructure(null);
    assert.equal(r.ok, false);
  });
  test('prepareReceptor requires a structure', () => {
    const r = docking.prepareReceptor({});
    assert.equal(r.ok, false);
    assert.match(r.error, /invalid_input|BLOCKED_BY_RUNTIME/);
  });
  test('dockPipeline requires structure + ligandSmiles', () => {
    const r = docking.dockPipeline({ ligandSmiles: 'CCO' });
    assert.equal(r.ok, false);
  });
  test('dock without any receptor is invalid_input (never a fabricated dock)', () => {
    if (!on) { assert.equal(docking.dock({ ligandSmiles: 'CCO' }).error, 'BLOCKED_BY_RUNTIME'); return; }
    const r = docking.dock({ ligandSmiles: 'CCO' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_input');
  });
});

// ── REAL Vina + Meeko + gemmi integration (guarded) ────────────────────────────────────────────
describe('docking pipeline — REAL AutoDock Vina end-to-end', () => {
  (on ? test : test.skip)('build complex → parse → prepare receptor → dock (real Vina)', () => {
    const complex = docking.buildReferenceComplex({ sequence: 'ACDEFGHIKLMN', ligandSmiles: 'c1ccc2ccccc2c1', seed: 42 });
    assert.equal(complex.ok, true);
    assert.ok(complex.structure.includes('HETATM'), 'complex has a bound ligand');
    assert.ok(complex.sha256 && complex.sha256.length === 64);

    const parsed = docking.parseStructure(complex.structure, 'pdb');
    assert.equal(parsed.ok, true);
    assert.ok(parsed.nAtoms > 0);
    assert.ok(parsed.referenceLigand, 'reference ligand extracted');
    assert.equal(parsed.referenceLigand.isExcludedIonBuffer, false);

    const pipe = docking.dockPipeline({ structure: complex.structure, format: 'pdb', ligandSmiles: 'CC(=O)Oc1ccccc1C(=O)O', padding: 5, exhaustiveness: 8, nPoses: 5, seed: 42 });
    assert.equal(pipe.ok, true, JSON.stringify(pipe));
    // deterministic grid derived from the reference ligand
    assert.equal(pipe.grid.center.length, 3);
    assert.equal(pipe.grid.boxSize.length, 3);
    assert.ok(pipe.grid.boxSize.every((b) => b >= 16 && b <= 60));
    // real Vina produced a finite favorable score + poses
    assert.equal(typeof pipe.docking.bestAffinityKcalMol, 'number');
    assert.ok(pipe.docking.bestAffinityKcalMol < 0, 'Vina favorable score');
    assert.ok(pipe.docking.nPoses >= 1);
    assert.equal(pipe.docking.receptorKind, 'prepared_receptor');
    // provenance: input structure hashed
    assert.ok(pipe.preparedReceptor.inputStructureSha256 && pipe.preparedReceptor.inputStructureSha256.length === 64);
    assert.ok(pipe.preparedReceptor.artifacts.some((a) => a.kind === 'receptor_pdbqt'));
  });

  (on ? test : test.skip)('prepareReceptor fails closed on a structure with no reference ligand', () => {
    // protein-only complex: build one then strip the HETATM ligand lines
    const complex = docking.buildReferenceComplex({ sequence: 'ACDEFGHIKLMN', ligandSmiles: 'c1ccccc1', seed: 7 });
    const proteinOnly = complex.structure.split('\n').filter((l) => !l.startsWith('HETATM')).join('\n');
    const r = docking.prepareReceptor({ structure: proteinOnly, format: 'pdb' });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'no_reference_ligand');
  });
});
