import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { DEFAULT_RESEARCH_TOOLS } from './researchRunEngines.mjs';
import { executeResearchExperiment } from './researchRunExecution.mjs';
import { buildResearchRunEvidencePack, computePackIntegrity, PACK_FAILURE, validateAgainstSchema, verifyResearchRunEvidencePack } from './researchRunEvidencePack.mjs';

/**
 * The Evidence Pack of a REAL ResearchRun: real RDKit, real preregistration, seal, Evidence proposal, Replay
 * and artifact custody, then every mutation class the pack must refuse. No mock executor anywhere; the
 * only fixture is the model's JSON plan (as in goldenResearchRun.e2e.test.mjs).
 */
const skip = engineUnavailable('rdkit', rdkitDetect());
const ASTRA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../docs/astra');
const SCHEMA = JSON.parse(readFileSync(path.join(ASTRA, 'schema.json'), 'utf8'));
const EXAMPLE = JSON.parse(readFileSync(path.join(ASTRA, 'example.json'), 'utf8'));
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const hypothesis = (claim, prediction) => ({
  claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
  uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
  falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
  experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
});
const PLAN = {
  subProblems: [{ question: 'Is aspirin small and hydrophilic?', whyItMatters: 'Evidence Pack proof.' }],
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

let ctx;
before(async () => {
  if (skip) return;
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-evidence-pack-'));
  const storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
  const db = openDatabase(path.join(dir, 'genesis.db'));
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider: provider(), artifactStorage: storage });
  const owner = call('POST', '/api/auth/register', { body: { email: 'pack@genesis.test', password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Evidence Pack' } }).body.project;
  const base = `/api/projects/${project.id}`;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: PLAN.subProblems[0].question } })).body.researchRun.researchRunId;
  assert.equal((await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token })).status, 201);
  for (let i = 0; i < 2; i += 1) {
    const done = await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token });
    assert.equal(done.status, 201, JSON.stringify(done.body));
    assert.equal(done.body.artifactCustody.status, 'PERSISTED');
  }
  const got = await call('GET', `${base}/research-runs/${runId}/evidence-pack`, { token: owner.token });
  assert.equal(got.status, 200, JSON.stringify(got.body));
  ctx = { dir, db, storage, call, owner, project, base, runId, pack: got.body.pack };
});
after(() => { if (ctx) { ctx.db.close(); rmSync(ctx.dir, { recursive: true, force: true }); } });

const clone = () => JSON.parse(JSON.stringify(ctx.pack));
const offline = (pack) => verifyResearchRunEvidencePack(pack);
const anchored = (pack, withStorage = true) => verifyResearchRunEvidencePack(pack, { db: ctx.db, projectId: ctx.project.id, artifactStorage: withStorage ? ctx.storage : null });
const byVerdict = (pack, verdict) => pack.experiments.find((x) => x.summary.protocolVerdict === verdict);
async function assertRejected(pack, code) {
  for (const result of [await offline(pack), await anchored(pack)]) {
    assert.equal(result.ok, false);
    assert.equal(result.status, 'REJECTED');
    assert.ok(result.codes.includes(code), `${code} expected, got ${JSON.stringify(result.failures)}`);
  }
}

