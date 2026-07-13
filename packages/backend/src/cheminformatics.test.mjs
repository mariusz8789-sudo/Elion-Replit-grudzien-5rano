import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runModel } from './compute/engine.mjs';
import { listCapabilities, getCapability, isAvailable, capabilityGap, CAPABILITY_STATUS } from './compute/capabilities.mjs';

/**
 * Cheminformatyka (deterministyczna) + Manifest Zdolności. Wartości referencyjne
 * z tolerancją; zaawansowane metody muszą być jawnie NIEdostępne (bez fałszywych
 * liczb) — to test „braku fałszerstwa".
 */

function mw(formula) {
  const r = runModel('chem-molecular-weight', { formula });
  return r;
}

describe('molecular weight (reference compounds)', () => {
  const cases = [
    ['H2O', 18.015, 0],
    ['C9H8O4', 180.159, 6], // aspiryna
    ['C8H10N4O2', 194.19, 6], // kofeina
    ['CH4', 16.043, 0], // metan
    ['C6H6', 78.11, 4], // benzen
    ['C2H6O', 46.069, 0], // etanol
  ];
  for (const [formula, expMW, expDoU] of cases) {
    test(`${formula} → MW≈${expMW}, DoU=${expDoU}`, () => {
      const r = mw(formula);
      assert.equal(r.status, 'ok', r.message);
      assert.ok(Math.abs(r.outputs.molarMassGmol - expMW) <= Math.max(expMW * 0.005, 0.02), `MW ${r.outputs.molarMassGmol}`);
      assert.equal(r.outputs.degreeOfUnsaturation, expDoU);
      assert.equal(r.units.molarMassGmol, 'g/mol');
    });
  }

  test('atom count is correct (aspirin = 21 atoms)', () => {
    assert.equal(mw('C9H8O4').outputs.atomCount, 21);
  });

  test('invalid formula → rejected (not faked, not crashed)', () => {
    assert.equal(mw('C9H8O4)').status, 'rejected'); // nawias
    assert.equal(mw('Xx99').status, 'rejected'); // nieznany pierwiastek
    assert.equal(mw('').status, 'rejected'); // pusty → default? '' trim empty → rejected
    assert.equal(mw('9C').status, 'rejected'); // zaczyna się cyfrą
  });

  test('provenance + exact honesty on the chem model', () => {
    const r = mw('H2O');
    assert.equal(r.provenance.honesty, 'exact');
    assert.ok(r.provenance.formula.includes('MW'));
  });
});

describe('capability manifest (no faking)', () => {
  test('cheminformatics basics are AVAILABLE and map to a real model', () => {
    assert.equal(isAvailable('molecular-weight'), true);
    assert.equal(getCapability('molecular-weight').modelId, 'chem-molecular-weight');
  });

  test('docking / MD / QM / ADMET / toxicity / structure are NOT available', () => {
    for (const id of ['docking', 'molecular-dynamics', 'quantum-chemistry', 'admet', 'toxicity', 'protein-structure']) {
      assert.equal(isAvailable(id), false, `${id} nie może być AVAILABLE`);
      const cap = getCapability(id);
      assert.ok([CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED, CAPABILITY_STATUS.NOT_IMPLEMENTED].includes(cap.status));
      assert.ok(cap.adapter, `${id} musi mieć zadeklarowany interfejs adaptera`);
    }
  });

  test('capabilityGap returns null for AVAILABLE, a gap for missing', () => {
    assert.equal(capabilityGap('molecular-weight'), null);
    const gap = capabilityGap('docking');
    assert.equal(gap.status, CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED);
    assert.ok(gap.requires);
  });

  test('manifest lists all advanced methods from the directive', () => {
    const ids = listCapabilities().map((c) => c.id);
    for (const id of ['docking', 'molecular-dynamics', 'quantum-chemistry', 'admet', 'toxicity', 'protein-structure', 'generative-de-novo']) {
      assert.ok(ids.includes(id), `brak zdolności ${id}`);
    }
  });
});
