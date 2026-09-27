import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { detect, parseMolfile, parseSdf } from './compute/rdkitAdapter.mjs';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * SDF/MOL import (pilot readiness). Real RDKit MOL-block parsing (MolFromMolBlock) —
 * never a text/regex hack — exercised both at the adapter level and through the
 * authenticated API route. Skips gracefully if RDKit isn't installed (fail-closed).
 */
const RDKIT = detect().available;

// A real, valid V2000 MOL block for aspirin (CC(=O)Oc1ccccc1C(=O)O), generated once via
// RDKit's own Chem.MolToMolBlock so the fixture is guaranteed well-formed.
const ASPIRIN_MOL = `Aspirin
     RDKit          2D

 13 13  0  0  0  0  0  0  0  0999 V2000
    5.2500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000   -2.5981    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    2.5981    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    3.8971    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    2.5981    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  2  3  2  0
  2  4  1  0
  4  5  1  0
  5  6  2  0
  6  7  1  0
  7  8  2  0
  8  9  1  0
  9 10  2  0
 10 11  1  0
 11 12  2  0
 11 13  1  0
 10  5  1  0
M  END
`;

let db;
beforeEach(() => { db = openDatabase(); });
function call(method, pathname, opts = {}) { return handleApi(db, { method, pathname, ...opts }); }
function register(email) { return call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body; }

describe('rdkitAdapter.parseMolfile', () => {
  test('parses a real MOL block into canonical SMILES + title', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const r = parseMolfile(ASPIRIN_MOL);
    assert.equal(r.ok, true);
    assert.equal(r.smiles, 'CC(=O)Oc1ccccc1C(=O)O');
    assert.equal(r.name, 'Aspirin');
  });

  test('rejects garbage input explicitly (never invents a structure)', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny.');
    const r = parseMolfile('this is not a mol block at all');
    assert.equal(r.ok, false);
    assert.equal(r.error, 'invalid_molfile');
  });

  test('rejects empty input', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny.');
    assert.equal(parseMolfile('').ok, false);
  });
});

describe('rdkitAdapter.parseSdf', () => {
  test('parses a multi-record SDF, skipping malformed records without aborting the batch', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny.');
    const sdf = `${ASPIRIN_MOL}$$$$\nnot a valid mol block\n$$$$\n${ASPIRIN_MOL}$$$$\n`;
    const r = parseSdf(sdf);
    assert.equal(r.ok, true);
    assert.equal(r.total, 3);
    assert.equal(r.parsed, 2);
    assert.equal(r.errors, 1);
    assert.ok(r.molecules.every((m) => m.smiles === 'CC(=O)Oc1ccccc1C(=O)O'));
  });
});

describe('POST /api/science/molecule/parse-file', () => {
  test('requires authentication', () => {
    const r = call('POST', '/api/science/molecule/parse-file', { body: { kind: 'mol', content: ASPIRIN_MOL } });
    assert.equal(r.status, 401);
  });

  test('rejects an unknown kind', () => {
    const user = register('molimport1@lab.org');
    const r = call('POST', '/api/science/molecule/parse-file', { token: user.token, body: { kind: 'pdb', content: 'x' } });
    assert.equal(r.status, 400);
  });

  test('rejects empty content', () => {
    const user = register('molimport2@lab.org');
    assert.equal(call('POST', '/api/science/molecule/parse-file', { token: user.token, body: { kind: 'mol', content: '' } }).status, 400);
    assert.equal(call('POST', '/api/science/molecule/parse-file', { token: user.token, body: { kind: 'sdf', content: '   ' } }).status, 400);
  });

  test('parses a real .mol upload end-to-end', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const user = register('molimport3@lab.org');
    const r = call('POST', '/api/science/molecule/parse-file', { token: user.token, body: { kind: 'mol', content: ASPIRIN_MOL } });
    assert.equal(r.status, 200);
    assert.equal(r.body.molecules.length, 1);
    assert.equal(r.body.molecules[0].smiles, 'CC(=O)Oc1ccccc1C(=O)O');
    assert.equal(r.body.molecules[0].name, 'Aspirin');
  });

  test('parses a real multi-molecule .sdf upload end-to-end', (t) => {
    if (!RDKIT) return t.skip('RDKit niedostępny — BLOCKED_BY_RUNTIME (uczciwy stan).');
    const user = register('molimport4@lab.org');
    const sdf = `${ASPIRIN_MOL}$$$$\n${ASPIRIN_MOL}$$$$\n`;
    const r = call('POST', '/api/science/molecule/parse-file', { token: user.token, body: { kind: 'sdf', content: sdf } });
    assert.equal(r.status, 200);
    assert.equal(r.body.parsed, 2);
    assert.equal(r.body.total, 2);
  });
});
