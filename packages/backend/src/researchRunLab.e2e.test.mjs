import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { buildProjectBytProjection } from './cognitiveState.mjs';
import { listProposals } from './knowledgeApi.mjs';
import { LAB_PACKAGE_KIND } from './researchRunLab.mjs';

/**
 * CANDIDATE → LABORATORY E2E with real RDKit and no mock executor.
 * ResearchRun (real engine, frozen prediction, falsification, Evidence PROPOSED, Replay MATCH) → governed lab request →
 * UNSIGNED lab package with the Evidence Pack → a REAL-MEASUREMENT-shaped observation entered from a SEPARATE PROCESS →
 * database reopen → human review (never the ingester) → model vs measurement → Evidence proposal → BYT.
 *
 * The laboratory values below are TEST FIXTURES typed into the intake. No laboratory exists in this test and no number
 * here is a measurement of anything; the point is the path, the gates and what survives a restart.
 */
const RDKIT = rdkitDetect();
const skip = engineUnavailable('rdkit', RDKIT);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const UNIT = 'log10 (dimensionless)';
const ENGINE_NAMES = /rdkit|pyscf|vina|openmm|admet|autodock|crippen/i;
const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is aspirin small and moderately lipophilic?', whyItMatters: 'Lab loop E2E.' }],
  hypotheses: [
    hypothesis('Aspirin molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true }),
    hypothesis('Aspirin Crippen logP is above 3.', { observable: 'crippenLogP', operator: '>', value: 3, critical: true }),
  ],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(PLAN), model: 'fixture' }; },
});
const observationOf = (externalObservationId, value, extra = {}) => ({
  endpointId: 'measured-logp', value, unit: UNIT, observedAt: '2026-10-03T10:00:00Z', methodReference: 'FIXTURE-METHOD-1',
  source: { labId: 'fixture-lab', providerType: 'ACADEMIC_LAB', externalObservationId, sourceUri: `https://lab.example.test/results/${externalObservationId}` },
  quality: { status: 'QC_PASSED', confidence: 0.9 },
  rawArtifactBase64: Buffer.from(`fixture raw file ${externalObservationId} ${value}`).toString('base64'),
  ...extra,
});

