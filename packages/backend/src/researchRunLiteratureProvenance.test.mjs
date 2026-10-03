import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';
import { createLocalContentAddressedArtifactStorage } from './compute/localArtifactStorageBackend.mjs';
import { canonicalJson, sha256Hex } from './determinism.mjs';
import { engineUnavailable } from './engineTestGate.mjs';
import { createResearchRunLiteraturePort } from './literature/researchRunLiteraturePort.mjs';
import { searchLiterature } from './literature/literatureService.mjs';
import { queryEuropePmc } from './literature/europePmcConnector.mjs';
import { validateAgainstSchema, verifyResearchRunEvidencePack } from './researchRunEvidencePack.mjs';
import { replayResearchRunLiterature } from './researchRunLiterature.mjs';
import { openDatabase } from './store.mjs';

/**
 * Area 6 (Literature / data) through the canonical ResearchRun API: retrieval with exact source provenance,
 * durable raw responses, restart, offline replay (MATCH / DRIFT / TAMPERED), citations in the plan, a
 * registered dataset used by a real RDKit experiment, and the Evidence Pack that carries all of it.
 *
 * The literature bodies are the committed SYNTHETIC provider-format fixtures in fixtures/literature-raw
 * (see MANIFEST.json: the build host could not reach the providers). They go through the real connector
 * code; nothing below substitutes a parsed result for a raw body.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures', 'literature-raw');
const MANIFEST = JSON.parse(readFileSync(path.join(FIXTURES, 'MANIFEST.json'), 'utf8'));
const raw = (file) => readFileSync(path.join(FIXTURES, file), 'utf8');
const SCHEMA = JSON.parse(readFileSync(path.resolve(HERE, '../../../docs/astra/schema.json'), 'utf8'));
const NOW = new Date('2026-10-03T08:00:00.000Z');
const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
const CSV = `compound_id,smiles,note\nASA,${ASPIRIN},reference\nCAF,CN1C=NC2=C1C(=O)N(C(=O)N2C)C,"quoted, with comma"\n`;
const CSV_SHA = sha256Hex(CSV);
const rdkitSkip = engineUnavailable('rdkit', rdkitDetect());

const response = (status, body) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => null }, text: async () => body });

/** Serves the committed raw bodies by route; any other request is a network failure. */
function fixtureFetch(calls = []) {
  return async (url) => {
    const u = new URL(url.toString());
    calls.push(u.toString());
    const contradiction = /contradict/.test(u.searchParams.get('query') ?? u.searchParams.get('term') ?? '');
    if (u.origin === 'https://www.ebi.ac.uk') return response(200, raw(contradiction ? 'europepmc-contradiction.json' : 'europepmc-primary.json'));
    if (u.pathname === '/entrez/eutils/esearch.fcgi') return response(200, raw(contradiction ? 'pubmed-esearch-contradiction.json' : 'pubmed-esearch-primary.json'));
    if (u.pathname === '/entrez/eutils/esummary.fcgi' && u.searchParams.get('id') === '99000001,99000003') return response(200, raw('pubmed-esummary-primary.json'));
    throw new TypeError('fetch failed');
  };
}
const unreachable = async () => { throw new TypeError('fetch failed: getaddrinfo ENOTFOUND'); };

