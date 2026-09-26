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

  test('tool-backed capabilities mirror the canonical validated runtime; protein prediction remains an honest gap', () => {
    for (const id of ['docking', 'molecular-dynamics', 'quantum-chemistry', 'admet', 'toxicity']) {
      const cap = getCapability(id);
      assert.ok([CAPABILITY_STATUS.AVAILABLE, CAPABILITY_STATUS.BLOCKED_BY_RUNTIME].includes(cap.status));
      assert.ok(cap.adapter, `${id} musi mieć zadeklarowany interfejs adaptera`);
      if (cap.status === CAPABILITY_STATUS.AVAILABLE) {
        assert.equal(cap.executionStatus, 'VALIDATED_REFERENCE_CASE');
        assert.ok(cap.engine);
        assert.match(cap.fingerprint, /^[a-f0-9]{16}$/);
      } else {
        assert.ok(cap.requires, `${id} must explain its runtime blocker`);
      }
    }
    const protein = getCapability('protein-structure');
    assert.equal(protein.status, CAPABILITY_STATUS.EXTERNAL_ENGINE_REQUIRED);
    assert.ok(protein.adapter);
  });

  test('capabilityGap returns null for AVAILABLE, a gap for missing', () => {
    assert.equal(capabilityGap('molecular-weight'), null);
    const advanced = getCapability('docking');
    const gap = capabilityGap('docking');
    if (advanced.status === CAPABILITY_STATUS.AVAILABLE) assert.equal(gap, null);
    else {
      assert.equal(gap.status, CAPABILITY_STATUS.BLOCKED_BY_RUNTIME);
      assert.ok(gap.requires);
    }
  });

  test('manifest lists all advanced methods from the directive', () => {
    const ids = listCapabilities().map((c) => c.id);
    for (const id of ['docking', 'molecular-dynamics', 'quantum-chemistry', 'admet', 'toxicity', 'protein-structure', 'generative-de-novo']) {
      assert.ok(ids.includes(id), `brak zdolności ${id}`);
    }
  });
});
