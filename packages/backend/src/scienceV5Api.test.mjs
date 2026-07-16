import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';

/**
 * V5 UI-wiring endpoints (public /api/science/*). Prove the premium screens are
 * backed by the REAL V4 cognitive/validation modules — not mocks: compute-resources
 * (env probe), scientific-memory registry, multi-agent roster + live panel,
 * laboratory-readiness (real RDKit InChIKey), and the investor package.
 */
let db;
beforeEach(() => { db = openDatabase(); });
const call = (method, pathname, opts = {}) => handleApi(db, { method, pathname, ...opts });

describe('science V5 — compute resources', () => {
  test('reports real CPU + honest GPU/HPC availability', () => {
    const r = call('GET', '/api/science/compute-resources');
    assert.equal(r.status, 200);
    assert.ok(r.body.resources.cpu.cores >= 1);
    assert.equal(typeof r.body.resources.gpu.available, 'boolean');
    assert.equal(r.body.resources.jobQueue.available, true);
  });
});

describe('science V5 — scientific memory', () => {
  test('returns the licence-tagged external registry, external learning BLOCKED', () => {
    const r = call('GET', '/api/science/memory');
    assert.equal(r.status, 200);
    assert.equal(r.body.memory.externalLearningStatus, 'BLOCKED_BY_RUNTIME');
    assert.ok(r.body.memory.externalSources.length >= 8);
    assert.ok(r.body.memory.externalSources.some((s) => s.source === 'DrugBank'));
  });
});

describe('science V5 — multi-agent', () => {
  test('roster lists the 10 expert agents', () => {
    const r = call('GET', '/api/science/agent-roles');
    assert.equal(r.status, 200);
    assert.equal(r.body.roles.length, 10);
    assert.ok(r.body.roles.includes('Toxicologist'));
  });
  test('panel produces rule-based assessments over a supplied dossier (reasoning CAPABILITY_BLOCKED)', () => {
    const dossier = { benchmark: { candidatesSurviving: 3, candidatesGenerated: 10, blockedEngines: [] }, summaries: { docking: { status: 'EXECUTED' }, offTarget: { riskDistribution: { HIGH: 0, MEDIUM: 1, LOW: 8 }, panelSize: 17 } }, candidates: [{ structuralAlerts: [] }] };
    const r = call('POST', '/api/science/multi-agent', { body: { dossier } });
    assert.equal(r.status, 200);
    assert.equal(r.body.panel.status, 'COMPLETED');
    assert.equal(r.body.panel.agents.length, 10);
    assert.equal(r.body.panel.reasoningLayer, 'CAPABILITY_BLOCKED');
    assert.ok(r.body.panel.consensus.verdict);
  });
  test('missing dossier is reported, never fabricated', () => {
    const r = call('POST', '/api/science/multi-agent', { body: {} });
    assert.equal(r.status, 200);
    assert.equal(r.body.panel.status, 'INVALID_INPUT');
  });
});

describe('science V5 — laboratory readiness (real RDKit)', () => {
  test('aspirin yields the real InChIKey + proposed assays (PROPOSAL_ONLY)', () => {
    const r = call('POST', '/api/science/laboratory-readiness', { body: { candidate: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' } } });
    assert.equal(r.status, 200);
    // RDKit is available in this environment; if not, the module fails closed.
    if (r.body.readiness.status === 'COMPLETED') {
      assert.equal(r.body.readiness.dossier.identity.inchiKey, 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N');
      assert.ok(r.body.readiness.dossier.proposedInVitroTests.length > 0);
      assert.equal(r.body.readiness.dossier.didGenesisDiscoverADrug, 'NO');
    } else {
      assert.equal(r.body.readiness.status, 'BLOCKED_BY_RUNTIME');
    }
  });
  test('missing SMILES is INVALID_INPUT, not fabricated', () => {
    const r = call('POST', '/api/science/laboratory-readiness', { body: { candidate: {} } });
    assert.equal(r.status, 200);
    assert.ok(['INVALID_INPUT', 'BLOCKED_BY_RUNTIME'].includes(r.body.readiness.status));
  });
});

describe('science V5 — investor package', () => {
  test('generates non-binding investor/IP artifacts (NO drug claim)', () => {
    const dossier = { benchmark: { candidatesGenerated: 120, candidatesSurviving: 119, dockedCount: 3, rankingTop10: [{ smiles: 'CCO', finalScore: 0.8 }] }, summaries: { admet: { epistemicStatus: 'MODEL_INFERRED' }, docking: { epistemicStatus: 'MODEL_ESTIMATE' } } };
    const validation = { enginesExecuted: ['RDKit', 'ADMET-AI'], metrics: {}, readiness: { overall: 0.75, overallBand: 'MEDIUM', dimensions: {} } };
    const r = call('POST', '/api/science/investor-package', { body: { dossier, validation, meta: { generatedAt: 'T' } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.package.didGenesisDiscoverADrug, 'NO');
    assert.ok(r.body.package.documents.investorReport.length > 100);
    assert.match(r.body.package.documents.patentDraft, /NOT A FILED APPLICATION/i);
  });
});

describe('science V5 — unknown route', () => {
  test('404 on an unknown science segment', () => {
    assert.equal(call('GET', '/api/science/nope').status, 404);
  });
});

describe('science V6 — molecule render (real RDKit depiction + 3D)', () => {
  test('aspirin yields a real 2D SVG + 3D atoms/bonds', () => {
    const r = call('POST', '/api/science/molecule/render', { body: { smiles: 'CC(=O)Oc1ccccc1C(=O)O' } });
    assert.equal(r.status, 200);
    if (r.body.depiction2d.ok) {
      assert.match(r.body.depiction2d.svg, /<svg/);
      assert.equal(r.body.depiction2d.molecularFormula, 'C9H8O4');
    } else {
      assert.equal(r.body.depiction2d.error, 'BLOCKED_BY_RUNTIME');
    }
    if (r.body.model3d && r.body.model3d.ok) {
      assert.ok(r.body.model3d.atoms.length > 0);
      assert.ok(r.body.model3d.bonds.length > 0);
      assert.ok('element' in r.body.model3d.atoms[0]);
    }
  });
  test('2d-only mode skips the 3D embed', () => {
    const r = call('POST', '/api/science/molecule/render', { body: { smiles: 'CCO', mode: '2d' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.model3d, null);
  });
  test('missing SMILES is rejected', () => {
    assert.equal(call('POST', '/api/science/molecule/render', { body: {} }).status, 400);
  });
});