const PLAN = (datasetId) => ({
  subProblems: [{ question: 'Does the reference compound fall below 200 Da?', whyItMatters: 'Dataset-bound computational check.' }],
  hypotheses: [
    {
      claim: 'GLP-1 receptor agonism lowers fasting glucose.', claimType: 'HYPOTHESIS', assumptions: [],
      supportingEvidenceRefs: [], contradictingEvidenceRefs: [],
      sourceRefs: ['europe-pmc:MED:99000001', 'pubmed:99000003', 'pubmed:12345678'],
      contradictingSourceRefs: ['europe-pmc:MED:99000004'],
      missingEvidence: ['reviewed full text'], uncertainty: { level: 'HIGH', statement: 'Metadata only.' },
      falsificationProposal: 'A preregistered study shows no change in fasting glucose.', experimentProposal: null,
    },
    {
      claim: 'The reference compound of the registered dataset has molecular weight below 200 Da.', claimType: 'PREDICTION', assumptions: [],
      supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
      uncertainty: { level: 'UNKNOWN', statement: 'No calibration claimed.' },
      falsificationProposal: 'RDKit molWt of the dataset SMILES is 200 or more.',
      experimentProposal: {
        kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'RDKit descriptors on dataset row 0.',
        parameters: { datasetRef: { datasetId, row: 0, column: 'smiles' }, predictions: [{ observable: 'molWt', operator: '<', value: 200, critical: true }] },
        parameterChanges: [],
      },
    },
  ],
  nextActions: ['Human review of the cited sources'],
});
const provider = (plan, prompts) => ({
  providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
  describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
  async complete({ prompt }) { prompts.push(prompt); return { model: 'fixture', text: JSON.stringify(plan) }; },
});

function tamperSourceRecord(db, sha256) {
  db.exec('DROP TRIGGER IF EXISTS research_source_records_append_only_update');
  const row = db.prepare('SELECT body FROM research_source_records WHERE sha256 = ?').get(sha256);
  const body = Buffer.concat([Buffer.from(row.body), Buffer.from(' ')]);
  db.prepare('UPDATE research_source_records SET body = ? WHERE sha256 = ?').run(body, sha256);
}

describe('committed literature fixtures', () => {
  test('every raw fixture has the sha256 and size its manifest records, and is labelled synthetic', () => {
    assert.equal(MANIFEST.captureStatus, 'SYNTHETIC_PROVIDER_FORMAT');
    assert.match(MANIFEST.label, /NOT A LIVE CAPTURE/);
    for (const entry of MANIFEST.files) {
      const bytes = readFileSync(path.join(FIXTURES, entry.file));
      assert.equal(sha256Hex(bytes), entry.sha256, entry.file);
      assert.equal(bytes.byteLength, entry.bytes, entry.file);
    }
  });
});

