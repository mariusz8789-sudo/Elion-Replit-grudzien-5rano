import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invariantMassFromRow, parseZmumuCsv } from '../../../scripts/fetch-real-data.mjs';

/**
 * The CMS Z→μμ invariant mass is implemented TWICE by necessity: in Python
 * (compute/cms_zmumu_worker.py, for the backend Fabric model) and in
 * JavaScript (scripts/fetch-real-data.mjs, to generate the frontend's
 * src/data/dimuon-real.ts). Duplicated physics is exactly the kind of thing
 * that silently drifts, so these tests pin BOTH implementations to the same
 * analytically-known cases and to each other.
 */
const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'compute', 'cms_zmumu_worker.py');
const PYTHON = process.env.GENESIS_PYTHON ?? 'python3';

/** m² = 2·pT₁·pT₂·(cosh Δη − cos Δφ) evaluated by the real Python worker. */
function pythonInvariantMass(row) {
  const script = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('w', ${JSON.stringify(WORKER)})
w = importlib.util.module_from_spec(spec); spec.loader.exec_module(w)
print(json.dumps(w.invariant_mass(json.load(sys.stdin))))
`;
  return JSON.parse(execFileSync(PYTHON, ['-c', script], { input: JSON.stringify(row), encoding: 'utf8' }));
}

test('back-to-back 45.6 GeV muon pair reconstructs the Z mass (analytic anchor)', () => {
  // Two muons, equal pT, same rapidity, opposite azimuth:
  // m² = 2·pT²·(cosh 0 − cos π) = 4·pT²  ->  m = 2·pT = 91.2 GeV.
  const row = { pt1: '45.6', eta1: '0', phi1: '0', pt2: '45.6', eta2: '0', phi2: String(Math.PI) };
  assert.ok(Math.abs(invariantMassFromRow(row) - 91.2) < 1e-9);
});

test('a general asymmetric pair matches the closed-form value', () => {
  const row = { pt1: '10', eta1: '1.0', phi1: '0.5', pt2: '20', eta2: '-0.5', phi2: '2.0' };
  const expected = Math.sqrt(2 * 10 * 20 * (Math.cosh(1.5) - Math.cos(1.5)));
  assert.ok(Math.abs(invariantMassFromRow(row) - expected) < 1e-12);
});

test('the azimuthal difference wraps correctly across the ±π boundary', () => {
  // Δφ = 6.0 rad must be treated as −0.283 rad, not 6.0 — otherwise the mass is badly wrong.
  const wrapped = { pt1: '30', eta1: '0', phi1: '6.1', pt2: '30', eta2: '0', phi2: '0.1' };
  const equivalent = { pt1: '30', eta1: '0', phi1: '0', pt2: '30', eta2: '0', phi2: String(0.1 - 6.1 + 2 * Math.PI) };
  assert.ok(Math.abs(invariantMassFromRow(wrapped) - invariantMassFromRow(equivalent)) < 1e-9);
});

test('the JavaScript generator and the Python worker agree to machine precision', { skip: !hasPython() }, () => {
  const rows = [
    { pt1: '45.6', eta1: '0', phi1: '0', pt2: '45.6', eta2: '0', phi2: String(Math.PI) },
    { pt1: '10', eta1: '1.0', phi1: '0.5', pt2: '20', eta2: '-0.5', phi2: '2.0' },
    { pt1: '33.7', eta1: '-2.1', phi1: '2.9', pt2: '18.2', eta2: '0.8', phi2: '-1.4' },
    { pt1: '30', eta1: '0', phi1: '6.1', pt2: '30', eta2: '0', phi2: '0.1' },
  ];
  for (const row of rows) {
    const js = invariantMassFromRow(row);
    const py = pythonInvariantMass(row);
    assert.ok(Math.abs(js - py) < 1e-12, `JS ${js} vs Python ${py} for ${JSON.stringify(row)}`);
  }
});

test('the CSV schema gate rejects a header that is not record 5208', () => {
  assert.throws(() => parseZmumuCsv('M,pt\n91.2,45.6\n'), /Schemat CSV nie zgadza/);
});

test('the CSV parser accepts the exact record-5208 schema', () => {
  const header = 'Run,Event,pt1,eta1,phi1,Q1,dxy1,iso1,pt2,eta2,phi2,Q2,dxy2,iso2';
  const rows = parseZmumuCsv(`${header}\n160000,1,45.6,0,0,1,0,0,45.6,0,3.141592653589793,-1,0,0\n`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Run, '160000');
  assert.ok(Math.abs(invariantMassFromRow(rows[0]) - 91.2) < 1e-9);
});

function hasPython() {
  try {
    execFileSync(PYTHON, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
