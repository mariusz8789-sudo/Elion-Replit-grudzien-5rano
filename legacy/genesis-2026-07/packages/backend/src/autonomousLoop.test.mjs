/**
 * Autonomous Discovery Loop (Genesis V4, Phase 5). Orchestrates fetch→KG→targets→design→dock→ADMET→
 * off-target→MD→MM-GBSA→rank→agents→lab-readiness→report. External steps honestly BLOCKED; executable
 * steps delegate to the real campaign. Fake deps exercise the orchestration deterministically.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runAutonomousLoop } from './cognitive/autonomousLoop.mjs';

function fakeDeps() {
  const dossier = {
    campaign: { status: 'COMPLETED' }, primaryTarget: 'T',
    benchmark: { candidatesGenerated: 10, candidatesSurviving: 9, dockedCount: 2, blockedEngines: [], rankingTop10: [{ smiles: 'CCO' }] },
    summaries: { admet: { epistemicStatus: 'MODEL_INFERRED' }, docking: { epistemicStatus: 'MODEL_ESTIMATE', status: 'EXECUTED' }, molecularDynamics: { status: 'BLOCKED_BY_RUNTIME' }, offTarget: { riskDistribution: { HIGH: 0, MEDIUM: 1, LOW: 8 }, panelSize: 17 } },
    truthEngineGate: { decision: 'GO_COMPUTATIONAL' }, knowledgeGraph: { stats: { nodes: 5, edges: 6, allEdgesHaveProvenance: true } },
    candidates: [{ candidateId: 'c1', structure: 'CCO', rationale: 'r', admet: { predictions: { hERG: 0.1 } } }],
    remainingUncertainty: ['x'], experimentalRecommendations: ['y'], didGenesisDiscoverADrug: 'NO',
  };
  return {
    fetchPublications: () => ({ status: 'BLOCKED_BY_RUNTIME', reason: 'egress' }),
    findTargets: () => ({ status: 'SUPPLIED', targets: 1 }),
    runCampaign: () => ({ status: 'COMPLETED', stages: [{ stage: 'CANDIDATE_GEN_V2', status: 'COMPLETED_RANKED' }, { stage: 'DOCKING', status: 'EXECUTED' }, { stage: 'MD_STABILITY', status: 'BLOCKED_BY_RUNTIME' }], dossier }),
    runAgentPanel: () => ({ status: 'COMPLETED', consensus: { verdict: 'ADVANCE_TOP_SURVIVORS_TO_WETLAB' } }),
    buildLaboratoryReadiness: () => ({ status: 'COMPLETED' }),
    generateReports: () => ({ reports: { research: 'r', biotech: 'b', pharma: 'p', grant: 'g' } }),
  };
}

describe('autonomousLoop', () => {
  test('runs the full loop, delegating executable steps and recording external blocks', () => {
    const r = runAutonomousLoop({ deps: fakeDeps(), targetHypotheses: [{ targetName: 'T' }] });
    assert.equal(r.status, 'COMPLETED');
    const stepNames = r.steps.map((s) => s.step);
    for (const s of ['FETCH_PUBLICATIONS', 'FIND_TARGETS', 'CANDIDATE_GEN_V2', 'DOCKING', 'MULTI_AGENT_REVIEW', 'LABORATORY_READINESS', 'REPORT']) assert.ok(stepNames.includes(s), s);
    assert.ok(r.externalBlocked.includes('FETCH_PUBLICATIONS'));
    assert.ok(r.agentPanel && r.labReadiness && r.report);
    assert.equal(r.didGenesisDiscoverADrug, 'NO');
  });

  test('fetch publications is honestly BLOCKED_BY_RUNTIME (never fabricated)', () => {
    const r = runAutonomousLoop({ deps: fakeDeps(), targetHypotheses: [{ targetName: 'T' }] });
    assert.equal(r.steps.find((s) => s.step === 'FETCH_PUBLICATIONS').status, 'BLOCKED_BY_RUNTIME');
  });

  test('a failed campaign short-circuits with no dossier', () => {
    const deps = fakeDeps(); deps.runCampaign = () => ({ status: 'FAIL_CLOSED_TARGET_GATE', stages: [] });
    const r = runAutonomousLoop({ deps, targetHypotheses: [] });
    assert.equal(r.dossier, null);
    assert.notEqual(r.status, 'COMPLETED');
  });

  test('missing target hypotheses → FIND_TARGETS blocked', () => {
    const deps = fakeDeps(); deps.findTargets = () => ({ status: 'BLOCKED_BY_RUNTIME', reason: 'no live data' });
    const r = runAutonomousLoop({ deps });
    assert.equal(r.steps.find((s) => s.step === 'FIND_TARGETS').status, 'BLOCKED_BY_RUNTIME');
  });
});