describe('literature and data in the canonical ResearchRun (area 6)', () => {
  let dir; let file; let db; let storage; let owner; let base; let runId; let snapshot; let datasetId;
  const prompts = [];
  const calls = [];
  const call = (method, pathname, body, extras = {}) => handleApi(db, {
    method, pathname, body, token: owner?.token, query: {}, artifactStorage: storage,
    reasoningProvider: provider(PLAN(datasetId), prompts), ...extras,
  });

  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'genesis-area6-'));
    file = path.join(dir, 'genesis.db');
    storage = createLocalContentAddressedArtifactStorage({ rootDir: path.join(dir, 'artifacts') });
    db = openDatabase(file);
    owner = call('POST', '/api/auth/register', { email: 'area6@genesis.test', password: 'password123' }).body;
    const project = call('POST', '/api/projects', { name: 'Area 6' }).body.project;
    base = `/api/projects/${project.id}`;
    runId = (await call('POST', `${base}/research-runs`, { question: 'Does GLP-1 receptor agonism lower fasting glucose?' })).body.researchRun.researchRunId;
  });
  after(() => { db?.close(); rmSync(dir, { recursive: true, force: true }); });

  test('retrieval stores claims with identifier, retrieval time and record hash, and the exact raw responses', async () => {
    const got = await call('POST', `${base}/research-runs/${runId}/literature`, {
      claim: 'GLP-1 receptor agonism lowers fasting glucose', query: 'GLP-1 receptor agonism glucose', limit: 10,
    }, { literatureOptions: { fetchImpl: fixtureFetch(calls), now: () => NOW } });
    assert.equal(got.status, 201, JSON.stringify(got.body));
    snapshot = got.body.snapshot;
    assert.equal(snapshot.snapshotVersion, 'research-run-literature-snapshot@2');
    assert.equal(snapshot.status, 'METADATA_RETRIEVED');
    assert.equal(snapshot.retrievedAt, NOW.toISOString());
    assert.equal(snapshot.epistemicStatus, 'NOT_EVIDENCE');
    assert.deepEqual(snapshot.primary.sources.map((s) => s.sourceId), ['europe-pmc:MED:99000001', 'europe-pmc:MED:99000002', 'pubmed:99000003']);
    assert.deepEqual(snapshot.contradictionSearch.sources.map((s) => s.sourceId), ['europe-pmc:MED:99000004']);

    const epmc = JSON.parse(raw('europepmc-primary.json')).resultList.result[0];
    const first = snapshot.primary.sources[0];
    assert.equal(first.doi, '10.5555/genesis-fixture.1');
    assert.equal(first.pmid, '99000001');
    assert.equal(first.retrievalTimestamp, NOW.toISOString());
    assert.equal(first.provenanceClass, 'SOURCE_FACT');
    assert.equal(first.provenance.recordHash, sha256Hex(canonicalJson(epmc)), 'record hash is the hash of the record as fetched');
    assert.equal(first.provenance.responseHash, MANIFEST.files.find((f) => f.file === 'europepmc-primary.json').sha256);
    const pubmed = snapshot.primary.sources[2];
    assert.equal(pubmed.provenance.recordHash, sha256Hex(canonicalJson(JSON.parse(raw('pubmed-esummary-primary.json')).result['99000003'])));
    assert.equal(pubmed.pmcid, 'PMC9900003');

    // Every body the connectors read is named in the chain and kept byte-for-byte.
    assert.deepEqual(snapshot.rawResponses.map((r) => r.sha256).sort(), MANIFEST.files.map((f) => f.sha256).sort());
    for (const ref of snapshot.rawResponses) {
      const row = db.prepare('SELECT body FROM research_source_records WHERE sha256 = ?').get(ref.sha256);
      assert.equal(sha256Hex(Buffer.from(row.body)), ref.sha256);
      assert.equal(ref.artifactId, `artifact:${ref.sha256}`);
    }
    assert.equal(snapshot.replay.mode, 'OFFLINE_FROM_STORED_RAW_RESPONSES');
    assert.deepEqual(got.body.researchRun.researchState.events.map((e) => e.type), ['PROBLEM_FORMALIZED', 'KNOWLEDGE_SNAPSHOT']);
  });

  test('a restart keeps the literature state; replay from stored bodies uses no network and MATCHes', async () => {
    db.close();
    db = openDatabase(file);
    const recovered = await call('GET', `${base}/research-runs/${runId}`);
    assert.equal(recovered.body.researchRun.researchState.chain.ok, true);
    assert.equal(sha256Hex(canonicalJson(recovered.body.researchRun.literatureSnapshots[0])), sha256Hex(canonicalJson(snapshot)));

    const realFetch = globalThis.fetch;
    let networkCalls = 0;
    globalThis.fetch = async () => { networkCalls += 1; throw new Error('network used during replay'); };
    try {
      const replay = await call('POST', `${base}/research-runs/${runId}/literature/${snapshot.snapshotId}/replay`, null);
      assert.equal(replay.status, 201, JSON.stringify(replay.body));
      assert.equal(replay.body.replay.verdict, 'MATCH');
      assert.equal(replay.body.replay.network, 'NONE');
      assert.equal(replay.body.replay.replayResultFingerprint, snapshot.resultFingerprint);
      assert.deepEqual(replay.body.replay.unrecordedRequests, []);
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(networkCalls, 0);
    const replays = await call('GET', `${base}/research-runs/${runId}/literature-replays`);
    assert.deepEqual(replays.body.literatureReplays.map((r) => r.verdict), ['MATCH']);
  });

  test('a changed connector reading the same stored bodies is DRIFT, not MATCH', async () => {
    const europeOnly = createResearchRunLiteraturePort({ search: (query, options) => searchLiterature(query, { ...options, connectors: [{ id: 'EUROPE_PMC', query: queryEuropePmc }] }) });
    const drift = await replayResearchRunLiterature(db, recoveredProjectId(), runId, snapshot.snapshotId, { replayPort: europeOnly });
    assert.equal(drift.ok, true);
    assert.equal(drift.replay.verdict, 'DRIFT');
    assert.notEqual(drift.replay.replayResultFingerprint, snapshot.resultFingerprint);
  });

  test('a dataset is registered with sha256, licence and origin URL; bad input is refused', async () => {
    const missingLicence = await call('POST', `${base}/research-runs/${runId}/datasets`, { name: 'x', content: CSV });
    assert.equal(missingLicence.status, 400);
    assert.equal(missingLicence.body.reason, 'licence_field_required');
    const wrongHash = await call('POST', `${base}/research-runs/${runId}/datasets`, { name: 'x', content: CSV, licence: 'CC0-1.0', sha256: 'f'.repeat(64) });
    assert.equal(wrongHash.status, 422);
    assert.equal(wrongHash.body.error, 'DATASET_HASH_MISMATCH');
    const httpOrigin = await call('POST', `${base}/research-runs/${runId}/datasets`, { name: 'x', content: CSV, licence: 'CC0-1.0', originUrl: 'http://example.org/a.csv' });
    assert.equal(httpOrigin.status, 400);

    const attached = await call('POST', `${base}/research-runs/${runId}/datasets`, {
      name: 'Reference compounds', fileName: 'reference-compounds.csv', mediaType: 'text/csv',
      contentBase64: Buffer.from(CSV).toString('base64'), sha256: CSV_SHA, licence: 'CC0-1.0', originUrl: 'https://example.org/genesis/reference-compounds.csv',
    });
    assert.equal(attached.status, 201, JSON.stringify(attached.body));
    const d = attached.body.dataset;
    datasetId = d.datasetId;
    assert.equal(d.datasetId, `dataset:${CSV_SHA}`);
    assert.equal(d.sha256, CSV_SHA);
    assert.deepEqual([d.licence, d.licenceStatus], ['CC0-1.0', 'APPROVED']);
    assert.deepEqual([d.originUrl, d.originStatus, d.provenanceClass], ['https://example.org/genesis/reference-compounds.csv', 'DECLARED_NOT_FETCHED', 'UNKNOWN']);
    assert.deepEqual([d.columns, d.rowCount], [['compound_id', 'smiles', 'note'], 2]);
    const again = await call('POST', `${base}/research-runs/${runId}/datasets`, { name: 'dup', content: CSV, licence: null });
    assert.equal(again.status, 200);
    assert.equal(again.body.deduped, true);
    const listed = await call('GET', `${base}/research-runs/${runId}/datasets`);
    assert.deepEqual(listed.body.datasets.map((x) => [x.datasetId, x.custody]), [[datasetId, 'INTACT']]);
  });

  test('the plan cites retrieved sources with their hashes, shows contradictions, and marks the rest UNKNOWN', async () => {
    const planned = await call('POST', `${base}/research-runs/${runId}/proposals`, null);
    assert.equal(planned.status, 201, JSON.stringify(planned.body));
    assert.match(prompts[0], /europe-pmc:MED:99000004: \[SYNTHETIC FIXTURE\] No association/);
    assert.match(prompts[0], new RegExp(`${datasetId}: Reference compounds \\[text/csv; columns=compound_id,smiles,note; rows=2; licence=APPROVED\\]`));
    const [cited, computed] = planned.body.researchRun.plan.hypotheses;

    assert.equal(cited.literature.status, 'CITED');
    assert.deepEqual(cited.literature.citations.map((c) => [c.sourceId, c.relationship]), [
      ['europe-pmc:MED:99000001', 'SUPPORTS'], ['pubmed:99000003', 'SUPPORTS'], ['europe-pmc:MED:99000004', 'CONTRADICTS'],
    ]);
    const c0 = cited.literature.citations[0];
    assert.equal(c0.recordHash, snapshot.primary.sources[0].provenance.recordHash);
    assert.equal(c0.responseHash, snapshot.primary.sources[0].provenance.responseHash);
    assert.equal(c0.retrievedAt, NOW.toISOString());
    assert.equal(c0.doi, '10.5555/genesis-fixture.1');
    assert.equal(c0.snapshotId, snapshot.snapshotId);
    assert.deepEqual([c0.provenanceClass, c0.relationshipProvenanceClass, c0.epistemicStatus], ['SOURCE_FACT', 'MODEL_PROPOSAL', 'NOT_EVIDENCE']);
    assert.deepEqual(cited.literature.contradictingCitations, ['europe-pmc:MED:99000004']);
    assert.deepEqual(cited.literature.unresolvedSourceRefs, [{ field: 'sourceRefs', ref: 'pubmed:12345678', reason: 'SOURCE_NOT_RETRIEVED_IN_THIS_RUN', provenanceClass: 'UNKNOWN' }]);
    assert.deepEqual(cited.supportingEvidenceRefs, [], 'a literature source is never an evidence reference');

    assert.equal(computed.literature.status, 'UNKNOWN');
    assert.equal(computed.literature.provenanceClass, 'UNKNOWN');
    assert.deepEqual(computed.literature.contradictionCandidates.map((c) => c.sourceId), ['europe-pmc:MED:99000004'], 'contradicting sources stay visible on every hypothesis');

    const binding = computed.experimentProposal.datasetBinding;
    assert.equal(computed.experimentProposal.parameters.smiles, ASPIRIN);
    assert.deepEqual([binding.datasetId, binding.sha256, binding.row, binding.column, binding.licenceStatus], [datasetId, CSV_SHA, 0, 'smiles', 'APPROVED']);
    assert.equal(binding.valueSha256, sha256Hex(canonicalJson(ASPIRIN)));

    const provenance = planned.body.researchRun.provenance;
    assert.deepEqual(provenance.hypothesisCitations.map((h) => h.provenanceClass), ['SOURCE_FACT', 'UNKNOWN']);
    assert.deepEqual(provenance.datasets.map((x) => [x.datasetId, x.sha256, x.provenanceClass]), [[datasetId, CSV_SHA, 'UNKNOWN']]);
    assert.deepEqual(provenance.realMeasurements, []);

    db.close();
    db = openDatabase(file);
    const recovered = (await call('GET', `${base}/research-runs/${runId}`)).body.researchRun;
    assert.equal(recovered.researchState.chain.ok, true);
    assert.deepEqual(recovered.plan.hypotheses[0].literature, cited.literature);
    assert.deepEqual(recovered.datasets.map((x) => x.datasetId), [datasetId]);
  });

  test('a real RDKit experiment uses the dataset; the Evidence Pack carries literature, replay and dataset', { skip: rdkitSkip }, async () => {
    const done = await call('POST', `${base}/research-runs/${runId}/experiments`, null);
    assert.equal(done.status, 201, JSON.stringify(done.body));
    const run = done.body.researchRun;
    const experiment = run.experiments[0];
    assert.equal(experiment.frozen.datasetBinding.datasetId, datasetId);
    assert.deepEqual(experiment.frozen.input, { smiles: ASPIRIN });
    assert.equal(experiment.execution.status, 'EXECUTED');
    assert.ok(experiment.execution.output.molWt > 180 && experiment.execution.output.molWt < 181);
    assert.deepEqual(run.provenance.experimentExecutions, [{ experimentId: experiment.experimentId, provenanceClass: 'GENESIS_COMPUTATION', datasetId }]);
    const listed = await call('GET', `${base}/research-runs/${runId}/datasets`);
    assert.deepEqual(listed.body.datasets[0].usedByExperimentIds, [experiment.experimentId]);

    const got = await call('GET', `${base}/research-runs/${runId}/evidence-pack`, null);
    assert.equal(got.status, 200, JSON.stringify(got.body));
    const pack = got.body.pack;
    assert.deepEqual(validateAgainstSchema(SCHEMA, pack), []);
    assert.deepEqual(pack.sources.events.map((e) => e.type), ['KNOWLEDGE_SNAPSHOT', 'LITERATURE_REPLAYED', 'LITERATURE_REPLAYED', 'DATASET_ATTACHED']);
    assert.ok(pack.sourceArtifactRefs.includes(`artifact:${CSV_SHA}`));
    for (const ref of snapshot.rawResponses) assert.ok(pack.sourceArtifactRefs.includes(ref.artifactId));
    assert.equal(pack.experiments[0].events.PREDICTIONS_FROZEN.payload.datasetBinding.sha256, CSV_SHA);
    assert.ok(!pack.verification.missing.some((m) => /Literature snapshot/.test(m)), JSON.stringify(pack.verification.missing));
    const verified = await verifyResearchRunEvidencePack(pack, { db, projectId: recoveredProjectId(), artifactStorage: storage });
    assert.equal(verified.ok, true, JSON.stringify(verified.failures));

    // Offline: a changed embedded source payload no longer matches its chain fingerprint.
    const forged = JSON.parse(JSON.stringify(pack));
    forged.sources.events[0].payload.primary.sources[0].doi = '10.5555/forged';
    const offline = await verifyResearchRunEvidencePack(forged);
    assert.ok(offline.codes.includes('EVENT_FINGERPRINT_MISMATCH'), JSON.stringify(offline.failures));

    // Anchored: altered raw bytes in custody are caught even though the pack itself is untouched.
    tamperSourceRecord(db, snapshot.rawResponses[0].sha256);
    const anchored = await verifyResearchRunEvidencePack(pack, { db, projectId: recoveredProjectId(), artifactStorage: storage });
    assert.ok(anchored.codes.includes('SOURCE_RECORD_MUTATED'), JSON.stringify(anchored.failures));
  });

  test('a tampered stored response is detected: replay refuses it and records TAMPERED', async () => {
    tamperSourceRecord(db, snapshot.rawResponses[0].sha256);
    const replay = await call('POST', `${base}/research-runs/${runId}/literature/${snapshot.snapshotId}/replay`, null);
    assert.equal(replay.status, 409, JSON.stringify(replay.body));
    assert.equal(replay.body.error, 'SOURCE_RECORD_TAMPERED');
    assert.equal(replay.body.replay.verdict, 'TAMPERED');
    assert.equal(replay.body.replay.replayResultFingerprint, null);
    assert.deepEqual(replay.body.replay.sourceRecordFailures.map((f) => [f.sha256, f.status]), [[snapshot.rawResponses[0].sha256, 'TAMPERED']]);
    const run = (await call('GET', `${base}/research-runs/${runId}`)).body.researchRun;
    assert.equal(run.researchState.chain.ok, true);
    assert.equal(run.researchState.events.filter((e) => e.type === 'LITERATURE_REPLAYED').at(-1).payload.verdict, 'TAMPERED');
  });

  test('a tampered dataset is reported, cannot be re-registered over, and cannot feed a plan', async () => {
    tamperSourceRecord(db, CSV_SHA);
    const listed = await call('GET', `${base}/research-runs/${runId}/datasets`);
    assert.equal(listed.body.datasets[0].custody, 'TAMPERED');

    const run2 = (await call('POST', `${base}/research-runs`, { question: 'Second run on tampered data?' })).body.researchRun.researchRunId;
    const reRegister = await call('POST', `${base}/research-runs/${run2}/datasets`, { name: 'Reference compounds', content: CSV, licence: 'CC0-1.0' });
    assert.equal(reRegister.status, 409, JSON.stringify(reRegister.body));
    assert.equal(reRegister.body.error, 'SOURCE_RECORD_TAMPERED');

    const csv2 = 'compound_id,smiles\nETH,CCO\n';
    const second = await call('POST', `${base}/research-runs/${run2}/datasets`, { name: 'Ethanol', content: csv2, licence: 'CC-BY-4.0' });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    tamperSourceRecord(db, sha256Hex(csv2));
    const planned = await call('POST', `${base}/research-runs/${run2}/proposals`, null, { reasoningProvider: provider(PLAN(second.body.dataset.datasetId), []) });
    assert.equal(planned.status, 201, JSON.stringify(planned.body));
    const exp = planned.body.researchRun.plan.hypotheses[1].experimentProposal;
    assert.deepEqual([exp.decision, exp.reason, exp.datasetBinding], ['BLOCKED_BY_DATA', 'DATASET_TAMPERED', null]);
    assert.equal(exp.parameters.smiles, undefined, 'no value is guessed for an unresolved dataset reference');
    assert.equal(planned.body.researchRun.plan.hypotheses[0].literature.status, 'UNKNOWN', 'a run without retrieval cites nothing');
    assert.equal(planned.body.researchRun.plan.hypotheses[0].literature.unresolvedSourceRefs.length, 4);
  });

  function recoveredProjectId() { return base.split('/')[3]; }
});

