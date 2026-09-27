/**
 * Full Discovery Campaign v2 orchestrator — Evidence → Target Intelligence → Candidate Generator v2
 * → RDKit → ADMET → Docking → Truth Engine → MCRE → Necropolis → Workflow Mutation → Dossier.
 * Driven with fully injected FAKE deps (deterministic, no Python) so the chain + funnel + per-candidate
 * dossier + benchmark are verified fast. Honest classification of blocked docking is asserted too.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoveryCampaignV2, CAMPAIGN_V2_STATUS } from './cognitive/discoveryCampaignV2.mjs';

function fakeCandidates(n) {
  const candidates = [];
  const ranking = [];
  for (let i = 0; i < n; i++) {
    const lv = i % 5 < 3 ? 2 : 0; // ~60% fail Lipinski (survival < 0.5 → triggers mutation)
    const na = i % 3;            // 0,1 ok; alerts present when >=1 but never > maxAlerts here
    const id = `cand_${String(i).padStart(3, '0')}`;
    const smi = `C${'C'.repeat(i % 5)}O`;
    candidates.push({
      candidateId: id, canonicalSmiles: smi, generation: i === 0 ? 0 : 1 + (i % 2),
      parentSmiles: i === 0 ? null : `C${'C'.repeat((i - 1) % 5)}O`, transformation: i === 0 ? null : 'add-methyl', seedName: 'seedX',
      engineOutputs: {
        rdkit: { ok: true, descriptors: { molWt: 100 + i, lipinskiViolations: lv, tpsa: 50 }, structuralAlerts: na >= 1 ? ['x'] : [], nAlerts: na },
        admet: { ok: true, predictions: { QED: (i % 10) / 10 } },
      },
      failureState: null,
    });
    ranking.push({ rank: i + 1, candidateId: id, canonicalSmiles: smi, finalScore: +(1 - i / n).toFixed(4), rankingPolicyVersion: 'genesis-candidate-ranking/2' });
  }
  return { candidates, ranking };
}

function fakeDeps({ dockAvailable = true, gate = 'PROCEED' } = {}) {
  const { candidates, ranking } = fakeCandidates(120);
  const dockCalls = [];
  return {
    deps: {
      ingestBundle: () => ({ ingestionMode: 'TEST_FIXTURE', evidenceRecords: [{ evidenceId: 'ev1', entityType: 'BioactivityRecord' }], entities: [{ entity: { entityType: 'BioactivityRecord' }, provenance: { sourceService: 'CHEMBL', sourceId: 'A', contentHash: 'h', license: 'CC-BY-SA', ingestionMode: 'TEST_FIXTURE' } }], summary: {} }),
      buildClaimRegistry: () => ({ registry: [{ claimId: 'c1', normalizedClaim: 'x', status: 'SUPPORTED', supportingEvidenceIds: ['ev1'] }] }),
      targetFunnel: () => ({ primaryGate: { gate }, primaryTarget: { targetName: 'T1' }, scoringPolicyVersion: 'v1', alternatives: [] }),
      requestReasoning: () => ({ capability: 'target_reasoning', status: 'CAPABILITY_BLOCKED', label: 'HUMAN_REVIEW_REQUIRED', requestHash: 'rh', routeStatus: 'CAPABILITY_GAP', output: null, note: 'no live provider (CAPABILITY_BLOCKED)' }),
      predictOffTarget: (preds) => (preds ? { status: 'COMPLETED', version: 'genesis-offtarget/1', epistemicStatus: 'MODEL_INFERRED', risk: 'LOW', confidence: 0.8, selectivity: 1, offTargetHits: { strong: 0, weak: 0, panelSize: 17 }, toxicityFlags: { strong: 0, severeStrong: 0, panelSize: 6 }, offTargets: [], toxicity: [], explanation: 'low', evidence: { source: 'ADMET-AI', epistemicStatus: 'MODEL_INFERRED' } } : { status: 'BLOCKED_BY_RESOURCES' }),
      detectMdCapability: () => ({ version: 'genesis-md/1', openmm: { available: true }, ligandForceField: { available: false }, canRunComplexMd: false, reason: 'ligand force-field parameterisation unavailable' }),
      runMdStage: (docked) => ({ version: 'genesis-md/1', status: 'BLOCKED_BY_RUNTIME', capability: { openmm: true, ligandForceField: false, canRunComplexMd: false, reason: 'no ligand FF' }, candidatesConsidered: docked.length, results: docked.map((c) => ({ candidateId: c.candidateId, dockingScoreKcalMol: c.docking?.bestAffinityKcalMol ?? null, md: { status: 'BLOCKED_BY_RUNTIME', reason: 'no ligand FF' }, mmgbsa: { status: 'BLOCKED_BY_RUNTIME', dockingScoreKcalMol: c.docking?.bestAffinityKcalMol ?? null, bindingFreeEnergyKcalMol: null } })), note: 'separate' }),
      runCandidateGenerationV2: () => ({ status: 'COMPLETED_RANKED', candidates, ranking, engineMatrix: { RDKit: { status: 'AVAILABLE' }, 'ADMET-AI': { status: 'AVAILABLE' } } }),
      truthFinalGate: () => ({ decision: 'GO_COMPUTATIONAL', rejections: [] }),
      detectConflicts: () => [],
      dockDetect: () => (dockAvailable ? { available: true, vinaVersion: '1.2.7', meekoVersion: '0.7.1' } : { available: false, reason: 'vina missing' }),
      dockPipeline: (spec) => { dockCalls.push(spec.ligandSmiles); return { ok: true, docking: { bestAffinityKcalMol: -5.1, nPoses: 5 }, grid: { center: [0, 0, 0], boxSize: [16, 16, 16] }, referenceLigand: { name: 'LIG' }, preparedReceptor: { inputStructureSha256: 'a'.repeat(64), artifacts: [] } }; },
      dockPrepared: () => ({ ok: true }),
      prepareReceptor: () => ({ ok: true }),
    },
    dockCalls,
  };
}

describe('discoveryCampaignV2 — full chain (fake deps)', () => {
  test('completes, produces benchmark + per-candidate dossier with all required fields', () => {
    const { deps } = fakeDeps();
    const r = runDiscoveryCampaignV2({ bundleRoot: '/x', structure: 'ATOM...', minCandidates: 100, dockTopN: 5, deps });
    assert.equal(r.status, CAMPAIGN_V2_STATUS.COMPLETED);
    // benchmark arithmetic
    const b = r.benchmark;
    assert.equal(b.candidatesGenerated, 120);
    assert.equal(b.candidatesRejected + b.candidatesSurviving, 120);
    assert.ok(b.candidatesRejected > 0 && b.candidatesSurviving > 0);
    assert.equal(b.dockedCount, Math.min(5, b.candidatesSurviving));
    assert.ok(b.realEnginesExecuted.includes('RDKit') && b.realEnginesExecuted.includes('ADMET-AI'));
    assert.ok(b.realEnginesExecuted.some((e) => e.includes('Vina')));
    // stage ledger covers the whole pipeline incl. the Reasoning Brain step
    const stageNames = r.stages.map((s) => s.stage);
    for (const s of ['EVIDENCE', 'TARGET_INTELLIGENCE', 'REASONING_BRAIN', 'CANDIDATE_GEN_V2', 'RDKIT', 'ADMET', 'OFF_TARGET', 'DOCKING', 'TRUTH_ENGINE', 'MCRE', 'NECROPOLIS', 'WORKFLOW_MUTATION']) {
      assert.ok(stageNames.includes(s), `missing stage ${s}`);
    }
    // off-target prediction integrated into summaries, per-candidate, and a risk-adjusted ranking
    assert.equal(r.dossier.summaries.offTarget.status, 'COMPLETED');
    assert.equal(r.dossier.summaries.offTarget.epistemicStatus, 'MODEL_INFERRED');
    assert.ok('offTarget' in r.dossier.candidates[0]);
    assert.equal(r.dossier.candidates[0].offTarget.risk, 'LOW');
    assert.ok(Array.isArray(r.dossier.riskAdjustedRanking) && r.dossier.riskAdjustedRanking.length > 0);
    assert.ok(r.dossier.riskAdjustedRanking.every((x) => 'offTargetRisk' in x && 'riskAdjustedScore' in x));
    // knowledge graph built with provenance on every edge
    assert.ok(r.dossier.knowledgeGraph.stats.nodes > 0);
    assert.equal(r.dossier.knowledgeGraph.stats.allEdgesHaveProvenance, true);
    assert.ok(stageNames.includes('KNOWLEDGE_GRAPH'));
    // MD + MM-GBSA integrated + honestly blocked (no ligand FF), docking score kept separate
    assert.ok(stageNames.includes('MD_STABILITY') && stageNames.includes('MM_GBSA'));
    assert.equal(r.dossier.summaries.molecularDynamics.status, 'BLOCKED_BY_RUNTIME');
    assert.equal(r.dossier.summaries.mmGbsa.separateFromDockingScore, true);
    // Reasoning Brain honestly blocked without a live model — never fabricated
    assert.equal(r.dossier.reasoningLedger.status, 'CAPABILITY_BLOCKED');
    // mandated campaign-level dossier sections
    for (const k of ['rdkit', 'admet', 'docking', 'mcre', 'truthEngine']) assert.ok(k in r.dossier.summaries, `missing summary ${k}`);
    assert.ok(Array.isArray(r.dossier.remainingUncertainty) && r.dossier.remainingUncertainty.length > 0);
    assert.ok(Array.isArray(r.dossier.experimentalRecommendations) && r.dossier.experimentalRecommendations.length > 0);
    assert.equal(r.dossier.summaries.docking.epistemicStatus, 'MODEL_ESTIMATE');
    assert.equal(r.dossier.summaries.admet.epistemicStatus, 'MODEL_INFERRED');
    // per-candidate dossier fields (Phase 4)
    const c = r.dossier.candidates[0];
    for (const f of ['structure', 'rationale', 'descriptors', 'admet', 'docking', 'truthEngineDecision', 'provenance', 'computationalConfidence', 'rejectedAlternatives', 'nextExperiment']) {
      assert.ok(f in c, `dossier candidate missing ${f}`);
    }
    assert.equal(r.dossier.didGenesisDiscoverADrug, 'NO');
    assert.ok(r.dossier.dossierHash.length >= 32);
  });

  test('docking is BLOCKED_BY_RESOURCES with no structure (never simulated)', () => {
    const { deps, dockCalls } = fakeDeps();
    const r = runDiscoveryCampaignV2({ bundleRoot: '/x', structure: null, minCandidates: 100, dockTopN: 5, deps });
    assert.equal(dockCalls.length, 0, 'no docking attempted without a structure');
    const dockStage = r.stages.find((s) => s.stage === 'DOCKING');
    assert.equal(dockStage.status, 'BLOCKED_BY_RESOURCES');
    assert.ok(r.dossier.candidates.every((c) => c.docking.status !== 'DOCKED'));
  });

  test('docking is BLOCKED_BY_RUNTIME when Vina is unavailable (never simulated)', () => {
    const { deps, dockCalls } = fakeDeps({ dockAvailable: false });
    const r = runDiscoveryCampaignV2({ bundleRoot: '/x', structure: 'ATOM...', minCandidates: 100, dockTopN: 5, deps });
    assert.equal(dockCalls.length, 0);
    assert.equal(r.stages.find((s) => s.stage === 'DOCKING').status, 'BLOCKED_BY_RUNTIME');
    assert.ok(r.benchmark.blockedEngines.some((e) => e.startsWith('Docking:BLOCKED_BY_RUNTIME')));
  });

  test('workflow mutation triggers when survival rate is low', () => {
    const { deps } = fakeDeps();
    const r = runDiscoveryCampaignV2({ bundleRoot: '/x', structure: 'ATOM...', minCandidates: 100, dockTopN: 5, deps });
    // fakeCandidates: half fail Lipinski (lv 2,3) → survival < 0.5 → mutation
    assert.equal(r.workflowMutation.mutated, true);
    assert.ok(r.necropolisDelta.failureRegions.length > 0);
    assert.equal(r.necropolisDelta.rejectedCount, r.benchmark.candidatesRejected);
  });

  test('fails closed at the target gate (BLOCK)', () => {
    const { deps } = fakeDeps({ gate: 'BLOCK' });
    const r = runDiscoveryCampaignV2({ bundleRoot: '/x', structure: 'ATOM...', minCandidates: 100, deps });
    assert.equal(r.status, CAMPAIGN_V2_STATUS.FAIL_CLOSED_TARGET_GATE);
    assert.equal(r.dossier, null);
  });
});
