import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detect } from './compute/rdkitAdapter.mjs';
import { runModel } from './compute/engine.mjs';
import { getCapability } from './compute/capabilities.mjs';

/**
 * RDKit — realny silnik cheminformatyczny (Priority A/D). Test jest ŚWIADOMY
 * dostępności: gdy RDKit jest zainstalowany, sprawdza wartości referencyjne
 * (aspiryna, kofeina) z tolerancją; gdy go nie ma, sprawdza UCZCIWĄ degradację
 * (run 'rejected' z 'capability_unavailable', status BLOCKED_BY_RUNTIME) — bez
 * fałszywych liczb. Zielony w OBU środowiskach.
 */

const det = detect();

describe(`RDKit descriptors (runtime available=${det.available})`, () => {
  if (det.available) {
    test('aspirin descriptors match RDKit reference', () => {
      const r = runModel('chem-rdkit-descriptors', { smiles: 'CC(=O)Oc1ccccc1C(=O)O' });
      assert.equal(r.status, 'ok');
      assert.ok(Math.abs(r.outputs.molWt - 180.16) < 0.1);
      assert.equal(r.outputs.hbd, 1);
      assert.equal(r.outputs.hba, 3);
      assert.equal(r.outputs.aromaticRings, 1);
      assert.ok(Math.abs(r.outputs.crippenLogP - 1.31) < 0.3); // Crippen logP aspiryny ≈ 1.3
      assert.equal(r.outputs.molecularFormula, 'C9H8O4');
      assert.equal(r.units.tpsa, 'Å²');
    });

    test('caffeine descriptors are sane', () => {
      const r = runModel('chem-rdkit-descriptors', { smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' });
      assert.equal(r.status, 'ok');
      assert.ok(Math.abs(r.outputs.molWt - 194.19) < 0.1);
      assert.ok(r.outputs.aromaticRings >= 1);
    });

    test('invalid SMILES → rejected (never fabricated)', () => {
      const r = runModel('chem-rdkit-descriptors', { smiles: 'this_is_not_smiles!!!' });
      assert.equal(r.status, 'rejected');
    });

    test('logp / molecular-descriptors capabilities are AVAILABLE', () => {
      assert.equal(getCapability('logp').status, 'AVAILABLE');
      assert.equal(getCapability('molecular-descriptors').status, 'AVAILABLE');
    });
  } else {
    test('without RDKit the model rejects with capability_unavailable (no fake output)', () => {
      const r = runModel('chem-rdkit-descriptors', { smiles: 'CCO' });
      assert.equal(r.status, 'rejected');
      assert.equal(r.error, 'capability_unavailable');
    });

    test('capabilities report BLOCKED_BY_RUNTIME, not AVAILABLE', () => {
      assert.equal(getCapability('logp').status, 'BLOCKED_BY_RUNTIME');
      assert.ok(getCapability('molecular-descriptors').requires.includes('pip install rdkit'));
    });
  }
});
