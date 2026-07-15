/**
 * Real Scientific Campaign #001 — engine matrix, MCRE, deterministic ranking, Truth-Engine
 * final gate (Corpus Mandate Phases 8–12, 14). Deterministic via injected fake engines.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cr from './campaign/campaignRunner001.mjs';
import * as ei from './cognitive/evidenceIntelligence.mjs';
import { ingestBundle } from './corpus/corpusIngest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../test-fixtures/genesis-scientific-evidence-bundle-v1');

function fakeEngines(over = {}) {
  return {
    rdkitDetect: () => ({ available: true, version: 'RDKit-test' }),
    descriptors: () => ({ ok: true, data: { molWt: 320, crippenLogP: 2.1, lipinskiViolations: 0 } }),
    alerts: () => ({ ok: true, nAlerts: 0, alerts: [] }),
    transform: (s, t) => ({ ok: true, products: [`${s}|${t}`], transformation: t }),
    listTransformations: () => ({ ok: true, transformations: ['add-methyl', 'add-fluoro'] }),
    admetDetect: () => ({ available: true, version: 'ADMET-test' }),
    admetPredict: (list) => ({ ok: true, predictions: { [list[0]]: { hERG_inhibition: 0.7, molWt: 320 } } }),
    ...over,
  };
}
// Build an evidence-backed target from the fixture bundle's bioactivity record.
function backedTarget() {
  const ing = ingestBundle(FIXTURE);
  const evId = ing.evidenceRecords.find((e) => e.entityType === 'BioactivityRecord').evidenceId;
  const { registry } = ei.buildClaimRegistry([{ text: 'target has fixture-assay activity', supportingEvidenceIds: [evId], claimType: 'BIOACTIVITY' }], ing.evidenceRecords);
  return { claims: [{ text: 'target has fixture-assay activity', supportingEvidenceIds: [evId], claimType: 'BIOACTIVITY' }], target: { targetName: 'fixture-target', claimIds: [registry[0].claimId], structureAvailable: true, mechanismRationale: 'fixture', cheapestFalsification: 'assay', knownChemicalMatter: true } };
}
const run = (over = {}, engines = fakeEngines()) => {
  const { claims, target } = backedTarget();
  return cr.runCampaign001(null, { bundleRoot: FIXTURE, targetHypotheses: [target], supplementalClaims: claims, engines, seedCompounds: [{ name: 'aspirin', smiles: 'CC(=O)Oc1ccccc1C(=O)O' }], ...over });
};

describe('engine status matrix', () => {
  test('docking/OpenMM/PySCF are BLOCKED/NOT_IMPLEMENTED without inputs — never fabricated', () => {
    const m = cr.engineStatusMatrix(fakeEngines(), { hasReceptor: false });
    assert.equal(m.RDKit.status, 'AVAILABLE');
    assert.equal(m['ADMET-AI'].status, 'AVAILABLE');
    assert.equal(m.Docking.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(m.PySCF.status, 'NOT_IMPLEMENTED');
  });
  test('a blocked engine records status, not a fake score', () => {
    const r = run({}, fakeEngines({ admetDetect: () => ({ available: false, reason: 'unavailable' }) }));
    const c = r.candidates[0];
    assert.equal(c.engineOutputs.admet.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(c.engineOutputs.admet.predictions, undefined);
  });
});

describe('MCRE conflict resolution', () => {
  test('Ki and IC50 are kept distinct (never flattened)', () => {
    const ing = ingestBundle(FIXTURE);
    const bio = [{ standardType: 'Ki', standardValue: 10, standardRelation: '=', standardUnits: 'nM', identifiers: { activityId: 'k1' } }, { standardType: 'IC50', standardValue: 50, standardRelation: '=', standardUnits: 'nM', identifiers: { activityId: 'i1' } }];
    void ing;
    const conflicts = cr.detectConflicts({ candidateId: 'c1' }, { bioactivity: bio, engineOutputs: { admet: { predictions: {} } } });
    assert.ok(conflicts.some((c) => c.conflictType === 'KI_VS_IC50_INTERPRETATION' && c.resolutionResult === 'KEPT_DISTINCT'));
  });
  test('reported activity vs predicted liability conflict stays visible (unresolved)', () => {
    const bio = [{ standardType: 'IC50', standardValue: 42, standardRelation: '=', standardUnits: 'nM', identifiers: { activityId: 'a1' } }];
    const conflicts = cr.detectConflicts({ candidateId: 'c1' }, { bioactivity: bio, engineOutputs: { admet: { predictions: { hERG_inhibition: 0.7 } } } });
    assert.ok(conflicts.some((c) => c.conflictType === 'REPORTED_ACTIVITY_vs_PREDICTED_LIABILITY' && /UNRESOLVED/.test(c.resolutionResult)));
  });
});

describe('deterministic ranking', () => {
  test('same inputs + policy → identical ordering (run twice)', () => {
    const a = run(); const b = run();
    assert.deepEqual(a.ranking.map((r) => r.candidateId), b.ranking.map((r) => r.candidateId));
    assert.deepEqual(a.ranking.map((r) => r.finalScore), b.ranking.map((r) => r.finalScore));
    assert.equal(a.ranking[0].rankingPolicyVersion, 'genesis-campaign-ranking/1');
    assert.ok(a.ranking.length >= 1);
  });
  test('ranking exposes every component contribution', () => {
    const r = run().ranking[0];
    for (const k of ['evidenceContribution', 'targetRelevanceContribution', 'chemistryContribution', 'admetContribution', 'structuralContribution', 'conflictPenalty', 'uncertaintyPenalty', 'finalScore']) assert.ok(k in r);
    assert.equal(r.structuralContribution, 0); // no real docking → no structural contribution
  });
});

describe('Truth Engine final gate + fail closed', () => {
  test('an evidence-backed campaign completes with a ranking', () => {
    const r = run();
    assert.equal(r.status, 'COMPLETED_RANKED');
    assert.equal(r.truthGate.decision, 'GO_COMPUTATIONAL');
  });
  test('a target with no evidence FAILS CLOSED (no ranking)', () => {
    const r = cr.runCampaign001(null, { bundleRoot: FIXTURE, targetHypotheses: [{ targetName: 'x', claimIds: [] }], supplementalClaims: [], engines: fakeEngines() });
    assert.equal(r.status, 'FAIL_CLOSED_INSUFFICIENT_EVIDENCE');
    assert.equal(r.ranking.length, 0);
  });
  test('an unsupported clinical/efficacy claim is BLOCKed by the final gate', () => {
    const { claims, target } = backedTarget();
    // Backing claim keeps the target gate open; the clinical claim must be caught by the FINAL gate.
    const r = cr.runCampaign001(null, { bundleRoot: FIXTURE, targetHypotheses: [target], supplementalClaims: [...claims, { text: 'this compound cures the disease and is clinically safe', proposedByModel: true }], engines: fakeEngines(), seedCompounds: [{ name: 'a', smiles: 'CC(=O)Oc1ccccc1C(=O)O' }] });
    assert.equal(r.truthGate.decision, 'BLOCK');
    assert.equal(r.status, 'FAIL_CLOSED_TRUTH_GATE');
    assert.ok(r.truthGate.rejections.length >= 1);
  });
});

describe('dossier', () => {
  test('dossier has ranking, conflicts, engine matrix, and answers the drug question NO', () => {
    const d = cr.buildCampaign001Dossier(run(), { scientificQuestion: 'fixture triage' });
    assert.equal(d.didGenesisDiscoverADrug, 'NO');
    assert.ok(d.finalRanking.length >= 1);
    assert.ok(d.enginesBlocked.some((e) => /Docking/.test(e)));
    assert.match(d.dossierHash, /^[0-9a-f]{64}$/);
    assert.ok(d.evidenceProvenance.every((p) => p.hashAlgorithm === 'sha256'));
  });
});
