import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from './api.mjs';

/**
 * Public API v1 (/api/v1/*). Proves the external RDKit surface: analyze +
 * render/2d + render/3d, each for a valid SMILES (aspirin), an invalid SMILES,
 * and a missing `smiles` field. Delegates through the real router (handleApi),
 * so it also verifies the routing + honest error envelope. RDKit-only → no db.
 */
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const call = (pathname, body, method = 'POST') => handleApi(null, { method, pathname, body });

describe('POST /api/v1/analyze', () => {
  test('valid SMILES → ok + real properties + InChIKey + computed_by RDKit', () => {
    const r = call('/api/v1/analyze', { smiles: ASPIRIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.computed_by, 'RDKit');
    const p = r.body.properties;
    assert.equal(p.molecular_formula, 'C9H8O4');
    assert.ok(Math.abs(p.molecular_weight - 180.16) < 0.1);
    assert.equal(p.hbd, 1);
    assert.equal(p.hba, 3);
    assert.equal(p.lipinski_violations, 0);
    assert.equal(p.inchikey, 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
    assert.ok(typeof p.logp === 'number' && typeof p.tpsa === 'number');
  });
  test('invalid SMILES → 422 error, clear message, still computed_by RDKit', () => {
    const r = call('/api/v1/analyze', { smiles: 'not-a-smiles!!!' });
    assert.equal(r.status, 422);
    assert.equal(r.body.status, 'error');
    assert.equal(r.body.error, 'invalid_smiles');
    assert.equal(r.body.computed_by, 'RDKit');
    assert.ok(r.body.message.length > 0);
  });
  test('missing smiles field → 400 missing_smiles', () => {
    const r = call('/api/v1/analyze', {});
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'missing_smiles');
  });
});

describe('POST /api/v1/render/2d', () => {
  test('valid SMILES → ok + SVG string', () => {
    const r = call('/api/v1/render/2d', { smiles: ASPIRIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.format, 'svg');
    assert.match(r.body.svg, /<svg/);
    assert.equal(r.body.molecular_formula, 'C9H8O4');
  });
  test('invalid SMILES → 422', () => {
    const r = call('/api/v1/render/2d', { smiles: '###' });
    assert.equal(r.status, 422);
    assert.equal(r.body.error, 'invalid_smiles');
  });
  test('missing smiles → 400', () => {
    assert.equal(call('/api/v1/render/2d', {}).status, 400);
  });
});

describe('POST /api/v1/render/3d', () => {
  test('valid SMILES → ok + atoms + bonds (Å, computed geometry)', () => {
    const r = call('/api/v1/render/3d', { smiles: ASPIRIN });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'ok');
    assert.equal(r.body.units, 'angstrom');
    assert.ok(r.body.atom_count > 0);
    assert.ok(Array.isArray(r.body.atoms) && r.body.atoms.length === r.body.atom_count);
    assert.ok('element' in r.body.atoms[0] && 'x' in r.body.atoms[0]);
    assert.ok(Array.isArray(r.body.bonds) && r.body.bonds.length > 0);
    assert.ok('a' in r.body.bonds[0] && 'b' in r.body.bonds[0]);
  });
  test('invalid SMILES → 422', () => {
    const r = call('/api/v1/render/3d', { smiles: 'ZZZ!!' });
    assert.equal(r.status, 422);
  });
  test('missing smiles → 400', () => {
    assert.equal(call('/api/v1/render/3d', {}).status, 400);
  });
});

describe('API v1 — routing + method guards', () => {
  test('unknown v1 endpoint → 404 with error envelope', () => {
    const r = call('/api/v1/nope', { smiles: ASPIRIN });
    assert.equal(r.status, 404);
    assert.equal(r.body.status, 'error');
  });
  test('GET on a v1 endpoint → 405 method_not_allowed', () => {
    const r = call('/api/v1/analyze', {}, 'GET');
    assert.equal(r.status, 405);
    assert.equal(r.body.error, 'method_not_allowed');
  });
});
