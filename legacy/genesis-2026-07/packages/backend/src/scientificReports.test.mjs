/**
 * Scientific Reporting (Genesis V3, Phase 7). Deterministic audience-specific reports from real
 * campaign + validation data. Every report states the honest drug verdict and traces to inputs.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateScientificReports } from './validation/scientificReports.mjs';

const validation = {
  enginesExecuted: ['RDKit', 'ADMET-AI', 'AutoDock Vina'],
  metrics: {
    descriptorAccuracy: { mae: 0, pearsonR: 1, pass: true },
    reproducibility: [{ reproducible: true }, { reproducible: true }],
    rankingRecovery: { rocAuc: 1, labelProvenance: 'COMPUTATIONAL_CRITERION' },
    truth: { accuracy: 1, consistency: 1 }, mcre: { accuracy: 1, consistency: 1 },
  },
  researchQuality: { passedChecks: 8, totalChecks: 8 },
  readiness: { overall: 0.75, overallBand: 'MEDIUM', dimensions: { research: { band: 'HIGH' }, biotech: { band: 'MEDIUM' }, pharma: { band: 'MEDIUM' }, grant: { band: 'HIGH' } } },
};
const dossier = {
  benchmark: { candidatesGenerated: 120, candidatesSurviving: 119, dockedCount: 3, realEnginesExecuted: ['RDKit'] },
  summaries: { offTarget: { scored: 120, riskDistribution: { LOW: 118, MEDIUM: 1, HIGH: 1 } }, docking: { docked: 3, bestAffinityKcalMol: -3.6, epistemicStatus: 'MODEL_ESTIMATE', bindingSiteMethod: 'REFERENCE_LIGAND' }, molecularDynamics: { status: 'BLOCKED_BY_RUNTIME' }, mmGbsa: { status: 'BLOCKED_BY_RUNTIME' } },
  knowledgeGraph: { stats: { nodes: 30, edges: 40, allEdgesHaveProvenance: true } },
};

describe('scientificReports — audience-specific reports', () => {
  const out = generateScientificReports({ dossier, validation, meta: { generatedAt: 'T' } });

  test('generates Research / Biotech / Pharma / Grant reports', () => {
    for (const k of ['research', 'biotech', 'pharma', 'grant']) {
      assert.ok(typeof out.reports[k] === 'string' && out.reports[k].length > 100, k);
      assert.match(out.reports[k], /DID GENESIS DISCOVER A DRUG\? \*\*NO\*\*/);
    }
    assert.equal(out.didGenesisDiscoverADrug, 'NO');
  });

  test('reports trace to measured values (no fabrication)', () => {
    assert.match(out.reports.research, /Pearson r=1/);
    assert.match(out.reports.biotech, /MODEL_INFERRED/);
    assert.match(out.reports.biotech, /-3\.6 kcal\/mol/);
    assert.match(out.reports.pharma, /BLOCKED_BY_RUNTIME/);
    assert.match(out.reports.grant, /Knowledge Graph/);
  });

  test('deterministic — identical inputs produce identical reports', () => {
    const b = generateScientificReports({ dossier, validation, meta: { generatedAt: 'T' } });
    assert.equal(out.reports.research, b.reports.research);
  });

  test('handles missing campaign dossier honestly', () => {
    const r = generateScientificReports({ validation, meta: {} });
    assert.match(r.reports.research, /no campaign dossier supplied/);
  });
});
