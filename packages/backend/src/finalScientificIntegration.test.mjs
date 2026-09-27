import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { detect } from './compute/rdkitAdapter.mjs';
import { buildCandidatePassport } from './compute/drugDiscovery.mjs';
import { createCampaign, addEvent, addCandidate } from './campaign/persistence.mjs';
import {
  candidateIdentityGuard,
  researchGateVerdict,
  buildCandidateResearchMatrix,
  checkResearchValidationGate,
} from './campaign/scientificIntegration.mjs';

/**
 * Work Item 4 — Drug Discovery Scientific Integration.
 * researchGateVerdict/buildCandidateResearchMatrix are tested against
 * DIRECTLY-seeded campaign events (real persistence.mjs::addEvent, the same
 * shape multiFidelity.mjs itself writes) rather than a full docking/QM/ADMET
 * run, because those stages require external toolchains (AutoDock Vina,
 * PySCF, ADMET-AI) this sandbox does not provision — the synthesis logic
 * itself is exercised exactly as it would be against real persisted events.
 */
const RDKIT = detect().available;
const maybe = RDKIT ? test : test.skip;

function freshProjectAndCampaign(label) {
  const db = openDatabase();
  const u = createUser(db, { email: `${label}@lab.org`, displayName: label, passwordHash: hashPassword('password123') });
  const p = createProject(db, { name: label, ownerId: u.id });
  const c = createCampaign(db, {
    projectId: p.id, objective: 'software validation', domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 1, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: [], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: u.id,
  });
  return { db, campaignId: c.id };
}

