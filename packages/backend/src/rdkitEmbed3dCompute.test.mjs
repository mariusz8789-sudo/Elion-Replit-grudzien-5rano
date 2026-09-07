import assert from 'node:assert/strict';
import test from 'node:test';
import { getModel, runModel } from './compute/engine.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

/**
 * `chem-rdkit-embed3d` — the one hop that was missing for C3 Phase 4.
 *
 * `rdkit_worker.py` already produced real per-atom 3D coordinates and
 * `rdkitAdapter.mjs` already exported `embed3d`, but the capability was not
 * registered as a model, so nothing could reach it over the HTTP API. These
 * tests pin both halves: the honest refusal when RDKit is absent, and the real
 * geometry (with its determinism guarantee) when it is present.
 */
const MODEL_ID = 'chem-rdkit-embed3d';
const rdkitAvailable = rdkitDetect().available;

test('the model is registered with coordinate-unit provenance and a required-runtime declaration', () => {
  const model = getModel(MODEL_ID);
  assert.ok(model, 'chem-rdkit-embed3d must be registered');
  assert.equal(model.domain, 'chemistry');
  assert.equal(model.provenance.coordinateUnit, 'angstrom');
  assert.equal(model.provenance.requiredEnvironmentVariable, 'GENESIS_RDKIT_PYTHON');
  assert.equal(model.provenance.honesty, 'real_external_engine');
  // The seed must be a declared INPUT: reproducibility is the property that makes a stochastic
  // embedding admissible as evidence at all.
  assert.ok(model.inputs.some((i) => i.id === 'seed'));
});

test('without RDKit it is rejected with an explicit reason, never a fabricated geometry', { skip: rdkitAvailable ? 'RDKit is installed in this environment' : false }, () => {
  const run = runModel(MODEL_ID, { smiles: 'CCO', seed: 42 });
  assert.equal(run.status, 'rejected');
  assert.equal(run.error, 'capability_unavailable');
  assert.equal(run.outputs, undefined);
});

test('with RDKit it returns real per-atom coordinates in angstroms', { skip: !rdkitAvailable }, () => {
  const run = runModel(MODEL_ID, { smiles: 'CCO', seed: 42 });
  assert.equal(run.status, 'ok');
  // Ethanol C2H6O: 3 heavy atoms + 6 hydrogens once RDKit adds them.
  assert.equal(run.outputs.nAtoms, 9);
  assert.equal(run.outputs.atoms.length, 9);
  assert.equal(run.outputs.canonicalSmiles, 'CCO');
  assert.ok(['MMFF', 'UFF'].includes(run.outputs.forceField));
  assert.equal(run.outputs.seed, 42);
  for (const atom of run.outputs.atoms) {
    assert.equal(typeof atom.element, 'string');
    for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(atom[axis]), `${axis} must be a real number`);
  }
  // A real molecule has real extent: not every atom collapsed onto the origin.
  assert.ok(run.outputs.atoms.some((a) => Math.hypot(a.x, a.y, a.z) > 0.5));
});

test('the same seed reproduces identical geometry; a different seed does not', { skip: !rdkitAvailable }, () => {
  const smiles = 'CC(=O)Oc1ccccc1C(=O)O'; // aspirin
  const a = runModel(MODEL_ID, { smiles, seed: 7 });
  const b = runModel(MODEL_ID, { smiles, seed: 7 });
  const c = runModel(MODEL_ID, { smiles, seed: 99 });

  assert.equal(a.status, 'ok');
  assert.equal(a.outputs.nAtoms, 21); // C9H8O4
  // Determinism is what lets a stored conformer be re-derived and checked rather than trusted.
  assert.deepEqual(a.outputs.atoms, b.outputs.atoms);
  assert.notDeepEqual(a.outputs.atoms, c.outputs.atoms);
  assert.equal(a.deterministic, true);
});

test('an invalid SMILES is rejected rather than silently embedded', { skip: !rdkitAvailable }, () => {
  const run = runModel(MODEL_ID, { smiles: 'not-a-molecule', seed: 1 });
  assert.equal(run.status, 'rejected');
  assert.equal(run.error, 'invalid_smiles');
});

test('the result carries the honesty warning that this is a conformer, not an experimental structure', { skip: !rdkitAvailable }, () => {
  const run = runModel(MODEL_ID, { smiles: 'CCO', seed: 42 });
  assert.ok(run.warnings.some((w) => w.includes('konformer')));
});
