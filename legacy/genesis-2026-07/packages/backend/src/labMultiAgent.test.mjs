/**
 * Laboratory Readiness (V4 Phase 6) + Multi-Agent Scientific AI (V4 Phase 4). Real RDKit identity +
 * off-target-driven proposals (all experimental items PROPOSALS); a 10-agent panel giving rule-based
 * analysis of real data with reasoning honestly CAPABILITY_BLOCKED. No fabricated results.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildLaboratoryReadiness } from './cognitive/laboratoryReadiness.mjs';
import { runAgentPanel, AGENT_ROLES } from './cognitive/multiAgent.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';

function fakeEngines() {
  return {
    rdkitDetect: () => ({ available: true }),
    descriptors: () => ({ ok: true, data: { canonicalSmiles: 'CCO', molecularFormula: 'C2H6O', molWt: 46.07, exactMolWt: 46.041, crippenLogP: -0.0014, tpsa: 20.23, hbd: 1, hba: 1, rotatableBonds: 0, aromaticRings: 0, fractionCsp3: 1, lipinskiViolations: 0, lipinskiPass: true } }),
    inchi: () => ({ ok: true, inchi: 'InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3', inchiKey: 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N' }),
    alerts: () => ({ ok: true, alerts: [], nAlerts: 0 }),
    predictOffTarget: () => ({ status: 'COMPLETED', risk: 'MEDIUM', selectivity: 0.9, offTargets: [{ protein: 'hERG', gene: 'KCNH2', probability: 0.8, flag: 'STRONG' }], toxicity: [{ endpoint: 'hERG', label: 'cardiotoxicity (hERG)', probability: 0.8, flag: 'STRONG' }], evidence: { source: 'ADMET-AI' } }),
  };
}

describe('laboratoryReadiness — lab hand-off dossier', () => {
  test('assembles identity, mass, properties, predicted targets, risks, and PROPOSED tests', () => {
    const r = buildLaboratoryReadiness({ smiles: 'CCO', admetPredictions: { hERG: 0.8 } }, { engines: fakeEngines() });
    assert.equal(r.status, 'COMPLETED');
    const d = r.dossier;
    assert.equal(d.identity.inchiKey, 'LFQSCWFLJHTTHZ-UHFFFAOYSA-N');
    assert.equal(d.mass.averageMolWt, 46.07);
    assert.ok(d.predictedTargets.offTargetProteins.some((p) => p.gene === 'KCNH2'));
    assert.ok(d.proposedInVitroTests.some((t) => /hERG/.test(t)));
    assert.ok(d.proposedInVivoTests.length >= 3);
    assert.equal(d.proposedClinicalPlan.status, 'PROPOSAL_ONLY');
    assert.equal(d.didGenesisDiscoverADrug, 'NO');
    assert.ok(d.readinessHash.length >= 32);
  });

  test('no ADMET → predicted targets blocked (never fabricated), still builds identity/properties', () => {
    const r = buildLaboratoryReadiness({ smiles: 'CCO' }, { engines: fakeEngines() });
    assert.equal(r.status, 'COMPLETED');
    assert.ok(r.dossier.predictedTargets.status === 'BLOCKED_BY_RESOURCES' || r.dossier.predictedTargets.reason);
  });

  test('RDKit unavailable → BLOCKED_BY_RUNTIME', () => {
    const eng = fakeEngines(); eng.rdkitDetect = () => ({ available: false });
    assert.equal(buildLaboratoryReadiness({ smiles: 'CCO' }, { engines: eng }).status, 'BLOCKED_BY_RUNTIME');
  });

  test('REAL RDKit produces the correct standard InChIKey', { skip: !rdkit.detect().available }, () => {
    const r = buildLaboratoryReadiness({ smiles: 'CC(=O)Oc1ccccc1C(=O)O' });
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.dossier.identity.inchiKey, 'BSYNRYMUTXBXSQ-UHFFFAOYSA-N'); // aspirin
    assert.equal(r.dossier.mass.averageMolWt, 180.159);
  });
});

describe('multiAgent — domain-expert panel', () => {
  const dossier = { campaign: { status: 'COMPLETED' }, primaryTarget: 'BRAF', benchmark: { candidatesGenerated: 120, candidatesSurviving: 119, blockedEngines: ['Docking:BLOCKED'], rankingTop10: [{ smiles: 'CCO' }] }, summaries: { docking: { status: 'EXECUTED', bestAffinityKcalMol: -5, bindingSiteMethod: 'BLIND_WHOLE_PROTEIN' }, molecularDynamics: { status: 'BLOCKED_BY_RUNTIME' }, offTarget: { riskDistribution: { HIGH: 1, MEDIUM: 2, LOW: 116 }, panelSize: 17 } }, truthEngineGate: { decision: 'GO_COMPUTATIONAL' }, knowledgeGraph: { stats: { nodes: 30, edges: 40, allEdgesHaveProvenance: true } } };

  test('runs all 10 expert roles with reasoning CAPABILITY_BLOCKED (no live model)', () => {
    const p = runAgentPanel(dossier);
    assert.equal(p.status, 'COMPLETED');
    assert.equal(p.agents.length, AGENT_ROLES.length);
    assert.ok(p.agents.every((a) => a.reasoningStatus === 'CAPABILITY_BLOCKED' && a.assessment && a.recommendation));
    assert.equal(p.reasoningLayer, 'CAPABILITY_BLOCKED');
  });

  test('consensus reflects the predicted HIGH tox risk (advance with counter-screen)', () => {
    const p = runAgentPanel(dossier);
    assert.equal(p.consensus.verdict, 'ADVANCE_WITH_TOX_COUNTERSCREEN');
    assert.ok(p.consensus.openConcerns.length > 0);
    assert.equal(p.didGenesisDiscoverADrug, 'NO');
  });

  test('reasoningAvailable flag flips the reasoning layer (when a model is configured)', () => {
    const p = runAgentPanel(dossier, { reasoningAvailable: true });
    assert.equal(p.reasoningLayer, 'AVAILABLE');
    assert.ok(p.agents.every((a) => a.reasoningStatus === 'COMPLETED'));
  });
});
