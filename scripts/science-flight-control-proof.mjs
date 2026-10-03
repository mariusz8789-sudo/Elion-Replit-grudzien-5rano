#!/usr/bin/env node
/**
 * Executable Science Flight Control proof:
 * pre-flight -> real RDKit -> delta -> Evidence -> Replay -> BYT projection,
 * plus an honestly blocked invalid-input flight and restart reconstruction.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { handleApi } from '../packages/backend/src/api.mjs';
import { openDatabase } from '../packages/backend/src/store.mjs';
import * as campaignStore from '../packages/backend/src/campaign/persistence.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) if (argv[index].startsWith('--')) args[argv[index].slice(2)] = argv[++index];
  return args;
}

async function api(db, method, pathname, { token, body, query } = {}) {
  return handleApi(db, { method, pathname, token, body, query });
}

async function dossier(db, { base, candidateId, token }) {
  const response = await api(db, 'GET', `${base}/virtual-lab`, { token, query: { candidate: candidateId } });
  assert(response.status === 200, `dossier failed: ${JSON.stringify(response.body)}`);
  return response.body.dossier;
}

export async function runScienceFlightControlProof({ commit = null, now = () => new Date() } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-science-flight-control-'));
  const databasePath = path.join(dir, 'genesis.db');
  let db = openDatabase(databasePath);
  try {
    const registered = await api(db, 'POST', '/api/auth/register', {
      body: { email: `flight-control-proof-${Date.now()}@genesis.test`, password: 'password123' },
    });
    assert(registered.status === 201, `registration failed: ${JSON.stringify(registered.body)}`);
    const { token, user } = registered.body;
    const projectResponse = await api(db, 'POST', '/api/projects', { token, body: { name: 'Science Flight Control proof' } });
    assert(projectResponse.status === 201, `project failed: ${JSON.stringify(projectResponse.body)}`);
    const project = projectResponse.body.project;
    const campaign = campaignStore.createCampaign(db, {
      projectId: project.id,
      objective: 'Prove preflight, execution delta, failure attribution, Evidence, Replay and BYT reconstruction.',
      domain: 'CHEMISTRY',
      createdBy: user.id,
    });
    const successfulCandidateId = campaignStore.addCandidate(db, {
      campaignId: campaign.id, generation: 0, canonicalSmiles: 'CCO', valid: true, status: 'retained',
    });
    const blockedCandidateId = campaignStore.addCandidate(db, {
      campaignId: campaign.id, generation: 0, canonicalSmiles: 'CCN', valid: true, status: 'retained',
    });
    const base = `/api/projects/${project.id}/campaigns/${campaign.id}`;

    const planned = await api(db, 'POST', `${base}/virtual-lab`, {
      token,
      body: {
        candidateId: successfulCandidateId,
        hypothesis: 'Ethanol has a reproducible RDKit Crippen LogP below 1.0 in this bounded computation.',
        requestedCapability: 'molecular-descriptors',
        budget: { maxComputeSeconds: 10 },
        expectation: { outputKey: 'crippenLogP', comparator: 'LTE', threshold: 1 },
      },
    });
    assert(planned.status === 201, `plan failed: ${JSON.stringify(planned.body)}`);
    const executionId = planned.body.plan.executionId;
    const executed = await api(db, 'POST', `${base}/virtual-lab/execute`, {
      token, body: { candidateId: successfulCandidateId, executionId },
    });
    assert(executed.status === 201, `execution failed: ${JSON.stringify(executed.body)}`);
    assert(executed.body.result?.status === 'EXECUTED_COMPUTATIONAL_EXPERIMENT', 'RDKit did not execute');
    assert(executed.body.evidenceProposal?.proposalId, 'canonical Evidence proposal missing');

    const beforeReplay = await dossier(db, { base, candidateId: successfulCandidateId, token });
    const awaitingReplay = beforeReplay.flightControl.flights.find((flight) => flight.executionId === executionId);
    assert(awaitingReplay?.status === 'AWAITING_REPLAY', `expected AWAITING_REPLAY, got ${awaitingReplay?.status}`);
    assert(awaitingReplay?.executionDelta?.inputIntegrity === 'MATCH', 'plan/execution input identity drifted');

    const replay = await api(db, 'POST', `${base}/virtual-lab/${executionId}/replay`, {
      token, body: { candidateId: successfulCandidateId },
    });
    assert(replay.status === 201, `replay failed: ${JSON.stringify(replay.body)}`);
    assert(replay.body.replay?.replayStatus === 'REPLAY_MATCH', 'RDKit replay did not match');
    const verifiedDossier = await dossier(db, { base, candidateId: successfulCandidateId, token });
    const verifiedFlight = verifiedDossier.flightControl.flights.find((flight) => flight.executionId === executionId);
    assert(verifiedFlight?.status === 'VERIFIED', `expected VERIFIED, got ${verifiedFlight?.status}`);
    assert(verifiedFlight?.bytUpdate?.status === 'ELIGIBLE_FOR_SELF_MODEL_PROJECTION', 'BYT projection gate is not eligible');

    const blockedPlan = await api(db, 'POST', `${base}/virtual-lab`, {
      token,
      body: {
        candidateId: blockedCandidateId,
        hypothesis: 'A caller-supplied PDB structure must pass real structural validation.',
        requestedCapability: 'protein-structure-ingestion',
      },
    });
    assert(blockedPlan.status === 201, `blocked-path plan failed: ${JSON.stringify(blockedPlan.body)}`);
    const blockedExecutionId = blockedPlan.body.plan.executionId;
    const blockedExecution = await api(db, 'POST', `${base}/virtual-lab/execute`, {
      token, body: { candidateId: blockedCandidateId, executionId: blockedExecutionId },
    });
    assert(blockedExecution.status === 201, `blocked-path execution failed: ${JSON.stringify(blockedExecution.body)}`);
    assert(blockedExecution.body.result?.status === 'BLOCKED_INVALID_INPUT', 'missing PDB did not fail closed');
    assert(blockedExecution.body.evidenceProposal === null, 'blocked execution must not create Evidence');
    const blockedDossier = await dossier(db, { base, candidateId: blockedCandidateId, token });
    const blockedFlight = blockedDossier.flightControl.flights.find((flight) => flight.executionId === blockedExecutionId);
    assert(blockedFlight?.status === 'BLOCKED', `expected BLOCKED, got ${blockedFlight?.status}`);
    assert(blockedFlight?.failureAttribution?.layer === 'PREFLIGHT', `unexpected failure layer: ${blockedFlight?.failureAttribution?.layer}`);

    const cognitive = await api(db, 'GET', `/api/projects/${project.id}/cognitive-state`, { token });
    assert(cognitive.status === 200, `cognitive state failed: ${JSON.stringify(cognitive.body)}`);
    const bytFlights = cognitive.body.cognitiveState.byt.scienceFlightControl.flights;
    assert(bytFlights.some((flight) => flight.executionId === executionId && flight.status === 'VERIFIED'), 'BYT did not project verified flight');
    assert(bytFlights.some((flight) => flight.executionId === blockedExecutionId && flight.failureAttribution?.layer === 'PREFLIGHT'), 'BYT did not project blocked flight');
    const controlFingerprints = bytFlights.map((flight) => flight.flightFingerprint).sort();

    db.close();
    db = openDatabase(databasePath);
    const afterRestart = await api(db, 'GET', `/api/projects/${project.id}/cognitive-state`, { token });
    assert(afterRestart.status === 200, `post-restart cognitive state failed: ${JSON.stringify(afterRestart.body)}`);
    const restartedFingerprints = afterRestart.body.cognitiveState.byt.scienceFlightControl.flights.map((flight) => flight.flightFingerprint).sort();
    assert(JSON.stringify(restartedFingerprints) === JSON.stringify(controlFingerprints), 'Flight Control fingerprints changed after restart');

    const proof = {
      schemaVersion: '1.0.0',
      generatedAt: now().toISOString(),
      commit,
      scope: 'REAL_LOCAL_RDKIT_FLIGHT_CONTROL_NOT_PHYSICAL_OR_CLINICAL_VALIDATION',
      projectId: project.id,
      campaignId: campaign.id,
      verifiedFlight: {
        executionId,
        inputFingerprint: verifiedFlight.preflight.inputFingerprint,
        preflightDecision: verifiedFlight.preflight.decision,
        inputIntegrity: verifiedFlight.executionDelta.inputIntegrity,
        engine: verifiedFlight.executionDelta.selectedEngine,
        scienceRunId: verifiedFlight.executionDelta.scienceRunId,
        outputFingerprint: verifiedFlight.executionDelta.outputFingerprint,
        evidenceProposalId: verifiedFlight.evidenceUpdate.proposalId,
        replayStatus: verifiedFlight.replay.status,
        verificationId: verifiedFlight.replay.verificationId,
        bytEpistemicState: verifiedFlight.bytUpdate.epistemicState,
        flightFingerprint: verifiedFlight.flightFingerprint,
      },
      blockedFlight: {
        executionId: blockedExecutionId,
        status: blockedFlight.status,
        failureAttribution: blockedFlight.failureAttribution,
        evidenceStatus: blockedFlight.evidenceUpdate.status,
        replayStatus: blockedFlight.replay.status,
        flightFingerprint: blockedFlight.flightFingerprint,
      },
      restartRecovery: {
        before: controlFingerprints,
        after: restartedFingerprints,
        match: true,
      },
      boundaries: {
        physicalMeasurement: false,
        clinicalClaim: false,
        evidencePublicationRequiresHumanApproval: true,
        flightControlOwnsState: false,
        bytStoreCreated: false,
      },
      ok: true,
    };
    return { ...proof, receiptSha256: sha256(proof) };
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.out) throw new Error('--out is required');
  const proof = await runScienceFlightControlProof({ commit: args.commit ?? null });
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
