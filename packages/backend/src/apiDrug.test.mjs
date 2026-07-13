import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * Drug Discovery przez router API. Weryfikuje realną cheminformatykę przy
 * zapisie kandydata, paszport z jawnymi lukami zdolności (bez fałszowania),
 * ranking i RBAC.
 */

let db;
beforeEach(() => { db = openDatabase(); });
const call = (m, p, o = {}) => handleApi(db, { method: m, pathname: p, token: o.token, body: o.body, query: o.query });
function setup() {
  const owner = call('POST', '/api/auth/register', { body: { email: 'chem@lab.org', password: 'password123' } }).body;
  const p = call('POST', '/api/projects', { token: owner.token, body: { name: 'Onkologia' } }).body.project;
  return { owner, p };
}

describe('capabilities manifest (public)', () => {
  test('lists capabilities; advanced methods are not AVAILABLE', () => {
    const r = call('GET', '/api/compute/capabilities');
    assert.equal(r.status, 200);
    const byId = new Map(r.body.capabilities.map((c) => [c.id, c]));
    assert.equal(byId.get('molecular-weight').status, 'AVAILABLE');
    assert.notEqual(byId.get('docking').status, 'AVAILABLE');
    assert.notEqual(byId.get('admet').status, 'AVAILABLE');
  });
});

describe('targets + candidates', () => {
  test('editor+ defines a target and adds a candidate with real chemistry', () => {
    const { owner, p } = setup();
    const target = call('POST', `/api/projects/${p.id}/targets`, {
      token: owner.token,
      body: { name: 'EGFR', targetType: 'kinaza', geneProtein: 'EGFR', organism: 'Homo sapiens', indication: 'NSCLC', mechanism: 'inhibicja ATP' },
    });
    assert.equal(target.status, 201);
    assert.equal(target.body.target.evidenceStatus, 'unverified');

    const cand = call('POST', `/api/projects/${p.id}/candidates`, {
      token: owner.token,
      body: { targetId: target.body.target.id, label: 'Aspiryna (ref)', formula: 'C9H8O4' },
    });
    assert.equal(cand.status, 201);
    assert.ok(Math.abs(cand.body.candidate.molecularWeight - 180.16) < 0.1);
    assert.deepEqual(cand.body.candidate.composition, { C: 9, H: 8, O: 4 });

    const list = call('GET', `/api/projects/${p.id}/candidates`, { token: owner.token, query: { targetId: target.body.target.id } });
    assert.equal(list.body.candidates.length, 1);
  });

  test('invalid formula on candidate → 400', () => {
    const { owner, p } = setup();
    const r = call('POST', `/api/projects/${p.id}/candidates`, { token: owner.token, body: { label: 'X', formula: 'C9H8O4)' } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, 'invalid_formula');
  });

  test('viewer cannot create targets/candidates (403)', () => {
    const { owner, p } = setup();
    const viewer = call('POST', '/api/auth/register', { body: { email: 'v@lab.org', password: 'password123' } }).body;
    call('POST', `/api/projects/${p.id}/members`, { token: owner.token, body: { email: 'v@lab.org', role: 'viewer' } });
    assert.equal(call('POST', `/api/projects/${p.id}/targets`, { token: viewer.token, body: { name: 'X' } }).status, 403);
    assert.equal(call('POST', `/api/projects/${p.id}/candidates`, { token: viewer.token, body: { label: 'X', formula: 'H2O' } }).status, 403);
  });
});

describe('candidate passport (honest)', () => {
  test('passport reports real chemistry + visible capability gaps + no fake scores', () => {
    const { owner, p } = setup();
    const cand = call('POST', `/api/projects/${p.id}/candidates`, { token: owner.token, body: { label: 'Kofeina', formula: 'C8H10N4O2' } }).body.candidate;
    const r = call('GET', `/api/projects/${p.id}/candidates/${cand.id}/passport`, { token: owner.token });
    assert.equal(r.status, 200);
    const pass = r.body.passport;
    assert.ok(Math.abs(pass.calculatedProperties.molarMassGmol - 194.19) < 0.1);
    // capability gaps must be present and visible
    const gapIds = pass.capabilityGaps.map((g) => g.id);
    for (const need of ['docking', 'admet', 'toxicity']) assert.ok(gapIds.includes(need), `brak luki ${need}`);
    // no fabricated docking/ADMET numbers anywhere in score components
    assert.ok(pass.scoreComponents.every((c) => ['calculated', 'heuristic'].includes(c.kind)));
    // honest verdict language
    assert.match(pass.verdict, /Kandydat OBLICZENIOWY/);
    assert.ok(pass.requiredLaboratoryValidation.length >= 1);
    assert.ok(pass.runIds.length >= 1);
  });

  test('ranking is transparent, keeps gaps visible, and never invents neutral values', () => {
    const { owner, p } = setup();
    call('POST', `/api/projects/${p.id}/candidates`, { token: owner.token, body: { label: 'mała', formula: 'C6H6' } }); // MW 78, Lipinski pass
    call('POST', `/api/projects/${p.id}/candidates`, { token: owner.token, body: { label: 'duża', formula: 'C60' } }); // MW 720, Lipinski fail
    const r = call('GET', `/api/projects/${p.id}/candidates/ranking`, { token: owner.token });
    assert.equal(r.status, 200);
    assert.equal(r.body.ranking.length, 2);
    // small drug-like molecule ranks above the > 500 g/mol one (transparent basis)
    assert.equal(r.body.ranking[0].rankBasis.lipinskiMwPass, 1);
    assert.equal(r.body.ranking[1].rankBasis.lipinskiMwPass, 0);
    assert.ok(r.body.ranking[0].capabilityGapCount >= 1); // gaps remain visible
    assert.match(r.body.ranking[0].note, /nie skuteczność/);
  });
});