describe('unreachable literature host', () => {
  test('returns BLOCKED with the connector reason, records the attempt, and a later retry is not deduplicated away', async () => {
    const db = openDatabase();
    const call = (method, pathname, body, token, extras = {}) => handleApi(db, { method, pathname, body, token, query: {}, ...extras });
    const owner = call('POST', '/api/auth/register', { email: 'area6-offline@genesis.test', password: 'password123' }).body;
    const project = call('POST', '/api/projects', { name: 'Offline' }, owner.token).body.project;
    const base = `/api/projects/${project.id}`;
    const runId = (await call('POST', `${base}/research-runs`, { question: 'Is the literature host reachable?' }, owner.token)).body.researchRun.researchRunId;
    const request = { claim: 'GLP-1 receptor agonism lowers fasting glucose', query: 'GLP-1 receptor agonism glucose' };

    const blocked = await call('POST', `${base}/research-runs/${runId}/literature`, request, owner.token, { literatureOptions: { fetchImpl: unreachable, now: () => NOW } });
    assert.equal(blocked.status, 503, JSON.stringify(blocked.body));
    assert.equal(blocked.body.error, 'BLOCKED');
    assert.match(blocked.body.reason, /EUROPE_PMC:EUROPE_PMC_NETWORK_ERROR/);
    assert.match(blocked.body.reason, /PUBMED:PUBMED_NETWORK_ERROR/);
    assert.equal(blocked.body.snapshot.sourceCount, 0);
    assert.deepEqual(blocked.body.snapshot.rawResponses, []);
    assert.equal(blocked.body.snapshot.replay.mode, 'NOT_REPLAYABLE');
    const notReplayable = await call('POST', `${base}/research-runs/${runId}/literature/${blocked.body.snapshot.snapshotId}/replay`, null, owner.token);
    assert.equal(notReplayable.status, 409);
    assert.equal(notReplayable.body.error, 'SNAPSHOT_NOT_REPLAYABLE');

    const retried = await call('POST', `${base}/research-runs/${runId}/literature`, request, owner.token, { literatureOptions: { fetchImpl: fixtureFetch(), now: () => NOW } });
    assert.equal(retried.status, 201, JSON.stringify(retried.body));
    assert.equal(retried.body.deduped, false);
    assert.equal(retried.body.snapshot.snapshotId, `${blocked.body.snapshot.snapshotId}-1`);
    const run = retried.body.researchRun;
    assert.deepEqual(run.literatureSnapshots.map((s) => s.status), ['BLOCKED', 'METADATA_RETRIEVED']);
    assert.equal(run.researchState.chain.ok, true);
    db.close();
  });
});
