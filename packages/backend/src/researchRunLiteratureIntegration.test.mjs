import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { handleApi } from './api.mjs';
import { openDatabase } from './store.mjs';

const SOURCE = Object.freeze({
  sourceId: 'europe-pmc:MED:123', title: 'GLP-1R functional response', authors: ['A Researcher'],
  doi: '10.1000/glp1', pmid: '123', pmcid: null, canonicalUrl: 'https://doi.org/10.1000/glp1',
  publicationDate: '2025-01-02', sourceProvider: 'EUROPE_PMC', licence: 'CC-BY-4.0', licenceStatus: 'CONDITIONAL',
  retrievalStatus: 'METADATA_ONLY', fullTextAvailability: 'NONE', retrievalTimestamp: '2026-10-02T00:00:00.000Z',
  metadataHash: 'a'.repeat(64), provenance: { provider: 'EUROPE_PMC', providerRecordId: '123' },
});

function result(intent, query, source = SOURCE) {
  return {
    intent, query, status: 'METADATA_ONLY', sources: [source],
    links: [{ claimId: 'ignored-by-fixture', sourceId: source.sourceId, relationship: 'UNKNOWN', status: 'PROPOSED', epistemicStatus: 'NOT_EVIDENCE' }],
    support: [], contradictions: [], missingEvidence: ['No reviewed relationship.'], accessBlockers: [],
  };
}

function provider(captured) {
  return {
    providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
    describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true }),
    async complete({ prompt }) {
      captured.push(prompt);
      return { model: 'fixture', text: JSON.stringify({
        subProblems: [{ question: 'Which functional endpoint is relevant?' }],
        hypotheses: [{
          claim: 'A functional response may be measurable.', claimType: 'HYPOTHESIS',
          assumptions: [], supportingEvidenceRefs: [SOURCE.sourceId], contradictingEvidenceRefs: [],
          missingEvidence: ['reviewed full text'], uncertainty: { level: 'HIGH', statement: 'Metadata only.' },
          falsificationProposal: 'A preregistered functional assay shows no response.', experimentProposal: null,
        }],
        nextActions: ['Review the source'],
      }) };
    },
  };
}

