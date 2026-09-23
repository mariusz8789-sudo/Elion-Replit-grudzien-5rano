import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createUser, createProject } from '../store.mjs';
import { hashPassword } from '../auth.mjs';
import * as campaignStore from './persistence.mjs';
import {
  planVirtualExperiment,
  executeVirtualExperiment,
  replayVirtualExperiment,
  linkVirtualExperimentEvidenceProposal,
  buildVirtualExperimentEvidenceInput,
  buildVirtualLabDossier,
  EXECUTION_STATUS,
  REPLAY_STATUS,
  EPISTEMIC_CLASSIFICATION,
  FORBIDDEN_EPISTEMIC_PROMOTIONS,
  MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN,
} from './virtualLabClosedLoop.mjs';
import * as knowledgeApi from '../knowledgeApi.mjs';
import { capabilityAvailable } from './toolchain.mjs';

/**
 * Genesis Virtual Lab Closed Loop — the IN-SILICO computational experiment
 * loop, reusing the existing toolchain (./toolchain.mjs), the existing
 * single-candidate execution+persistence path (./multiFidelity.mjs), the
 * existing deterministic replay engine (./verify.mjs), and the existing
 * safety gate (./scientificIntegration.mjs). Proves real execution (RDKit
 * descriptors, docking — both genuinely available in this environment),
 * honest blocking for unbound/unavailable engines, the fixed epistemic-
 * classification vocabulary (never a forbidden promotion), deterministic
 * replay, and the propose-only Evidence bridge.
 */
let db;
beforeEach(() => { db = openDatabase(); });

let fixtureCounter = 0;
function seedCampaignAndCandidate(db, { admetComputed = false } = {}) {
  fixtureCounter += 1;
  const user = createUser(db, { email: `vlab-fixture-${fixtureCounter}@lab.org`, displayName: `vlab-fixture-${fixtureCounter}`, passwordHash: hashPassword('password123') });
  const project = createProject(db, { name: `Virtual Lab Fixture ${fixtureCounter}`, ownerId: user.id });
  const campaign = campaignStore.createCampaign(db, {
    projectId: project.id,
    objective: 'Virtual lab closed loop fixture',
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['c1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy: user.id,
  });
  const candidateId = campaignStore.addCandidate(db, {
    campaignId: campaign.id, generation: 0, canonicalSmiles: 'CC(=O)Oc1ccccc1C(=O)O', valid: true, status: 'retained',
  });
  if (admetComputed) {
    campaignStore.addEvent(db, { campaignId: campaign.id, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
  }
  return { campaignId: campaign.id, candidateId };
}

describe('Test: real execution — molecular-descriptors (RDKit, genuinely available in this runtime)', () => {
  test('a planned + executed descriptor experiment produces a real ScienceRun, honest epistemic classification, and never fabricates a result', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, {
      campaignId, candidateId,
      hypothesis: 'Aspirin has a computed LogP consistent with prior published estimates.',
      requestedCapability: 'molecular-descriptors',
      expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 2.5 },
      requestedBy: 'scientist-1',
    });
    assert.equal(planned.ok, true);
    assert.equal(planned.plan.status, 'PLANNED');
    assert.equal(planned.plan.clinicalEfficacy, 'UNKNOWN');

    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId, executedBy: 'scientist-1' });
    assert.equal(executed.ok, true);
    assert.equal(executed.result.status, EXECUTION_STATUS.EXECUTED);
    assert.ok(executed.result.scienceRunId, 'a real ScienceRun must be persisted');
    assert.equal(executed.result.selectedEngine.engineName, 'RDKit');
    assert.ok(typeof executed.result.derivedOutput.crippenLogP === 'number');
    assert.equal(executed.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.IN_SILICO_SUPPORT);
    assert.ok(executed.result.outputFingerprint);
    assert.equal(executed.result.clinicalEfficacy, 'UNKNOWN');
    assert.match(executed.result.claimBoundary, /not.*clinical|clinical.*not/i);
  });

  test('re-executing the SAME plan is idempotent — dedupes to the SAME event, never re-runs the engine twice', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Deterministic descriptor recomputation check.', requestedCapability: 'molecular-descriptors' });
    const first = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const second = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(second.deduped, true);
    assert.equal(first.result.scienceRunId, second.result.scienceRunId);
  });

  test('an identical plan (same hypothesis/capability/expectation) dedupes to the SAME executionId', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const body = { campaignId, candidateId, hypothesis: 'Same plan twice.', requestedCapability: 'molecular-descriptors' };
    const first = planVirtualExperiment(db, body);
    const second = planVirtualExperiment(db, body);
    assert.equal(first.plan.executionId, second.plan.executionId);
    assert.equal(second.deduped, true);
  });
});

