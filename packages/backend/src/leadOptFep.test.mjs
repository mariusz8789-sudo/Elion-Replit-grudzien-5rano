/**
 * Lead Optimization (V4 Phase 2) + FEP Engine (V4 Phase 3). Lead-opt does multi-objective Pareto
 * selection over real ADMET percentiles + synthesizability + selectivity; FEP is honestly blocked
 * without the specialised infrastructure. No fabricated ΔΔG or activity.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { optimiseLead, objectiveVector, OBJECTIVES } from './cognitive/leadOptimization.mjs';
import { detectFepCapability, runRelativeFep } from './cognitive/fepEngine.mjs';

/** Fake engines: analogue 'good' dominates the lead on every ADMET axis; 'bad' is worse. */
function fakeLeadEngines() {
  const pctFields = (q) => ({ QED_drugbank_approved_percentile: q, Solubility_AqSolDB_drugbank_approved_percentile: q, Caco2_Wang_drugbank_approved_percentile: q, Half_Life_Obach_drugbank_approved_percentile: q });
  const preds = {
    lead: pctFields(50), good: pctFields(90), bad: pctFields(20),
  };
  return {
    rdkitDetect: () => ({ available: true }),
    admetDetect: () => ({ available: true }),
    saScore: (s) => ({ ok: true, saScore: s === 'good' ? 2 : 4 }),
    descriptors: () => ({ ok: true, data: {} }),
    admetPredict: (list) => ({ ok: true, predictions: Object.fromEntries(list.map((s) => [s, preds[s] ?? pctFields(40)])) }),
    generateAnalogues: () => ({ status: 'COMPLETED', molecules: [{ smiles: 'good' }, { smiles: 'bad' }] }),
    predictOffTarget: () => ({ status: 'COMPLETED', selectivity: 1, risk: 'LOW' }),
  };
}

describe('leadOptimization — multi-objective Pareto improvement', () => {
  test('selects analogues that dominate the lead across real objective axes', () => {
    const r = optimiseLead({ lead: 'lead', count: 5, engines: fakeLeadEngines() });
    assert.equal(r.status, 'COMPLETED');
    assert.ok(r.improvedAnalogues.some((a) => a.smiles === 'good'));
    assert.ok(!r.improvedAnalogues.some((a) => a.smiles === 'bad'));
    assert.ok(r.improvedAnalogues.every((a) => a.paretoImproved));
    assert.equal(r.epistemicStatus, 'MODEL_INFERRED');
  });

  test('potency is N/A without a target structure (never invented)', () => {
    const r = optimiseLead({ lead: 'lead', engines: fakeLeadEngines() });
    assert.match(r.potency, /N\/A|requires a target/);
  });

  test('objectiveVector normalises ADMET percentiles to 0–1 (higher = better)', () => {
    const v = objectiveVector({ smiles: 'x', predictions: { QED_drugbank_approved_percentile: 80, Solubility_AqSolDB_drugbank_approved_percentile: 60 }, saScore: 2.8 }, fakeLeadEngines());
    assert.ok(Math.abs(v.druglikeness - 0.8) < 1e-9);
    assert.ok(v.syntheticAccessibility > 0.7);
    assert.equal(OBJECTIVES.includes('metabolicStability'), true);
  });

  test('ADMET unavailable → BLOCKED_BY_RUNTIME (never fabricated)', () => {
    const eng = fakeLeadEngines(); eng.admetDetect = () => ({ available: false });
    assert.equal(optimiseLead({ lead: 'lead', engines: eng }).status, 'BLOCKED_BY_RUNTIME');
  });
});

describe('fepEngine — honest capability gating', () => {
  test('detectFepCapability: all infra present → canRunFep', () => {
    const c = detectFepCapability({ openmmDetect: () => ({ available: true }), ligandFfProbe: () => true, fepToolkitProbe: () => true, gpuProbe: () => true });
    assert.equal(c.canRunFep, true);
    assert.equal(c.missing.length, 0);
  });

  test('missing infra → cannot run, lists what is missing', () => {
    const c = detectFepCapability({ openmmDetect: () => ({ available: true }), ligandFfProbe: () => false, fepToolkitProbe: () => false, gpuProbe: () => false });
    assert.equal(c.canRunFep, false);
    assert.ok(c.missing.length >= 2);
  });

  test('runRelativeFep without infra → BLOCKED_BY_RUNTIME, no fabricated ΔΔG', () => {
    const cap = { canRunFep: false, missing: ['GPU', 'FEP-toolkit'] };
    const r = runRelativeFep({ ligandA: 'CCO', ligandB: 'CCN', receptor: 'x' }, cap);
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.relativeBindingAffinityKcalMol, null);
    assert.equal(r.confidence, null);
  });

  test('real runtime FEP probe is blocked here (no GPU/toolkit/ligand-FF)', () => {
    const c = detectFepCapability();
    assert.equal(c.canRunFep, false);
  });
});
