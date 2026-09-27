/**
 * V4 infrastructure phases: Compute Resources / HPC-GPU (9), Scientific Memory (7), Investor
 * Edition (10). Honest capability detection, licence-respecting memory, and provenance-traced
 * investor artifacts (IP/patent are DRAFTS, no legal claim). No fabrication.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectComputeResources } from './cognitive/computeResources.mjs';
import { accumulateMemory, EXTERNAL_KNOWLEDGE_SOURCES } from './cognitive/scientificMemory.mjs';
import { generateInvestorPackage } from './validation/investorEdition.mjs';

describe('computeResources — real environment probe', () => {
  test('reports CPU + honest availability for GPU/Docker/K8s/Slurm/queue', () => {
    const r = detectComputeResources({ gpu: () => ({ available: false }), docker: () => ({ available: false }), kubernetes: () => ({ available: false }), slurm: () => ({ available: false }) });
    assert.ok(r.cpu.cores >= 1);
    assert.equal(r.gpu.available, false);
    assert.match(r.gpu.reason, /GPU/);
    assert.equal(r.jobQueue.available, true);
    assert.equal(r.distributedProcessing.available, false);
    assert.match(r.kubernetes.note, /genesis-k8s\.yaml/);
  });
  test('flips to available when probes report present', () => {
    const r = detectComputeResources({ gpu: () => ({ available: true, detail: 'GPU 0' }), docker: () => ({ available: true }), kubernetes: () => ({ available: true }), slurm: () => ({ available: false }) });
    assert.equal(r.gpu.available, true);
    assert.equal(r.distributedProcessing.available, true);
  });
  test('real probe runs and reports honestly (no GPU in this sandbox)', () => {
    const r = detectComputeResources();
    assert.equal(r.gpu.available, false);
  });
});

describe('scientificMemory — learn from own campaigns + external registry', () => {
  const dossier = { campaign: { id: 'c1' }, candidates: Array.from({ length: 8 }, (_, i) => ({ candidateId: `k${i}`, finalScore: 0.5 + (i % 4) * 0.1, survives: i % 2 === 0, provenance: { transformation: i % 2 ? 'a' : 'b' }, descriptors: { lipinskiViolations: i % 3, molWt: 200 }, structuralAlerts: [], offTarget: { risk: 'LOW' } })) };

  test('accumulates learning from real campaigns; external sources BLOCKED (no fabrication)', () => {
    const m = accumulateMemory({ completedDossiers: [dossier] });
    assert.equal(m.externalLearningStatus, 'BLOCKED_BY_RUNTIME');
    assert.ok(m.externalSources.every((s) => s.status === 'BLOCKED_BY_RUNTIME'));
    assert.equal(m.externalSources.length, EXTERNAL_KNOWLEDGE_SOURCES.length);
    assert.ok(['COMPLETED', 'INSUFFICIENT_DATA'].includes(m.ownCampaigns.status));
  });
  test('DrugBank licence compliance is explicit', () => {
    const m = accumulateMemory({ completedDossiers: [] });
    const db = m.externalSources.find((s) => s.source === 'DrugBank');
    assert.match(db.licenceCompliance, /valid licence/);
  });
  test('external feed present → learning AVAILABLE', () => {
    const m = accumulateMemory({ completedDossiers: [], externalFetch: () => ({}) });
    assert.equal(m.externalLearningStatus, 'AVAILABLE');
  });
});

describe('investorEdition — one-call package', () => {
  const validation = { enginesExecuted: ['RDKit', 'ADMET-AI'], metrics: { descriptorAccuracy: { mae: 0, pearsonR: 1 }, reproducibility: [{ reproducible: true }] }, readiness: { overall: 0.75, overallBand: 'MEDIUM', dimensions: { research: { band: 'HIGH', score: 0.95 }, grant: { band: 'HIGH', score: 0.9 } } } };
  const dossier = { benchmark: { candidatesGenerated: 120, candidatesSurviving: 119, dockedCount: 3, rankingTop10: [{ smiles: 'CCO', finalScore: 0.8 }] }, summaries: { admet: { epistemicStatus: 'MODEL_INFERRED' }, docking: { epistemicStatus: 'MODEL_ESTIMATE' } } };

  test('generates Investor Report, Pitch Deck, IP Package, Patent Draft', () => {
    const p = generateInvestorPackage({ dossier, validation, meta: { generatedAt: 'T' } });
    for (const k of ['investorReport', 'pitchDeck', 'ipPackage', 'patentDraft']) assert.ok(p.documents[k].length > 100, k);
    assert.equal(p.didGenesisDiscoverADrug, 'NO');
  });
  test('IP/patent artifacts are DRAFTS asserting no legal claim (honest)', () => {
    const p = generateInvestorPackage({ dossier, validation, meta: {} });
    assert.match(p.documents.ipPackage, /NOT LEGAL ADVICE|no novelty|attorney/i);
    assert.match(p.documents.patentDraft, /NOT A FILED APPLICATION|none asserted/i);
    assert.match(p.disclaimer, /no novelty or FTO/i);
  });
  test('deterministic — identical inputs produce identical documents', () => {
    const a = generateInvestorPackage({ dossier, validation, meta: { generatedAt: 'T' } });
    const b = generateInvestorPackage({ dossier, validation, meta: { generatedAt: 'T' } });
    assert.equal(a.documents.investorReport, b.documents.investorReport);
  });
});