describe('Test: molecular-docking — execute when available, otherwise fail closed', () => {
  test('a docking virtual experiment executes through Vina or reports the actual runtime blocker', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, {
      campaignId, candidateId, hypothesis: 'Aspirin docks with a computed binding score against the reference stand-in receptor.',
      requestedCapability: 'molecular-docking',
      // The same small-molecule stand-in receptor fixture used across this repo's own docking
      // tests (e.g. campaignMultiFidelity.test.mjs) — a real receptor target is a separate,
      // caller-supplied input this module never invents.
      params: { receptor: { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0], exhaustiveness: 4, nPoses: 3 } },
    });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    if (capabilityAvailable('molecular-docking')) {
      assert.equal(executed.result.status, EXECUTION_STATUS.EXECUTED);
      assert.equal(executed.result.selectedEngine.engineName, 'AutoDock Vina + Meeko');
      assert.ok(typeof executed.result.derivedOutput.bestAffinityKcalMol === 'number');
    } else {
      assert.equal(executed.result.status, EXECUTION_STATUS.BLOCKED_RUNTIME_UNAVAILABLE);
      assert.equal(executed.result.scienceRunId, null);
      assert.equal(executed.result.derivedOutput, null);
      assert.match(executed.result.reason, /not AVAILABLE/i);
    }
  });
});

describe('Test: BLOCKED_UNBOUND_ENGINE — a real toolchain capability with no campaign-level execution binding', () => {
  test('molecular-dynamics is a real, AVAILABLE toolchain engine (OpenMM) but has no wired campaign execution path here — honestly BLOCKED_UNBOUND_ENGINE, never fabricated', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'MD stability probe (unbound capability).', requestedCapability: 'molecular-dynamics' });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(executed.result.status, EXECUTION_STATUS.BLOCKED_UNBOUND_ENGINE);
    assert.equal(executed.result.scienceRunId, null);
    assert.equal(executed.result.derivedOutput, null);
    assert.equal(executed.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.UNKNOWN);
  });

  test('maxwell-fdtd (PyMeep) is genuinely not installed in this runtime AND unbound at the campaign layer — still honestly BLOCKED_UNBOUND_ENGINE', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'FDTD probe.', requestedCapability: 'maxwell-fdtd' });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(executed.result.status, EXECUTION_STATUS.BLOCKED_UNBOUND_ENGINE);
  });
});

describe('Test: claim boundary — forbidden epistemic promotions', () => {
  test('the allowed classification set is exactly the required four, never a forbidden promotion', () => {
    const allowed = new Set(Object.values(EPISTEMIC_CLASSIFICATION));
    assert.deepEqual([...allowed].sort(), ['COMPUTATIONAL_HYPOTHESIS', 'IN_SILICO_CONFLICT', 'IN_SILICO_SUPPORT', 'UNKNOWN'].sort());
    for (const forbidden of FORBIDDEN_EPISTEMIC_PROMOTIONS) {
      assert.equal(allowed.has(forbidden), false, `"${forbidden}" must never be an allowed classification`);
    }
  });

  test('a raw computational observation with NO expectation is COMPUTATIONAL_HYPOTHESIS, never promoted to a support/conflict verdict it never earned', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Just compute descriptors, no expectation yet.', requestedCapability: 'molecular-descriptors' });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(executed.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.COMPUTATIONAL_HYPOTHESIS);
  });

  test('an expectation that is numerically violated is honestly IN_SILICO_CONFLICT, never smoothed into support', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, {
      campaignId, candidateId, hypothesis: 'Aspirin LogP is implausibly negative (deliberately false expectation).',
      requestedCapability: 'molecular-descriptors', expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: -5 },
    });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(executed.result.epistemicClassification, EPISTEMIC_CLASSIFICATION.IN_SILICO_CONFLICT);
  });

  test('clinical language in the hypothesis is refused at plan time — reuses the existing researchIntake guard, never invents a weaker one', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, {
      campaignId, candidateId, hypothesis: 'This candidate is clinically effective and cures the disease.',
      requestedCapability: 'molecular-descriptors',
    });
    assert.equal(planned.ok, false);
    assert.equal(planned.status, EXECUTION_STATUS.BLOCKED_INVALID_INPUT);
  });
});