test('LAB E2E: candidate → request → UNSIGNED package → measurement from another process → restart → review → comparison → Evidence → BYT', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-lab-e2e-'));
  const dbPath = path.join(dir, 'genesis.db');
  const artifactDir = path.join(dir, 'artifacts');
  let db = openDatabase(dbPath);
  let storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactDir });
  const api = (method, pathname, { token, body, query = {} } = {}) => handleApi(db, { method, pathname, token, body, query, reasoningProvider: provider(), artifactStorage: storage });
  const reopen = () => { db.close(); db = openDatabase(dbPath); storage = createLocalContentAddressedArtifactStorage({ rootDir: artifactDir }); };
  try {
    const owner = api('POST', '/api/auth/register', { body: { email: 'lab-owner@genesis.test', password: 'password123' } }).body;
    const reviewer = api('POST', '/api/auth/register', { body: { email: 'lab-reviewer@genesis.test', password: 'password123' } }).body;
    const project = api('POST', '/api/projects', { token: owner.token, body: { name: 'Lab E2E' } }).body.project;
    const base = `/api/projects/${project.id}`;
    assert.equal(api('POST', `${base}/members`, { token: owner.token, body: { email: 'lab-reviewer@genesis.test', role: 'editor' } }).status, 200);
    const started = await api('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Is aspirin small and moderately lipophilic?' } });
    const runId = started.body.researchRun.researchRunId;
    assert.equal((await api('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
    const lab = `${base}/research-runs/${runId}/lab`;
    const run = async () => (await api('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
    const readLab = async () => (await api('GET', lab, { token: owner.token })).body.lab;

    // 1. Two real executions: A is SUPPORTED, B is FALSIFIED.
    for (let i = 0; i < 2; i += 1) {
      const executed = await api('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: {} });
      assert.equal(executed.status, 201, JSON.stringify(executed.body));
    }
    const before = await run();
    const [a, b] = before.experiments;
    assert.equal(a.falsification.verdict, 'SUPPORTED_WITHIN_PROTOCOL');
    assert.equal(b.falsification.verdict, 'FALSIFIED_WITHIN_PROTOCOL');
    const modelLogP = a.execution.output.crippenLogP;
    assert.equal(typeof modelLogP, 'number');
    const endpoint = { endpointId: 'measured-logp', assay: 'Octanol/water partition coefficient (logP), external laboratory measurement', outputKey: 'crippenLogP', expectedUnit: UNIT, tolerance: { absolute: 0.5 } };

    // 2. Gates: a FALSIFIED experiment, a bad endpoint and a procedure-shaped ask never become requests.
    const falsified = await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: b.experimentId, endpoint } });
    assert.equal(falsified.status, 409);
    assert.equal(falsified.body.reason, 'NOT_SUPPORTED_WITHIN_PROTOCOL');
    assert.equal((await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint: { ...endpoint, outputKey: 'noSuchKey' } } })).status, 422);
    assert.equal((await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint: { ...endpoint, tolerance: null } } })).status, 422);
    assert.equal((await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint: { ...endpoint, assay: 'synthesis of the compound' } } })).status, 422);
    assert.equal((await readLab()).requests.length, 0);

    // 3. The governed request freezes model value, unit and tolerance. Asking twice is the same request.
    const created = await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint, externalProvider: { providerId: 'fixture-lab', providerType: 'ACADEMIC_LAB' } } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const request = created.body.request;
    assert.equal(request.status, 'READY_FOR_EXTERNAL_LAB_REVIEW');
    assert.equal(request.requiresHumanApproval, true);
    assert.equal(request.executionAuthority, 'EXTERNAL_LAB_ONLY');
    assert.equal(request.modelBinding.modelValue, modelLogP);
    assert.equal(request.computationalEvidence.replayVerdict, 'MATCH');
    assert.equal(request.computationalEvidence.evidenceStatus, 'PROPOSED');
    assert.equal((await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint, externalProvider: { providerId: 'fixture-lab', providerType: 'ACADEMIC_LAB' } } })).body.deduped, true);

    // 4. The package for the laboratory: UNSIGNED, Evidence Pack inside, engine names only under technicalDetails.
    const pkgRes = await api('GET', `${lab}/requests/${request.requestId}/package`, { token: owner.token });
    assert.equal(pkgRes.status, 200, JSON.stringify(pkgRes.body));
    const pkg = pkgRes.body.package;
    assert.equal(pkg.kind, LAB_PACKAGE_KIND);
    assert.equal(pkg.integrity.signature.status, 'UNSIGNED');
    assert.match(pkg.integrity.signature.statement, /UNSIGNED/);
    assert.ok(!/signed evidence|signed attestation by/i.test(JSON.stringify({ ...pkg, technicalDetails: undefined, integrity: undefined })));
    const { technicalDetails, ...readable } = pkg;
    assert.ok(!ENGINE_NAMES.test(JSON.stringify(readable)), `engine name leaked outside technicalDetails: ${JSON.stringify(readable).match(ENGINE_NAMES)}`);
    assert.ok(ENGINE_NAMES.test(JSON.stringify(technicalDetails)), 'engine identity is still recorded, in technical details');
    assert.deepEqual(technicalDetails.engines, ['rdkit']);
    assert.equal(technicalDetails.evidencePack.researchRunId, runId);
    assert.equal(technicalDetails.evidencePackVerification.status, 'VALID_INTEGRITY_ONLY');
    assert.equal(readable.forLaboratory.candidate.identity, ASPIRIN);
    assert.equal(readable.forLaboratory.labels.yourResult, 'REAL MEASUREMENT');
    const verifyPkg = async (p) => (await api('POST', `${lab}/package`, { token: owner.token, body: { package: p } })).body.verification;
    const okPkg = await verifyPkg(pkg);
    assert.equal(okPkg.status, 'VALID_INTEGRITY_ONLY', JSON.stringify(okPkg));
    const tampered = globalThis.structuredClone(pkg);
    tampered.technicalDetails.request.modelBinding.modelValue += 1;
    const tamperedVerdict = await verifyPkg(tampered);
    assert.equal(tamperedVerdict.ok, false);
    assert.ok(tamperedVerdict.failures.includes('PACKAGE_HASH_MISMATCH') && tamperedVerdict.failures.includes('REQUEST_FINGERPRINT_MISMATCH'));
    const reSealedPack = globalThis.structuredClone(pkg);
    reSealedPack.technicalDetails.evidencePack.experiments[0].events.EXPERIMENT_HANDOFF.payload.output.crippenLogP += 1;
    assert.equal((await verifyPkg(reSealedPack)).ok, false);
    const claimsSigned = globalThis.structuredClone(pkg);
    claimsSigned.integrity.signature.status = 'SIGNED';
    assert.ok((await verifyPkg(claimsSigned)).failures.includes('SIGNATURE_STATUS_CLAIMED'));

    // 5. A measurement arrives from a SEPARATE PROCESS (intake in the child, memory gone afterwards).
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import { openDatabase } from ${JSON.stringify(path.join(HERE, 'store.mjs'))};
      import { ingestLabObservation } from ${JSON.stringify(path.join(HERE, 'researchRunLab.mjs'))};
      const db = openDatabase(${JSON.stringify(dbPath)});
      const r = ingestLabObservation(db, ${JSON.stringify(project.id)}, ${JSON.stringify(runId)}, { requestId: ${JSON.stringify(request.requestId)}, ingestedBy: ${JSON.stringify(owner.user?.id ?? 'owner')}, observation: ${JSON.stringify(observationOf('OBS-1', 1.19))} });
      console.log('CHILD:' + JSON.stringify({ ok: r.ok, id: r.observation?.observationId, status: r.status }));
    `], { encoding: 'utf8', timeout: 60000 });
    assert.equal(child.status, 0, child.stderr);
    const childResult = JSON.parse(child.stdout.split('\n').find((l) => l.startsWith('CHILD:')).slice(6));
    assert.equal(childResult.ok, true, JSON.stringify(childResult));
    const observationId = childResult.id;

    // 6. RESTART IN THE MIDDLE: new database handle and storage. Nothing is lost, nothing is reviewed yet.
    reopen();
    owner.token = api('POST', '/api/auth/login', { body: { email: 'lab-owner@genesis.test', password: 'password123' } }).body.token;
    reviewer.token = api('POST', '/api/auth/login', { body: { email: 'lab-reviewer@genesis.test', password: 'password123' } }).body.token;
    let state = await readLab();
    assert.equal((await run()).researchState.chain.ok, true);
    assert.equal(state.observations.length, 1);
    assert.equal(state.observations[0].status, 'INGESTED_UNREVIEWED');
    assert.equal(state.observations[0].evidenceClass, 'REAL MEASUREMENT');
    assert.equal(state.observations[0].rawArtifactIntegrity.level, 'VERIFIED_BY_GENESIS');
    assert.equal(state.nextResearchAction.action, 'HUMAN_REVIEW_REQUIRED');
    assert.equal(state.observations[0].ingestedBy, state.requests[0].requestedBy, 'ingested by the same person who asked');

    // 7. Gates before review: no comparison and no Evidence from an unreviewed observation; conflicts and mismatches are refused.
    const obsPath = `${lab}/observations/${observationId}`;
    assert.equal((await api('POST', `${obsPath}/compare`, { token: owner.token })).body.error, 'OBSERVATION_NOT_ACCEPTED');
    assert.equal((await api('POST', `${obsPath}/evidence`, { token: owner.token })).body.error, 'OBSERVATION_NOT_ACCEPTED');
    const conflicting = await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: request.requestId, observation: observationOf('OBS-1', 2.5) } });
    assert.equal(conflicting.body.error, 'EXTERNAL_OBSERVATION_CONFLICT');
    const mismatch = await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: request.requestId, observation: observationOf('OBS-X', 1.0, { rawArtifactSha256: 'a'.repeat(64) }) } });
    assert.equal(mismatch.body.error, 'RAW_ARTIFACT_HASH_MISMATCH');
    assert.equal((await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: request.requestId, observation: { ...observationOf('OBS-Y', 1.0), endpointId: 'other-endpoint' } } })).body.error, 'ENDPOINT_NOT_REQUESTED');
    assert.equal((await readLab()).observations.length, 1);

    // 8. Human review: the ingester cannot review their own observation; another person can.
    assert.equal((await api('POST', obsPath, { token: owner.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION' } })).body.error, 'REVIEWER_CANNOT_BE_INGESTER');
    const reviewed = await api('POST', obsPath, { token: reviewer.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION', note: 'raw file hash checked' } });
    assert.equal(reviewed.status, 201, JSON.stringify(reviewed.body));
    assert.equal((await api('POST', obsPath, { token: reviewer.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION', note: 'raw file hash checked' } })).body.deduped, true);

    // 9. Model vs measurement, from the frozen binding.
    const compared = await api('POST', `${obsPath}/compare`, { token: reviewer.token });
    assert.equal(compared.status, 201, JSON.stringify(compared.body));
    const comparison = compared.body.comparison;
    assert.equal(comparison.verdict, 'AGREES_WITHIN_TOLERANCE');
    assert.equal(comparison.model.value, modelLogP);
    assert.equal(comparison.model.label, 'GENESIS COMPUTATION');
    assert.equal(comparison.measurement.label, 'REAL MEASUREMENT');
    assert.equal(comparison.measurement.value, 1.19);
    assert.ok(Math.abs(comparison.deltaAbs - Math.abs(1.19 - modelLogP)) < 1e-12);
    assert.equal(comparison.clinicalEfficacy, 'UNKNOWN');
    assert.equal((await api('POST', `${obsPath}/compare`, { token: reviewer.token })).body.deduped, true);

    // 10. Evidence: a PROPOSAL on the canonical ledger, pending a human; asking again returns the same one.
    const evidence = await api('POST', `${obsPath}/evidence`, { token: reviewer.token });
    assert.equal(evidence.status, 201, JSON.stringify(evidence.body));
    assert.equal(evidence.body.link.status, 'PENDING_HUMAN_PUBLICATION');
    assert.equal(evidence.body.link.mode, 'PROPOSE_ONLY');
    const proposal = listProposals().proposals.find((p) => p.proposalId === evidence.body.link.proposalId);
    assert.ok(proposal, 'the lab Evidence exists as a proposal in the canonical knowledge ledger');
    assert.notEqual(proposal.status, 'published');
    assert.match(proposal.claim ?? '', /External laboratory observation/);
    assert.equal((await api('POST', `${obsPath}/evidence`, { token: reviewer.token })).body.deduped, true);

    // 11. A tighter, separate request is frozen from the same model value: the same kind of measurement now DISAGREES.
    const tight = (await api('POST', `${lab}/requests`, { token: owner.token, body: { experimentId: a.experimentId, endpoint: { ...endpoint, tolerance: { absolute: 0.05 } } } })).body.request;
    assert.notEqual(tight.requestId, request.requestId);
    const second = (await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: tight.requestId, observation: observationOf('OBS-2', 1.19) } })).body.observation;
    assert.equal((await api('POST', `${lab}/observations/${second.observationId}`, { token: reviewer.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION' } })).status, 201);
    const tightCmp = (await api('POST', `${lab}/observations/${second.observationId}/compare`, { token: reviewer.token })).body.comparison;
    assert.equal(tightCmp.verdict, 'DISAGREES_OUTSIDE_TOLERANCE');
    // A different unit is refused at comparison, never coerced.
    const wrongUnit = (await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: request.requestId, observation: observationOf('OBS-3', 1.2, { unit: 'mg/mL' }) } })).body.observation;
    assert.equal((await api('POST', `${lab}/observations/${wrongUnit.observationId}`, { token: reviewer.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION' } })).status, 201);
    assert.equal((await api('POST', `${lab}/observations/${wrongUnit.observationId}/compare`, { token: reviewer.token })).body.error, 'UNIT_MISMATCH');
    // A failed-QC observation can never be accepted.
    const qcFailed = (await api('POST', `${lab}/observations`, { token: owner.token, body: { requestId: request.requestId, observation: observationOf('OBS-4', 1.2, { quality: { status: 'QC_FAILED' } }) } })).body.observation;
    assert.equal((await api('POST', `${lab}/observations/${qcFailed.observationId}`, { token: reviewer.token, body: { verdict: 'ACCEPTED_AS_OBSERVATION' } })).body.error, 'QC_FAILED_CANNOT_BE_ACCEPTED');

    // 12. Second restart: the whole loop is rebuilt from the chain, the Evidence Pack still verifies and BYT shows the measurement.
    const labBefore = await readLab();
    const chainLength = (await run()).researchState.events.length;
    reopen();
    owner.token = api('POST', '/api/auth/login', { body: { email: 'lab-owner@genesis.test', password: 'password123' } }).body.token;
    const labAfter = await readLab();
    assert.deepEqual(labAfter, labBefore, 'the loop is identical after a restart');
    assert.equal(labAfter.nextResearchAction.action, 'REVISE_MODEL_OR_HYPOTHESIS', 'the latest comparison disagrees');
    assert.equal(labAfter.evidenceLinks.length, 1);
    const after = await run();
    assert.equal(after.researchState.chain.ok, true);
    assert.equal(after.researchState.events.length, chainLength);
    assert.equal(after.nextStep, before.nextStep, 'lab events do not change the experiment lifecycle');
    assert.deepEqual(after.experiments.map((x) => x.execution.outputHash), before.experiments.map((x) => x.execution.outputHash));
    const packAfter = (await api('GET', `${base}/research-runs/${runId}/evidence-pack`, { token: owner.token })).body.pack;
    const packVerdict = (await api('POST', `${base}/research-runs/${runId}/evidence-pack/verify`, { token: owner.token, body: { pack: packAfter } })).body.verification;
    assert.equal(packVerdict.status, 'VALID_INTEGRITY_ONLY', JSON.stringify(packVerdict.failures));
    assert.ok(packAfter.eventRefs.some((r) => r.type === 'LAB_MODEL_MEASUREMENT_COMPARED'), 'the pack chain covers the lab events');

    const byt = buildProjectBytProjection(db, project.id);
    assert.equal(byt.measurementCalibration.evidenceClass, 'REAL_MEASUREMENT');
    assert.equal(byt.measurementCalibration.compared, 2);
    assert.equal(byt.measurementCalibration.agreesWithinTolerance, 1);
    assert.equal(byt.measurementCalibration.disagreesOutsideTolerance, 1);
    const entry = byt.predictionLedger.find((e) => e.experimentId === a.experimentId);
    assert.equal(entry.verdict, 'SUPPORTED_WITHIN_PROTOCOL', 'a measurement does not rewrite the protocol verdict');
    assert.equal(entry.measurements.length, 2);
    assert.equal(byt.predictionLedger.find((e) => e.experimentId === b.experimentId).measurements.length, 0);
  } finally { try { db.close(); } catch { /* closed */ } rmSync(dir, { recursive: true, force: true }); }
});