describe('candidateIdentityGuard — BLOCKED before any compute model runs', () => {
  test('BLOCKED when a candidate declares neither smiles nor formula', () => {
    const result = candidateIdentityGuard({ id: 'c1', label: 'nothing' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'BLOCKED');
    assert.equal(result.reason, 'IDENTITY_MISSING');
  });

  test('OK when a candidate declares only a formula', () => {
    const result = candidateIdentityGuard({ id: 'c2', formula: 'C9H8O4' });
    assert.equal(result.ok, true);
  });

  maybe('BLOCKED when the declared SMILES does not canonicalize (real RDKit)', () => {
    const result = candidateIdentityGuard({ id: 'c3', smiles: 'not a real smiles (((' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'IDENTITY_UNPARSEABLE');
  });

  maybe('OK with a canonicalSmiles when the SMILES is real (real RDKit)', () => {
    const result = candidateIdentityGuard({ id: 'c4', smiles: 'c1ccccc1' });
    assert.equal(result.ok, true);
    assert.ok(result.canonicalSmiles);
  });
});

describe('buildCandidatePassport — identity guard wired into the real compute-domain entry point', () => {
  test('an unidentifiable candidate is rejected before any model runs, never a fabricated passport', () => {
    const passport = buildCandidatePassport({ id: 'p1', label: 'ghost' });
    assert.equal(passport.modelDomainStatus, 'blocked');
    assert.deepEqual(passport.modelsExecuted, []);
    assert.equal(passport.runIds.length, 0);
    assert.ok(passport.identityGuard);
    assert.equal(passport.identityGuard.ok, false);
  });

  test('a candidate with a valid formula still runs the real molecular-weight model', () => {
    const passport = buildCandidatePassport({ id: 'p2', label: 'aspirin-like', formula: 'C9H8O4' });
    assert.equal(passport.modelDomainStatus, 'ok');
    assert.ok(passport.calculatedProperties.molarMassGmol > 0);
    assert.ok(passport.runIds.length >= 1);
  });
});

describe('researchGateVerdict — real synthesis over persisted campaign events, no recomputation', () => {
  test('DENIED with SAFETY_VETO when a real TOXICITY_FILTER_REJECTED event is persisted', () => {
    const { db, campaignId } = freshProjectAndCampaign('rg-safety-veto');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    addEvent(db, { campaignId, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
    addEvent(db, { campaignId, generation: 0, type: 'STAGE_SELECTION', payload: { stage: 'admet', candidateId, reason: 'TOXICITY_FILTER_REJECTED', endpointId: 'hERG', value: 0.9 } });
    const verdict = researchGateVerdict(db, campaignId, candidateId);
    assert.equal(verdict.verdict, 'RESEARCH_PRIORITY_DENIED');
    assert.equal(verdict.reason, 'SAFETY_VETO');
  });

  test('DENIED with SAFETY_UNASSESSED when ADMET was never executed for the candidate', () => {
    const { db, campaignId } = freshProjectAndCampaign('rg-unassessed');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    const verdict = researchGateVerdict(db, campaignId, candidateId);
    assert.equal(verdict.verdict, 'RESEARCH_PRIORITY_DENIED');
    assert.equal(verdict.reason, 'SAFETY_UNASSESSED');
  });

  test('HELD with UNRESOLVED_MODEL_CONFLICT when a real MODEL_CONFLICT event is persisted', () => {
    const { db, campaignId } = freshProjectAndCampaign('rg-conflict');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    addEvent(db, { campaignId, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
    addEvent(db, { campaignId, generation: 0, type: 'MODEL_CONFLICT', payload: { candidateId, classification: 'MODEL_CONFLICT', resultA: {}, resultB: {} } });
    const verdict = researchGateVerdict(db, campaignId, candidateId);
    assert.equal(verdict.verdict, 'RESEARCH_PRIORITY_HELD');
    assert.equal(verdict.reason, 'UNRESOLVED_MODEL_CONFLICT');
  });

  test('ELIGIBLE only when ADMET executed, no toxicity/ADMET rejection, and no unresolved conflict', () => {
    const { db, campaignId } = freshProjectAndCampaign('rg-eligible');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    addEvent(db, { campaignId, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
    const verdict = researchGateVerdict(db, campaignId, candidateId);
    assert.equal(verdict.verdict, 'RESEARCH_PRIORITY_ELIGIBLE');
    assert.match(verdict.message, /never an efficacy or safety claim/);
  });

  test('the verdict never uses efficacy/probability language — research priority only', () => {
    const { db, campaignId } = freshProjectAndCampaign('rg-wording');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    addEvent(db, { campaignId, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
    const verdict = researchGateVerdict(db, campaignId, candidateId);
    // Substring checks only, not "safe"/"safety" (the message's own disclaimer legitimately
    // uses "safety claim" to say it is NOT making one) — these check for an actual efficacy
    // or unqualified-safety assertion, which must never appear.
    for (const forbidden of ['is effective', 'is efficacious', 'is safe', 'is a cure', 'cures']) {
      assert.ok(!verdict.message.toLowerCase().includes(forbidden), `message must not claim "${forbidden}"`);
    }
    assert.match(verdict.message, /never an efficacy or safety claim/);
  });
});

describe('buildCandidateResearchMatrix — candidate matrix built over the existing scientific-compute report', () => {
  test('returns null for a non-existent campaign, never a fabricated matrix', () => {
    const { db } = freshProjectAndCampaign('matrix-missing');
    assert.equal(buildCandidateResearchMatrix(db, 'does-not-exist'), null);
  });

  test('attaches a real researchGate verdict per candidate id in the existing report', () => {
    const { db, campaignId } = freshProjectAndCampaign('matrix-real');
    const candidateId = addCandidate(db, { campaignId, generation: 0, canonicalSmiles: 'c1ccccc1', valid: true, status: 'retained', descriptors: {}, objectiveVector: {}, constraintViolations: [], runIds: [] });
    const matrix = buildCandidateResearchMatrix(db, campaignId);
    assert.ok(matrix);
    assert.ok(Array.isArray(matrix.researchGate));
    const row = matrix.researchGate.find((r) => r.candidateId === candidateId);
    assert.ok(row);
    assert.equal(row.gate.reason, 'SAFETY_UNASSESSED');
  });
});

describe('checkResearchValidationGate — delegates entirely to the existing frozen-gate loader', () => {
  test('fail-closed GATE_NOT_FROZEN for a missing gate file', () => {
    const result = checkResearchValidationGate('/nonexistent/gate.json', { targetLabel: 'test-target' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'GATE_NOT_FROZEN');
  });
});
