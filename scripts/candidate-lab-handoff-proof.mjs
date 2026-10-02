#!/usr/bin/env node
/**
 * Real candidate -> Evidence -> Replay -> external-lab handoff proof.
 *
 * Runs against the pinned structural worker container. It deliberately ends in
 * BLOCKED/SAFETY_UNASSESSED because commercial ADMET execution is a separate
 * fail-closed gate. That is the scientifically correct outcome for this proof:
 * a real Vina result is traceable and reproducible, but it is not promoted to a
 * laboratory-ready candidate without safety assessment.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from '../packages/backend/src/api.mjs';
import { openDatabase, getScienceRun } from '../packages/backend/src/store.mjs';
import * as campaignStore from '../packages/backend/src/campaign/persistence.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[++i];
  return args;
}

async function api(db, method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}

function newCampaign(db, { projectId, createdBy, objective }) {
  return campaignStore.createCampaign(db, {
    projectId,
    objective,
    domain: 'DRUG_DISCOVERY',
    budget: { maxGenerations: 1, maxGeneratedCandidates: 4 },
    stopping: { patience: 2, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles: ['Oc1ccccc1'], transformationWeights: {}, parentSelection: 'pareto' },
    createdBy,
  });
}

async function preregister(db, { projectId, campaignId, token }) {
  const endpoint = `/api/projects/${projectId}/campaigns/${campaignId}/experiment-memory/preregistration`;
  const response = await api(db, 'POST', endpoint, {
    token,
    body: {
      hypothesis: {
        subject: 'phenol-canonical-proof',
        target: { targetId: 'CANONICAL-AROMATIC-POCKET', protein: 'bounded software reference receptor' },
        statement: 'The candidate produces a reproducible Vina scoring-function estimate against the preregistered bounded receptor model.',
        criteria: [
          { id: 'docking', critical: true, threshold: 0, evidence: 'REAL_ENGINE_OUTPUT', label: 'Vina score at or below 0 kcal/mol' },
          { id: 'retained', critical: false, threshold: null, evidence: 'REAL_ENGINE_OUTPUT', label: 'Candidate identity retained' },
        ],
        plan: [{ stage: 'docking', engine: 'AutoDock Vina', label: 'Bounded docking reference', evidence: 'REAL_ENGINE_OUTPUT' }],
      },
    },
  });
  assert(response.status === 201, `preregistration failed: ${JSON.stringify(response.body)}`);
  return response.body.preregistration;
}

export async function runCandidateLabHandoffProof({ commit = null, now = () => new Date() } = {}) {
  assert(process.env.GENESIS_STRUCTURAL_WORKER_URL, 'GENESIS_STRUCTURAL_WORKER_URL is required');
  assert(process.env.GENESIS_SCIENTIFIC_WORKER_TOKEN, 'GENESIS_SCIENTIFIC_WORKER_TOKEN is required');
  const db = openDatabase(':memory:');
  try {
    const registered = await api(db, 'POST', '/api/auth/register', {
      body: { email: `candidate-proof-${Date.now()}@genesis.test`, password: 'password123' },
    });
    assert(registered.status === 201, `registration failed: ${JSON.stringify(registered.body)}`);
    const { token, user } = registered.body;
    const projectResponse = await api(db, 'POST', '/api/projects', { token, body: { name: 'Candidate laboratory handoff proof' } });
    assert(projectResponse.status === 201, `project creation failed: ${JSON.stringify(projectResponse.body)}`);
    const project = projectResponse.body.project;

    const campaign = newCampaign(db, {
      projectId: project.id,
      createdBy: user.id,
      objective: 'Produce a traceable computational candidate handoff or an honest blocked outcome.',
    });
    const preregistration = await preregister(db, { projectId: project.id, campaignId: campaign.id, token });
    const candidateId = campaignStore.addCandidate(db, {
      campaignId: campaign.id,
      generation: 0,
      canonicalSmiles: 'Oc1ccccc1',
      valid: true,
      status: 'retained',
    });
    const base = `/api/projects/${project.id}/campaigns/${campaign.id}`;
    const planResponse = await api(db, 'POST', `${base}/virtual-lab`, {
      token,
      body: {
        candidateId,
        hypothesis: 'Phenol produces a reproducible negative Vina scoring-function estimate in the bounded canonical receptor model.',
        requestedCapability: 'molecular-docking',
        params: {
          receptor: {
            receptorSmiles: 'c1ccc2[nH]ccc2c1',
            center: [0, 0, 0],
            boxSize: [20, 20, 20],
            exhaustiveness: 4,
            nPoses: 3,
            seed: 7,
          },
        },
        expectation: { outputKey: 'bestAffinityKcalMol', comparator: 'LTE', threshold: 0 },
      },
    });
    assert(planResponse.status === 201, `plan failed: ${JSON.stringify(planResponse.body)}`);
    const executionId = planResponse.body.plan.executionId;

    const execution = await api(db, 'POST', `${base}/virtual-lab/execute`, {
      token,
      body: { candidateId, executionId },
    });
    assert(execution.status === 201, `execution failed: ${JSON.stringify(execution.body)}`);
    assert(execution.body.result?.status === 'EXECUTED_COMPUTATIONAL_EXPERIMENT', 'docking did not execute');
    assert(execution.body.result?.dispatch?.mode === 'REMOTE_EXECUTION', 'docking did not use the real remote worker');
    assert(execution.body.evidenceProposal?.proposalId, 'canonical Evidence proposal missing');
    const scienceRun = getScienceRun(db, execution.body.result.scienceRunId);
    assert(scienceRun?.engine === 'AutoDock Vina', `unexpected engine: ${scienceRun?.engine}`);

    const replay = await api(db, 'POST', `${base}/virtual-lab/${executionId}/replay`, {
      token,
      body: { candidateId },
    });
    assert(replay.status === 201, `replay failed: ${JSON.stringify(replay.body)}`);
    assert(replay.body.replay?.replayStatus === 'REPLAY_MATCH', `replay did not match: ${JSON.stringify(replay.body)}`);

    const handoff = await api(db, 'POST', `${base}/lab-handoff`, {
      token,
      body: {
        candidateId,
        externalProvider: { providerId: 'unassigned-independent-lab', providerType: 'OTHER_EXTERNAL' },
      },
    });
    assert(handoff.status === 201, `handoff projection failed: ${JSON.stringify(handoff.body)}`);
    assert(handoff.body.handoff?.outcome === 'BLOCKED', 'handoff must remain blocked without safety assessment');
    assert(handoff.body.handoff?.reason === 'SAFETY_UNASSESSED', `unexpected blocker: ${handoff.body.handoff?.reason}`);
    assert(handoff.body.handoff?.evidenceReplayGate?.status === 'READY', 'Evidence/Replay gate is not ready');
    assert(handoff.body.handoff?.validationRequest?.status === 'DRAFT_BLOCKED_BY_RESEARCH_GATE', 'blocked handoff must be a governed draft');

    const emptyCampaign = newCampaign(db, {
      projectId: project.id,
      createdBy: user.id,
      objective: 'Prove that an empty candidate set ends as NO_WINNER.',
    });
    await preregister(db, { projectId: project.id, campaignId: emptyCampaign.id, token });
    const noWinner = await api(db, 'POST', `/api/projects/${project.id}/campaigns/${emptyCampaign.id}/lab-handoff`, { token, body: {} });
    assert(noWinner.status === 200, `NO_WINNER projection failed: ${JSON.stringify(noWinner.body)}`);
    assert(noWinner.body.handoff?.outcome === 'NO_WINNER', 'empty campaign did not remain NO_WINNER');

    const evidenceRow = handoff.body.handoff.evidenceReplayGate.scienceRuns[0];
    const proof = {
      schemaVersion: '1.0.0',
      generatedAt: now().toISOString(),
      commit,
      scope: 'LOCAL_CONTAINER_VERIFIED_CANDIDATE_HANDOFF_NOT_WET_LAB_EXECUTION',
      researchRun: {
        campaignId: campaign.id,
        preregistrationId: preregistration.id,
        candidateId,
        executionId,
      },
      realExecution: {
        scienceRunId: scienceRun.id,
        engine: scienceRun.engine,
        engineVersion: scienceRun.engineVersion,
        capability: scienceRun.capability,
        inputHash: scienceRun.inputHash,
        outputHash: scienceRun.outputHash,
        environmentHash: scienceRun.environmentHash,
        dispatch: execution.body.result.dispatch,
      },
      evidence: {
        proposalId: execution.body.evidenceProposal.proposalId,
        contentHash: execution.body.evidenceProposal.record?.contentHash ?? evidenceRow.evidenceContentHash,
        mode: execution.body.evidenceProposal.mode,
      },
      replay: {
        status: replay.body.replay.replayStatus,
        verificationId: replay.body.replay.verificationId,
        originalOutputHash: evidenceRow.outputHash,
      },
      handoff: {
        outcome: handoff.body.handoff.outcome,
        reason: handoff.body.handoff.reason,
        requestId: handoff.body.handoff.validationRequest.requestId,
        requestStatus: handoff.body.handoff.validationRequest.status,
        evidenceReplayGate: handoff.body.handoff.evidenceReplayGate.status,
        requiresHumanApproval: handoff.body.handoff.requiresHumanApproval,
        executionAuthority: handoff.body.handoff.executionAuthority,
      },
      noWinner: {
        campaignId: emptyCampaign.id,
        outcome: noWinner.body.handoff.outcome,
        reason: noWinner.body.handoff.reason,
      },
      externalBlocker: {
        code: 'BLOCKED_EXTERNAL_ADMET_COMMERCIAL_ADMISSION',
        ownerAction: 'Approve the exact ADMET weights/training-data commercial rights before safety execution can enter a customer handoff.',
      },
      wetLabExecuted: false,
      clinicalClaim: false,
      ok: true,
    };
    return { ...proof, receiptSha256: sha256(proof) };
  } finally {
    db.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('--out is required');
  const proof = await runCandidateLabHandoffProof({ commit: args.commit ?? null });
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof, null, 2));
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  try {
    await main();
  } catch (error) {
    console.error(String(error?.stack ?? error?.message ?? error));
    process.exitCode = 1;
  }
}