describe('Test: deterministic replay', () => {
  test('replaying a real, deterministic RDKit run reports REPLAY_MATCH via the existing verify.mjs engine', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Replay determinism check.', requestedCapability: 'molecular-descriptors' });
    executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const replayed = replayVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(replayed.ok, true);
    assert.equal(replayed.replay.replayStatus, REPLAY_STATUS.MATCH);
    assert.equal(replayed.replay.underlyingVerdict, 'MATCH');
  });

  test('replaying a plan that was never executed (BLOCKED_UNBOUND_ENGINE) is refused, never a fabricated MATCH', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Cannot replay what never ran.', requestedCapability: 'molecular-dynamics' });
    executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const replayed = replayVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    assert.equal(replayed.ok, false);
    assert.equal(replayed.error, 'not_executed_cannot_replay');
  });
});

describe('Test: bounded autonomy', () => {
  test('the per-campaign virtual-experiment ceiling refuses a new plan once reached, with no autonomous retry', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    for (let i = 0; i < MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN; i++) {
      const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: `Budget probe #${i}.`, requestedCapability: 'molecular-descriptors', budget: { maxExperiments: MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN } });
      assert.equal(planned.ok, true, `plan #${i} should succeed under budget`);
      const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
      assert.equal(executed.ok, true);
    }
    const overBudget = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Over the ceiling.', requestedCapability: 'molecular-descriptors' });
    assert.equal(overBudget.ok, false);
    assert.equal(overBudget.status, EXECUTION_STATUS.BLOCKED_INVALID_INPUT);
  });

  test('a caller-requested budget above the hard ceiling is clamped, never honored as-is', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Clamp check.', requestedCapability: 'molecular-descriptors', budget: { maxExperiments: 999999 } });
    assert.equal(planned.plan.budget.maxExperiments, MAX_VIRTUAL_EXPERIMENTS_PER_CAMPAIGN);
  });

  test('an unknown capability is refused at plan time, never silently accepted', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'x', requestedCapability: 'not-a-real-capability' });
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'unknown_capability');
  });
});

describe('Test: stop on safety veto', () => {
  test('a candidate whose research gate returns SAFETY_VETO cannot be planned for a virtual experiment', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    campaignStore.addEvent(db, { campaignId, generation: 0, type: 'STAGE_RESULT', payload: { stage: 'admet', candidateId, reason: 'ADMET_COMPUTED' } });
    campaignStore.addEvent(db, { campaignId, generation: 0, type: 'STAGE_SELECTION', payload: { stage: 'admet', candidateId, reason: 'TOXICITY_FILTER_REJECTED', endpointId: 'hERG', value: 1, rule: { max: 0.5 } } });
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Should be refused by the safety veto.', requestedCapability: 'molecular-descriptors' });
    assert.equal(planned.ok, false);
    assert.equal(planned.status, EXECUTION_STATUS.BLOCKED_INVALID_INPUT);
    assert.match(planned.reason, /SAFETY_VETO/);
  });
});