describe('literature in the canonical ResearchRun', () => {
  test('retrieval and contradiction search persist in the hash chain, survive restart, and inform planning as NOT_EVIDENCE', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-literature-run-'));
    const file = path.join(dir, 'genesis.db');
    const captured = [];
    const literatureRequests = [];
    const literaturePort = {
      findForClaim: async (request) => { literatureRequests.push(request); return result('CLAIM_CONTEXT', request.query); },
      findContradictionsForClaim: async (request) => { literatureRequests.push(request); return result('CONTRADICTION_SEARCH', 'GLP-1R AND negative result', { ...SOURCE, sourceId: 'europe-pmc:MED:456', title: 'Negative functional result', pmid: '456' }); },
    };
    try {
      let db = openDatabase(file);
      const call = (method, pathname, body, token) => handleApi(db, { method, pathname, body, token, query: {}, literaturePort, reasoningProvider: provider(captured) });
      const owner = call('POST', '/api/auth/register', { email: 'literature-run@lab.org', password: 'password123' }).body;
      const project = call('POST', '/api/projects', { name: 'Literature run' }, owner.token).body.project;
      const base = `/api/projects/${project.id}`;
      const started = await call('POST', `${base}/research-runs`, { question: 'Does GLP-1R agonism change glucose response?' }, owner.token);
      const runId = started.body.researchRun.researchRunId;
      const retrieved = await call('POST', `${base}/research-runs/${runId}/literature`, { limit: 100 }, owner.token);
      assert.equal(retrieved.status, 201, JSON.stringify(retrieved.body));
      assert.deepEqual(literatureRequests.map((request) => request.limit), [100, 100]);
      assert.equal(retrieved.body.snapshot.epistemicStatus, 'NOT_EVIDENCE');
      assert.equal(retrieved.body.snapshot.sourceCount, 2);
      assert.equal(retrieved.body.snapshot.contradictionSearch.contradictions.length, 0);
      assert.deepEqual(retrieved.body.researchRun.researchState.events.map((event) => event.type), ['PROBLEM_FORMALIZED', 'KNOWLEDGE_SNAPSHOT']);
      assert.equal(retrieved.body.researchRun.researchState.chain.ok, true);

      const duplicate = await call('POST', `${base}/research-runs/${runId}/literature`, { limit: 100 }, owner.token);
      assert.equal(duplicate.status, 200);
      assert.equal(duplicate.body.deduped, true);
      assert.equal(literatureRequests.length, 2);
      db.close();

      db = openDatabase(file);
      const recovered = await call('GET', `${base}/research-runs/${runId}`, null, owner.token);
      assert.equal(recovered.body.researchRun.literatureSnapshots.length, 1);
      assert.equal(recovered.body.researchRun.researchState.chain.ok, true);

      const planned = await call('POST', `${base}/research-runs/${runId}/proposals`, null, owner.token);
      assert.equal(planned.status, 201, JSON.stringify(planned.body));
      assert.match(captured[0], /Literature metadata available for context only \(NOT_EVIDENCE/);
      assert.match(captured[0], /Negative functional result/);
      assert.deepEqual(planned.body.researchRun.plan.hypotheses[0].supportingEvidenceRefs, []);
      assert.ok(planned.body.researchRun.plan.hypotheses[0].unresolvedEvidenceRefs.some((entry) => entry.ref === SOURCE.sourceId));
      assert.deepEqual(planned.body.researchRun.researchState.events.map((event) => event.type), ['PROBLEM_FORMALIZED', 'KNOWLEDGE_SNAPSHOT', 'HYPOTHESES_GENERATED']);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does not append a snapshot when the run is paused while provider retrieval is pending', async () => {
    const db = openDatabase();
    let releaseRetrieval;
    let started = 0;
    let signalStarted;
    const gate = new Promise((resolve) => { releaseRetrieval = resolve; });
    const bothStarted = new Promise((resolve) => { signalStarted = resolve; });
    const delayed = async (intent, query) => {
      started += 1;
      if (started === 2) signalStarted();
      await gate;
      return result(intent, query);
    };
    const literaturePort = {
      findForClaim: async (request) => delayed('CLAIM_CONTEXT', request.query),
      findContradictionsForClaim: async () => delayed('CONTRADICTION_SEARCH', 'claim AND negative result'),
    };
    const call = (method, pathname, body, token) => handleApi(db, { method, pathname, body, token, query: {}, literaturePort });
    const owner = call('POST', '/api/auth/register', { email: 'literature-race@lab.org', password: 'password123' }).body;
    const project = call('POST', '/api/projects', { name: 'Literature race' }, owner.token).body.project;
    const base = `/api/projects/${project.id}`;
    const startedRun = await call('POST', `${base}/research-runs`, { question: 'Can a paused run accept a late literature result?' }, owner.token);
    const runId = startedRun.body.researchRun.researchRunId;

    const pending = call('POST', `${base}/research-runs/${runId}/literature`, {}, owner.token);
    await bothStarted;
    const paused = await call('POST', `${base}/research-runs/${runId}/pause`, { reason: 'Operator paused during retrieval' }, owner.token);
    assert.equal(paused.status, 200);
    releaseRetrieval();

    const late = await pending;
    assert.equal(late.status, 409);
    assert.equal(late.body.error, 'RUN_NOT_RETRIEVABLE');
    const recovered = call('GET', `${base}/research-runs/${runId}`, null, owner.token).body.researchRun;
    assert.equal(recovered.run.status, 'PAUSED');
    assert.deepEqual(recovered.literatureSnapshots, []);
    assert.deepEqual(recovered.researchState.events.map((event) => event.type), ['PROBLEM_FORMALIZED', 'RUN_CONTROLLED']);
    assert.equal(recovered.researchState.chain.ok, true);
    db.close();
  });
});
