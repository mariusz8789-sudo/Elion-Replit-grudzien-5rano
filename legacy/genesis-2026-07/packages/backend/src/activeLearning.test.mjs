/**
 * Active Learning (Genesis V3, Phase 5). Learns transformation value + feature correlations from
 * REAL completed-campaign outcomes; re-prioritises candidates. No fabricated training data; too few
 * samples → INSUFFICIENT_DATA.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { learnFromCampaigns, prioritiseCandidates, extractExperience } from './cognitive/activeLearning.mjs';

// Synthetic experience: transformation 'good' yields high scores + survival, 'bad' low + high off-target.
function rows() {
  const r = [];
  for (let i = 0; i < 8; i++) r.push({ campaignId: 'c1', transformation: 'good', finalScore: 0.8 + (i % 3) * 0.02, survived: true, lipinskiViolations: 0, nAlerts: 0, molWt: 300, offTargetRisk: 'LOW' });
  for (let i = 0; i < 8; i++) r.push({ campaignId: 'c1', transformation: 'bad', finalScore: 0.2 + (i % 3) * 0.02, survived: false, lipinskiViolations: 3, nAlerts: 2, molWt: 120, offTargetRisk: 'HIGH' });
  return r;
}

describe('activeLearning — learn from completed campaigns', () => {
  test('learns transformation weights favouring the high-value transformation', () => {
    const p = learnFromCampaigns(rows());
    assert.equal(p.status, 'COMPLETED');
    assert.ok(p.transformationWeights.good > p.transformationWeights.bad);
    assert.ok(p.planning.prioritiseTransformations.includes('good'));
    assert.ok(p.transformationStats.good.survivalRate === 1);
  });

  test('feature correlations detect that lipinski violations track lower score', () => {
    const p = learnFromCampaigns(rows());
    assert.ok(typeof p.featureCorrelations.lipinskiViolations === 'number');
    assert.ok(p.featureCorrelations.lipinskiViolations < 0); // more violations → lower score
  });

  test('too few samples → INSUFFICIENT_DATA (no fabricated training data)', () => {
    const p = learnFromCampaigns(rows().slice(0, 3));
    assert.equal(p.status, 'INSUFFICIENT_DATA');
    assert.match(p.reason, /fabricated/);
  });

  test('learns from a real dossier shape via extractExperience', () => {
    const dossier = { campaign: { id: 'cx' }, candidates: rows().map((r, i) => ({ candidateId: `k${i}`, finalScore: r.finalScore, survives: r.survived, provenance: { transformation: r.transformation }, descriptors: { lipinskiViolations: r.lipinskiViolations, molWt: r.molWt }, structuralAlerts: Array(r.nAlerts).fill('x'), offTarget: { risk: r.offTargetRisk } })) };
    const exp = extractExperience(dossier);
    assert.equal(exp.length, 16);
    const p = learnFromCampaigns([dossier]);
    assert.equal(p.status, 'COMPLETED');
    assert.equal(p.campaignsLearnedFrom, 1);
  });
});

describe('activeLearning — prioritise candidates', () => {
  test('re-ranks by learned transformation value (improves ranking)', () => {
    const policy = learnFromCampaigns(rows());
    const cands = [{ candidateId: 'x', finalScore: 0.5, transformation: 'bad' }, { candidateId: 'y', finalScore: 0.5, transformation: 'good' }];
    const pr = prioritiseCandidates(cands, policy);
    assert.equal(pr.status, 'COMPLETED');
    assert.equal(pr.ranking[0].candidateId, 'y'); // 'good' transformation lifted above 'bad' at equal base
  });

  test('no policy → passthrough ranking (never fabricated)', () => {
    const pr = prioritiseCandidates([{ candidateId: 'a', finalScore: 0.9 }], { status: 'INSUFFICIENT_DATA' });
    assert.equal(pr.status, 'INSUFFICIENT_DATA');
    assert.equal(pr.ranking[0].candidateId, 'a');
  });
});