describe('Test: canonical Evidence proposal (propose-only, same ledger, never auto-published)', () => {
  test('a completed virtual experiment can be proposed as Evidence on the SAME canonical ledger every other proposal uses', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Evidence bridge check.', requestedCapability: 'molecular-descriptors' });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const bridge = buildVirtualExperimentEvidenceInput({ result: executed.result });
    assert.equal(bridge.ok, true);
    assert.equal(bridge.input.claimType, 'model');
    assert.equal(bridge.input.provenance.sourceKind, 'dataset');
    assert.match(bridge.input.claim, /in-silico/i);

    const proposed = knowledgeApi.proposeStructuredEvidence(bridge.input);
    assert.equal(proposed.ok, true);
    assert.equal(proposed.mode, 'PROPOSE_ONLY');
    const found = knowledgeApi.listProposals().proposals.find((p) => p.proposalId === proposed.proposalId);
    assert.ok(found);
    assert.equal(found.status, 'pending', 'a virtual experiment must never be auto-published as Evidence');

    const linked = linkVirtualExperimentEvidenceProposal(db, { campaignId, candidateId, executionId: planned.plan.executionId, proposalId: proposed.proposalId });
    assert.equal(linked.ok, true);
    assert.equal(linked.deduped, false);
    const relinked = linkVirtualExperimentEvidenceProposal(db, { campaignId, candidateId, executionId: planned.plan.executionId, proposalId: proposed.proposalId });
    assert.equal(relinked.deduped, true, 'linking the SAME (executionId, proposalId) pair again must be idempotent');
  });

  test('proposing Evidence for a BLOCKED (never-executed) result is refused', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Blocked, no evidence.', requestedCapability: 'molecular-dynamics' });
    const executed = executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const bridge = buildVirtualExperimentEvidenceInput({ result: executed.result });
    assert.equal(bridge.ok, false);
    assert.equal(bridge.error, 'result_not_executed');
  });
});

describe('Test: next-action reasoning stays in-silico — never generates a wet-lab protocol', () => {
  test('an empty dossier asks to formulate a hypothesis, never anything wet-lab-shaped', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const dossier = buildVirtualLabDossier(db, campaignId, candidateId);
    assert.equal(dossier.dossier.nextAction.action, 'FORMULATE_HYPOTHESIS_AND_PLAN');
  });

  test('a reproducible IN_SILICO_SUPPORT result names external validation as the next domain WITHOUT creating a wet-lab request itself', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, {
      campaignId, candidateId, hypothesis: 'Aspirin LogP supported.', requestedCapability: 'molecular-descriptors',
      expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 2.5 },
    });
    executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    replayVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const dossier = buildVirtualLabDossier(db, campaignId, candidateId);
    assert.equal(dossier.dossier.nextAction.action, 'ESCALATE_TO_EXTERNAL_VALIDATION');
    // The action only NAMES the next domain; no LAB_VALIDATION_REQUESTED (labClosedLoop.mjs) event exists.
    const events = campaignStore.listEvents(db, campaignId);
    assert.equal(events.some((e) => e.type === 'LAB_VALIDATION_REQUESTED'), false);
    assert.equal(events.some((e) => String(e.payload?.dosing ?? e.payload?.treatment ?? '').length > 0), false);
  });

  test('dossierFingerprint is present and deterministic across two reads of the same state', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: 'Fingerprint check.', requestedCapability: 'molecular-descriptors' });
    executeVirtualExperiment(db, { campaignId, candidateId, executionId: planned.plan.executionId });
    const a = buildVirtualLabDossier(db, campaignId, candidateId);
    const b = buildVirtualLabDossier(db, campaignId, candidateId);
    assert.equal(a.dossier.dossierFingerprint, b.dossier.dossierFingerprint);
  });
});

describe('Test: campaign/project ownership', () => {
  test('a candidate from a different campaign is refused, never silently cross-linked', () => {
    const { campaignId: campaignA } = seedCampaignAndCandidate(db);
    const { candidateId: candidateB } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId: campaignA, candidateId: candidateB, hypothesis: 'Cross-campaign probe.', requestedCapability: 'molecular-descriptors' });
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'candidate_not_found');
  });

  test('an unknown campaign is refused', () => {
    const planned = planVirtualExperiment(db, { campaignId: 'does-not-exist', candidateId: 'x', hypothesis: 'x', requestedCapability: 'molecular-descriptors' });
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'campaign_not_found');
  });
});

describe('Test: no hypothesis is refused', () => {
  test('an empty hypothesis is refused', () => {
    const { campaignId, candidateId } = seedCampaignAndCandidate(db);
    const planned = planVirtualExperiment(db, { campaignId, candidateId, hypothesis: '   ', requestedCapability: 'molecular-descriptors' });
    assert.equal(planned.ok, false);
    assert.equal(planned.error, 'hypothesis_required');
  });
});
