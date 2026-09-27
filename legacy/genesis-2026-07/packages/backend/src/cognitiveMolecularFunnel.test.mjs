/**
 * Phase 3F/G/H/J (Adversarial Molecular Funnel) tests. Deterministic via injected
 * engines; one real-RDKit adversarial rejection. Proves candidate survival is
 * adversarial, negative-result memory changes decisions, and dossiers are honest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './store.mjs';
import * as store from './store.mjs';
import * as ev from './cognitive/evidenceStore.mjs';
import * as mf from './cognitive/molecularFunnel.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';

const RDKIT = rdkit.detect().available;

function engines(over = {}) {
  return {
    validate: (s) => ({ ok: true, canonicalSmiles: s }),
    descriptors: () => ({ ok: true, data: { molWt: 250, crippenLogP: 2.1, lipinskiViolations: 0, canonicalSmiles: 'x' } }),
    alerts: () => ({ ok: true, alerts: [], nAlerts: 0, engine: 'RDKit' }),
    novelty: () => ({ ok: true, maxTanimoto: null, nReference: 0 }),
    saScore: () => ({ ok: true, saScore: 2.5 }),
    admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 20 }], version: '2.0.1' }),
    ...over,
  };
}

test('a clean candidate SURVIVES current review but selectivity is NOT assessed (no target)', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: engines() });
  assert.equal(r.decision, 'SURVIVES_CURRENT_COMPUTATIONAL_REVIEW');
  assert.equal(r.croReadiness, 'READY_FOR_EXPERT_REVIEW');
  const target = r.stages.find((s) => s.stage === 'TARGET_COMPUTATION');
  assert.equal(target.status, 'BLOCKED_BY_RESOURCES', 'no fabricated target/selectivity');
  assert.match(target.output.note, /SELECTIVITY_NOT_ASSESSED|INSUFFICIENT_TARGET_COVERAGE/);
  db.close();
});

test('invalid SMILES → REJECT', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'not-a-mol', engines: engines({ validate: () => ({ ok: false, error: 'invalid_smiles' }) }) });
  assert.equal(r.decision, 'REJECT');
  assert.equal(r.croReadiness, 'NOT_READY');
  db.close();
});

test('physicochemical failure → REJECT (never survives on other favorable scores)', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'BIG', engines: engines({ descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 8, lipinskiViolations: 3 } }) }) });
  assert.equal(r.decision, 'REJECT');
  assert.equal(store.listRejectionMotifs(db, m.id).length >= 1, true);
  db.close();
});

test('two or more structural alerts → REJECT (a favorable candidate cannot buy back a liability)', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'X', engines: engines({ alerts: () => ({ ok: true, alerts: ['azo_A', 'diazo_group'], nAlerts: 2, engine: 'RDKit' }) }) });
  assert.equal(r.decision, 'REJECT');
  db.close();
});

test('NEGATIVE-RESULT MEMORY: a previously-failed structure is SKIPPED_BY_POLICY on re-entry', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const bad = engines({ descriptors: () => ({ ok: true, data: { molWt: 900, crippenLogP: 8, lipinskiViolations: 3 } }) });
  const first = mf.runFunnel(db, { missionId: m.id, smiles: 'REPEAT', engines: bad });
  assert.equal(first.decision, 'REJECT');
  // Second time, the SAME structure: history changes the decision — expensive stages skipped.
  const second = mf.runFunnel(db, { missionId: m.id, smiles: 'REPEAT', engines: engines() });
  assert.equal(second.decision, 'REJECT');
  assert.ok(second.signals.knownMotif, 'recognized as a known-failing structure');
  const skipped = second.stages.find((s) => s.status === 'SKIPPED_BY_POLICY');
  assert.ok(skipped, 'expensive stages were skipped by policy');
  assert.ok(!second.stages.some((s) => s.stage === 'DESCRIPTORS'), 'descriptor computation avoided on the known-bad structure');
  db.close();
});

test('two concerns (ADMET + poor SA) → HOLD_FOR_MORE_EVIDENCE, not survival', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'Y', engines: engines({ admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 95 }], version: '2.0.1' }), saScore: () => ({ ok: true, saScore: 8 }) }) });
  assert.equal(r.decision, 'HOLD_FOR_MORE_EVIDENCE');
  assert.equal(r.croReadiness, 'COMPUTATIONAL_REVIEW_INCOMPLETE');
  db.close();
});

test('Dossier V2 is complete, hashed, carries the Translational Gap Warning + CRO readiness', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'CCO', engines: engines() });
  const dossier = mf.buildDossier(db, r.candidate.id);
  assert.equal(dossier.TRANSLATIONAL_GAP_WARNING, mf.TRANSLATIONAL_GAP_WARNING);
  assert.ok(/^[0-9a-f]{64}$/.test(dossier.contentHash));
  assert.ok(dossier.croHandoffReadiness && dossier.croHandoffReadiness !== 'READY_FOR_EXTERNAL_EXPERIMENT_DESIGN_REVIEW', 'never auto external-ready');
  assert.ok(dossier.provenanceChain.length >= 5);
  assert.equal(dossier.uncertaintyVector.targetSelectivity, 'NOT_ASSESSED');
  // persisted
  assert.ok(store.getCandidateDossier(db, r.candidate.id));
  db.close();
});

test('multi-objective ranking orders survivors by concerns then SA', () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  mf.runFunnel(db, { missionId: m.id, smiles: 'A', engines: engines({ saScore: () => ({ ok: true, saScore: 2 }) }) });
  mf.runFunnel(db, { missionId: m.id, smiles: 'B', engines: engines({ saScore: () => ({ ok: true, saScore: 5 }) }) });
  const ranked = mf.rankSurvivors(db, m.id);
  assert.equal(ranked[0].saScore, 2, 'lower SA ranks first among equally-clean survivors');
  db.close();
});

test('REAL RDKit: azobenzene is rejected on genuine PAINS/BRENK structural alerts', { skip: !RDKIT }, () => {
  const db = openDatabase(':memory:');
  const m = ev.createMission(db, { goal: 'g' });
  // real rdkit engines; inject a fast fake ADMET to avoid the heavy model load
  const r = mf.runFunnel(db, { missionId: m.id, smiles: 'N=Nc1ccccc1', engines: { admet: () => ({ ok: true, predictions: [{ hERG_drugbank_approved_percentile: 10 }], version: 'fake' }) } });
  const alerts = r.stages.find((s) => s.stage === 'STRUCTURAL_ALERTS');
  assert.ok(alerts.output.nAlerts >= 2, 'real FilterCatalog found the azo/diazo alerts');
  assert.equal(r.decision, 'REJECT');
  db.close();
});
