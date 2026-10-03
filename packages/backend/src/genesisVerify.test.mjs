import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase, listScienceRunVerifications } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { createResearchRunWorker } from './researchRunJobs.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { renderVerifyReportHtml, verifySubmittedRecord } from './genesisVerify.mjs';

/**
 * TEST 1 — Genesis Verify end to end on a REAL ResearchRun record:
 * customer input (the execution-bundle artifact a ResearchRun persists) → Genesis Verify → evidence analysis
 * (provenance, content hashes, ledger anchor) → real RDKit replay → one-page customer report.
 * Three inputs: valid, tampered, missing provenance.
 */
const RDKIT = rdkitDetect();
const skip = RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}`;
const plan = {
  subProblems: [{ question: 'Aspirin molecular weight?', whyItMatters: 'Genesis Verify proof.' }],
  hypotheses: [{
    claim: 'Aspirin molecular weight is below 200 Da.', claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
    uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
    falsificationProposal: 'The frozen molWt criterion is not met.',
    experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: 'CC(=O)Oc1ccccc1C(=O)O', predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] }, parameterChanges: [] },
  }],
  nextActions: ['Human review'],
};
const provider = () => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete() { return { text: JSON.stringify(plan), model: 'fixture' }; },
});

async function realRecord(dir) {
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const db = openDatabase(path.join(dir, 'genesis.db'));
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider(), artifactStorage: storage });
  const owner = call('POST', '/api/auth/register', { body: { email: 'verify@genesis.test', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Genesis Verify proof' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Aspirin molecular weight?' } })).body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token, body: { async: true } });
  assert.equal((await createResearchRunWorker(db, { artifactStorage: storage }).runOnce()).state, 'SUCCEEDED');
  const run = (await call('GET', `${base}/research-runs/${runId}`, { token: owner.token })).body.researchRun;
  const x = run.experiments[0];
  assert.equal(x.execution.status, 'EXECUTED');
  const got = await call('GET', `${base}/research-runs/${runId}/experiments/${x.experimentId}/artifact`, { token: owner.token });
  assert.equal(got.status, 200, JSON.stringify(got.body));
  const ref = got.body.artifactRef;
  const bytes = readFileSync(path.join(storage.rootDir, ref.key));
  return { db, call, owner, project, base, run, x, ref, bytes };
}

const checkOf = (report, id) => report.checks.find((c) => c.id === id);

test('Genesis Verify: valid, tampered and missing-provenance ResearchRun records', { skip }, async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-verify-'));
  let ctx;
  try {
    ctx = await realRecord(dir);
    const { db, project, x, ref, bytes } = ctx;
    const replaysBefore = listScienceRunVerifications(db, x.execution.scienceRunId).length;

    // 1. VALID: the exact file the customer received, with its sha256, anchored in this project's ledger.
    const valid = verifySubmittedRecord(bytes, { declaredSha256: ref.sha256, db, projectId: project.id });
    assert.equal(valid.verdict, 'MATCH', JSON.stringify(valid.checks, null, 2));
    for (const id of ['readable', 'file-hash', 'provenance', 'content-hash', 'ledger-anchor', 'replay']) assert.equal(checkOf(valid, id).status, 'PASS', id);
    assert.equal(valid.input.shape, 'EXECUTION_BUNDLE');
    assert.equal(valid.hashes.submittedFileSha256, ref.sha256);
    assert.equal(valid.hashes.replayOutputHash, x.execution.outputHash, 'real RDKit replay reproduced the recorded output byte for byte');
    assert.equal(valid.replay.capability, 'molecular-descriptors');
    assert.equal(valid.signature, 'UNSIGNED');
    assert.ok(valid.notChecked.some((n) => /CSRN production signing key has not been generated/.test(n)));
    assert.match(valid.reportFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(listScienceRunVerifications(db, x.execution.scienceRunId).length, replaysBefore, 'verify writes no verification row into the ledger');

    // The same record in its other persisted shape (the EXPERIMENT_HANDOFF execution record) is accepted too.
    const handoff = verifySubmittedRecord(JSON.stringify(x.execution), { db, projectId: project.id });
    assert.equal(handoff.verdict, 'MATCH');
    assert.equal(handoff.input.shape, 'EXECUTION_RECORD');

    // Unanchored (verified by someone without this project's ledger): still MATCH, and the report says what it could not see.
    const unanchored = verifySubmittedRecord(bytes, { declaredSha256: ref.sha256 });
    assert.equal(unanchored.verdict, 'MATCH');
    assert.equal(checkOf(unanchored, 'ledger-anchor').status, 'NOT_RUN');
    assert.ok(unanchored.notChecked.some((n) => /only as DRIFT on replay/.test(n)));

    // Customer deliverable: one phone-readable page through the API.
    const api = await ctx.call('POST', `${ctx.base}/genesis-verify`, { token: ctx.owner.token, body: { record: bytes.toString('utf8'), declaredSha256: ref.sha256, format: 'html' } });
    assert.equal(api.status, 200, JSON.stringify(api.body));
    assert.equal(api.body.report.verdict, 'MATCH');
    const html = api.body.html;
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    for (const s of ['MATCH', 'What was checked', 'Hashes', 'What was NOT checked', 'UNSIGNED', ref.sha256]) assert.ok(html.includes(s), s);
    assert.doesNotMatch(html, /<script|https?:\/\//, 'self-contained page, no scripts or external resources');

    // 2. TAMPERED: one number changed in the file, hashes left as they were.
    const record = JSON.parse(bytes.toString('utf8'));
    const edited = { ...record, output: { ...record.output, molWt: 150.0 } };
    const naive = verifySubmittedRecord(canonicalJson(edited), { db, projectId: project.id });
    assert.equal(naive.verdict, 'TAMPERED');
    assert.ok(naive.reasons.includes('CONTENT_HASH_MISMATCH'));
    assert.equal(checkOf(naive, 'replay').status, 'NOT_RUN', 'a tampered record is never fed to an engine');

    // TAMPERED, careful forger: output edited AND outputHash recomputed, so the record is self-consistent.
    const forged = { ...edited, outputHash: sha256Hex(canonicalJson(edited.output)) };
    const forgedBytes = canonicalJson(forged);
    const caught = verifySubmittedRecord(forgedBytes, { declaredSha256: ref.sha256, db, projectId: project.id });
    assert.equal(caught.verdict, 'TAMPERED');
    assert.ok(caught.reasons.includes('FILE_HASH_MISMATCH'));
    assert.ok(caught.reasons.includes('LEDGER_MISMATCH'));
    assert.match(checkOf(caught, 'ledger-anchor').detail, /output, outputHash/);
    // Honest boundary: with no anchor at all, the same forgery is exposed only by the real replay, as DRIFT.
    const noAnchor = verifySubmittedRecord(forgedBytes);
    assert.equal(noAnchor.verdict, 'DRIFT');
    assert.ok(noAnchor.reasons.includes('OUTPUT_DIFFERS'));
    assert.equal(noAnchor.hashes.replayOutputHash, x.execution.outputHash);

    // 3. MISSING PROVENANCE: engine identity and preregistration fingerprint stripped.
    const stripped = { ...record };
    delete stripped.engine;
    delete stripped.preregistrationFingerprint;
    const missing = verifySubmittedRecord(canonicalJson(stripped), { db, projectId: project.id });
    assert.equal(missing.verdict, 'BLOCKED');
    assert.ok(missing.reasons.includes('MISSING_PROVENANCE'));
    assert.match(checkOf(missing, 'provenance').detail, /engine\.engineId/);
    assert.match(checkOf(missing, 'provenance').detail, /preregistrationFingerprint/);
    assert.equal(checkOf(missing, 'replay').status, 'NOT_RUN');
    const missingHtml = renderVerifyReportHtml(missing);
    assert.ok(missingHtml.includes('BLOCKED') && missingHtml.includes('neither a pass nor a fail'));
  } finally {
    try { ctx?.db.close(); } catch { /* closed */ }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Genesis Verify: unreadable input and a bad declared hash are BLOCKED, never MATCH', () => {
  const garbage = verifySubmittedRecord('not json at all');
  assert.equal(garbage.verdict, 'BLOCKED');
  assert.ok(garbage.reasons.includes('NOT_JSON'));
  const empty = verifySubmittedRecord('');
  assert.equal(empty.verdict, 'BLOCKED');
  const unknown = verifySubmittedRecord(JSON.stringify({ hello: 'world' }));
  assert.equal(unknown.verdict, 'BLOCKED');
  assert.ok(unknown.reasons.includes('MISSING_PROVENANCE'));
  const badHash = verifySubmittedRecord(JSON.stringify({ hello: 'world' }), { declaredSha256: 'xyz' });
  assert.equal(badHash.verdict, 'BLOCKED');
  assert.ok(badHash.reasons.includes('DECLARED_SHA256_INVALID'));
  const html = renderVerifyReportHtml(verifySubmittedRecord('<script>alert(1)</script>'));
  assert.doesNotMatch(html, /<script>alert/, 'submitted content is escaped in the page');
});