test('valid: the pack of a real run matches docs/astra/schema.json and verifies offline and against the records', { skip }, async () => {
  const { pack } = ctx;
  assert.deepEqual(validateAgainstSchema(SCHEMA, pack), []);
  assert.deepEqual(validateAgainstSchema(SCHEMA, EXAMPLE), [], 'the synthetic example still validates');
  assert.equal(pack.recordMode, 'RESOLVED_EXPORT');
  assert.equal(pack.researchRunId, ctx.runId);
  assert.equal(pack.experiments.length, 2);
  const run = (await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}`, { token: ctx.owner.token })).body.researchRun;
  for (const x of run.experiments) {
    const packed = pack.experiments.find((p) => p.experimentId === x.experimentId);
    assert.equal(packed.summary.engineId, 'rdkit');
    assert.equal(packed.summary.engineVersion, x.execution.engine.version ?? x.execution.engine.engineLabel);
    assert.equal(packed.summary.inputHash, x.execution.inputHash);
    assert.equal(packed.summary.outputHash, x.execution.outputHash);
    assert.equal(packed.summary.inputHash, sha256Hex(canonicalJson(x.frozen.input)));
    assert.equal(packed.summary.preregistrationFingerprint, x.frozen.preregistrationFingerprint);
    assert.equal(packed.summary.predictionFingerprint, x.frozen.predictionFingerprint);
    assert.equal(packed.summary.protocolVerdict, x.falsification.verdict);
    assert.equal(packed.summary.replayVerdict, 'MATCH');
    assert.match(packed.summary.artifactId, /^artifact:[a-f0-9]{64}$/);
    assert.deepEqual(packed.events.EXPERIMENT_HANDOFF.payload.environment, x.execution.environment);
  }
  assert.deepEqual(pack.experiments.map((x) => x.summary.protocolVerdict).sort(), ['FALSIFIED_WITHIN_PROTOCOL', 'SUPPORTED_WITHIN_PROTOCOL']);
  assert.equal(pack.experimentRecordRefs.length, 4);
  assert.equal(pack.scienceRunRefs.length, 2);
  assert.equal(pack.evidenceRefs.length, 2);
  assert.ok(pack.replayRefs.length >= 2);
  assert.deepEqual({ ...pack.verification, missing: undefined }, { referenceResolution: 'MATCH', integrity: 'VALID_INTEGRITY_ONLY', completeness: 'INCOMPLETE', delivery: 'BLOCKED', missing: undefined });
  assert.ok(pack.verification.missing.some((m) => m.startsWith('No report artifact')), 'absent producers stay absent, never invented');

  const off = await offline(pack);
  assert.deepEqual(off.failures, []);
  assert.equal(off.status, 'VALID_INTEGRITY_ONLY');
  const viaRoute = await ctx.call('POST', `${ctx.base}/research-runs/${ctx.runId}/evidence-pack/verify`, { token: ctx.owner.token, body: { pack } });
  assert.equal(viaRoute.status, 200);
  assert.deepEqual(viaRoute.body.verification.failures, []);
  assert.equal(viaRoute.body.verification.anchored, true);

  const again = await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}/evidence-pack`, { token: ctx.owner.token });
  assert.equal(again.body.pack.integrity.packHash, pack.integrity.packHash, 'deterministic: the same records give the same pack');
  assert.equal((await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}/evidence-pack`)).status, 401);
  const stranger = ctx.call('POST', '/api/auth/register', { body: { email: 'stranger-pack@genesis.test', password: 'password123' } }).body;
  assert.ok([403, 404].includes((await ctx.call('GET', `${ctx.base}/research-runs/${ctx.runId}/evidence-pack`, { token: stranger.token })).status));
});

test('mutated parameter is rejected: input, recomputed input hash, or a frozen threshold', { skip }, async () => {
  const input = clone();
  input.experiments[0].events.EXPERIMENT_HANDOFF.payload.input.smiles = 'CCO';
  await assertRejected(input, PACK_FAILURE.PARAMETER_MUTATED);

  const rehashed = clone();
  const handoff = rehashed.experiments[0].events.EXPERIMENT_HANDOFF.payload;
  handoff.input.smiles = 'CCO';
  handoff.inputHash = sha256Hex(canonicalJson(handoff.input));
  await assertRejected(rehashed, PACK_FAILURE.PARAMETER_MUTATED);

  const threshold = clone();
  threshold.experiments[0].events.PREDICTIONS_FROZEN.payload.criteria[0].value = 1000;
  await assertRejected(threshold, PACK_FAILURE.PARAMETER_MUTATED);
});

test('mutated data is rejected, also when every pack-level hash is forged consistently', { skip }, async () => {
  const data = clone();
  const output = data.experiments[0].events.EXPERIMENT_HANDOFF.payload.output;
  output.molWt += 1;
  await assertRejected(data, PACK_FAILURE.DATA_MUTATED);

  const forged = clone();
  const handoff = forged.experiments[0].events.EXPERIMENT_HANDOFF.payload;
  handoff.output.molWt += 1;
  handoff.outputHash = sha256Hex(canonicalJson(handoff.output));
  forged.experiments[0].summary.outputHash = handoff.outputHash;
  forged.integrity = computePackIntegrity(forged);
  const off = await offline(forged);
  assert.equal(off.ok, false);
  assert.ok(off.codes.includes(PACK_FAILURE.EVENT_FINGERPRINT_MISMATCH));
  assert.ok(off.codes.includes(PACK_FAILURE.DATA_MUTATED), 'the seal and artifact still bind the original output');
  const anchor = await anchored(forged);
  assert.ok(anchor.codes.includes(PACK_FAILURE.STATE_ANCHOR_MISMATCH));
});

test('mutated artifact is rejected: a changed ref in the pack, or changed bytes in custody', { skip }, async () => {
  const ref = clone();
  ref.experiments[0].events.ARTIFACT_PERSISTED.payload.artifactRef.sha256 = 'f'.repeat(64);
  await assertRejected(ref, PACK_FAILURE.ARTIFACT_MUTATED);

  const pristine = clone();
  const artifact = pristine.experiments[0].events.ARTIFACT_PERSISTED.payload.artifactRef;
  const file = path.join(ctx.storage.rootDir, artifact.key);
  const original = readFileSync(file);
  try {
    writeFileSync(file, Buffer.concat([original, Buffer.from(' ')]));
    assert.equal((await offline(pristine)).ok, true, 'offline the pack is self-consistent; bytes need custody to check');
    const result = await anchored(pristine);
    assert.equal(result.ok, false);
    assert.ok(result.codes.includes(PACK_FAILURE.ARTIFACT_MUTATED), JSON.stringify(result.failures));
  } finally { writeFileSync(file, original); }
  assert.equal((await anchored(pristine)).ok, true);
});

test('mutated analysis or verdict is rejected', { skip }, async () => {
  const verdict = clone();
  const falsified = byVerdict(verdict, 'FALSIFIED_WITHIN_PROTOCOL');
  falsified.events.SELF_FALSIFICATION.payload.verdict = 'SUPPORTED_WITHIN_PROTOCOL';
  falsified.summary.protocolVerdict = 'SUPPORTED_WITHIN_PROTOCOL';
  await assertRejected(verdict, PACK_FAILURE.ANALYSIS_MUTATED);

  const criterion = clone();
  const c = byVerdict(criterion, 'FALSIFIED_WITHIN_PROTOCOL').events.SELF_FALSIFICATION.payload.criteria[0];
  c.status = 'MET';
  await assertRejected(criterion, PACK_FAILURE.ANALYSIS_MUTATED);

  const replay = clone();
  replay.experiments[0].events.NEXT_EXPERIMENT.payload.replay.replayOutputHash = '0'.repeat(16);
  await assertRejected(replay, PACK_FAILURE.ANALYSIS_MUTATED);
});

test('mutated engine or environment identity is rejected', { skip }, async () => {
  const engine = clone();
  engine.experiments[0].events.EXPERIMENT_HANDOFF.payload.engine.version = '0.0.0-substitute';
  await assertRejected(engine, PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED);

  const engineId = clone();
  engineId.experiments[0].events.EXPERIMENT_HANDOFF.payload.engine.engineId = 'mock';
  engineId.experiments[0].summary.engineId = 'mock';
  await assertRejected(engineId, PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED);

  const environment = clone();
  environment.experiments[0].events.EXPERIMENT_HANDOFF.payload.environment.node = '0.0.0';
  await assertRejected(environment, PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED);
});

test('missing provenance is rejected', { skip }, async () => {
  const cases = [
    (p) => { delete p.producerCommit; },
    (p) => { delete p.experiments[0].events.PREDICTIONS_FROZEN.payload.preregistrationRecordId; },
    (p) => { delete p.experiments[0].events.EVIDENCE_UPDATE; },
    (p) => { delete p.experiments[0].events.EXPERIMENT_HANDOFF.payload.environment; },
    (p) => { for (const ref of p.eventRefs) delete ref.transitionFingerprint; },
    (p) => { delete p.integrity; },
  ];
  for (const mutate of cases) {
    const pack = clone();
    mutate(pack);
    await assertRejected(pack, PACK_FAILURE.PROVENANCE_MISSING);
  }
});

test('missing engine: BLOCKED, never a mock pack', { skip }, async () => {
  const { db, call, owner, base, project } = ctx;
  const runId = (await call('POST', `${base}/research-runs`, { token: owner.token, body: { question: 'Blocked engine: is aspirin small?' } })).body.researchRun.researchRunId;
  await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
  const fresh = await call('GET', `${base}/research-runs/${runId}/evidence-pack`, { token: owner.token });
  assert.equal(fresh.status, 409);
  assert.deepEqual(fresh.body, { error: 'BLOCKED', blockers: [{ experimentId: null, reason: 'NO_EXECUTED_EXPERIMENT' }] });

  // The engine is reported available, then its runtime disappears mid-run: the prediction is frozen, nothing executes.
  const vanished = { ...DEFAULT_RESEARCH_TOOLS, executors: { ...DEFAULT_RESEARCH_TOOLS.executors, rdkit: { ...DEFAULT_RESEARCH_TOOLS.executors.rdkit, run: () => ({ ok: false, status: 'BLOCKED', reason: 'RDKIT_RUNTIME_UNAVAILABLE' }) } } };
  const result = executeResearchExperiment(db, project.id, runId, { tools: vanished });
  assert.equal(result.status, 'BLOCKED');
  const frozen = await buildResearchRunEvidencePack(db, project.id, runId, { artifactStorage: ctx.storage });
  assert.equal(frozen.ok, false);
  assert.equal(frozen.status, 'BLOCKED');
  assert.equal(frozen.blockers[0].reason, 'EXPERIMENT_NOT_EXECUTED');
  assert.equal(frozen.pack, undefined);

  const unavailable = { ...DEFAULT_RESEARCH_TOOLS, engineStatus: () => ({ available: false, reason: 'ENGINE_UNAVAILABLE' }) };
  assert.equal(executeResearchExperiment(db, project.id, runId, { tools: unavailable }).status, 'BLOCKED');
  assert.equal((await call('GET', `${base}/research-runs/${runId}/evidence-pack`, { token: owner.token })).body.error, 'BLOCKED');
});
