/**
 * Live, read-only Europe PMC scale proof for the canonical ResearchRun.
 *
 * The script creates one disposable file-backed ResearchRun, executes its real
 * primary and contradiction-candidate queries concurrently through the
 * production literature port, verifies fail-closed semantics, dedupe and
 * close/reopen recovery, and writes a bounded evidence report. Retrieved
 * metadata remains NOT_EVIDENCE; search matches are never classified as
 * scientific support or contradiction without a separately reviewed passage.
 *
 * Windows behind an enterprise TLS proxy should invoke Node with
 * `--use-system-ca`; certificate verification is never disabled.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { handleApi } from '../packages/backend/src/api.mjs';
import { canonicalJson, sha256Hex } from '../packages/backend/src/determinism.mjs';
import { queryEuropePmc } from '../packages/backend/src/literature/europePmcConnector.mjs';
import { openDatabase } from '../packages/backend/src/store.mjs';

const OUTPUT_DIR = path.resolve('artifacts/research-run-literature-live-proof');
const QUERY = 'GLP-1 receptor';
const CLAIM = 'GLP-1 receptor agonism changes glucose response';
const LIMIT = 100;
const testedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const temp = mkdtempSync(path.join(tmpdir(), 'genesis-literature-live-'));
const databasePath = path.join(temp, 'genesis.db');
const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => null },
  text: async () => typeof body === 'string' ? body : JSON.stringify(body),
});
const countBy = (items, keyOf) => items.reduce((counts, item) => {
  const key = keyOf(item) ?? 'UNKNOWN';
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const report = {
  schemaVersion: 'genesis.research-run-literature-live-proof@1',
  testedCommit,
  testedAt: new Date().toISOString(),
  provider: 'EUROPE_PMC',
  endpointClass: 'OFFICIAL_HTTPS_API',
  request: { query: QUERY, claim: CLAIM, perQueryLimit: LIMIT, queryCount: 2 },
  epistemicStatus: 'NOT_EVIDENCE',
  status: 'FAIL',
  failures: [],
};

let db;
try {
  report.runtime = {
    node: process.version,
    platform: process.platform,
    systemCaEnabled: process.execArgv.includes('--use-system-ca'),
  };

  db = openDatabase(databasePath);
  const call = (method, pathname, body, token) => handleApi(db, { method, pathname, body, token, query: {} });
  const owner = (await call('POST', '/api/auth/register', { email: `literature-live-${Date.now()}@genesis.local`, password: 'password123' })).body;
  const project = (await call('POST', '/api/projects', { name: 'Live literature scale proof' }, owner.token)).body.project;
  const base = `/api/projects/${project.id}`;
  const started = await call('POST', `${base}/research-runs`, { question: CLAIM }, owner.token);
  assert.equal(started.status, 201, JSON.stringify(started.body));
  const runId = started.body.researchRun.researchRunId;

  const retrievalStarted = performance.now();
  const retrieved = await call('POST', `${base}/research-runs/${runId}/literature`, {
    claim: CLAIM,
    query: QUERY,
    limit: LIMIT,
  }, owner.token);
  const retrievalMs = Math.round(performance.now() - retrievalStarted);
  assert.equal(retrieved.status, 201, JSON.stringify(retrieved.body));
  const snapshot = retrieved.body.snapshot;
  assert.equal(snapshot.status, 'METADATA_RETRIEVED');
  assert.equal(snapshot.epistemicStatus, 'NOT_EVIDENCE');
  assert.equal(snapshot.primary.sources.length, LIMIT);
  assert.equal(snapshot.contradictionSearch.sources.length, LIMIT);
  assert.equal(snapshot.primary.support.length, 0);
  assert.equal(snapshot.primary.contradictions.length, 0);
  assert.equal(snapshot.contradictionSearch.support.length, 0);
  assert.equal(snapshot.contradictionSearch.contradictions.length, 0);
  assert.ok(snapshot.contradictionSearch.missingEvidence.some((message) => message.includes('candidates only')));

  const allSources = [...snapshot.primary.sources, ...snapshot.contradictionSearch.sources];
  assert.ok(allSources.every((source) => /^[a-f0-9]{64}$/.test(source.metadataHash)));
  assert.ok(allSources.every((source) => /^[a-f0-9]{64}$/.test(source.provenance?.responseHash)));
  assert.ok(allSources.every((source) => Number.isInteger(source.provenance?.responseBytes) && source.provenance.responseBytes > 0));
  assert.ok(allSources.every((source) => source.retrievalStatus === 'METADATA_ONLY'));
  assert.ok(allSources.every((source) => ['APPROVED', 'CONDITIONAL', 'BLOCKED', 'UNKNOWN'].includes(source.licenceStatus)));
  assert.ok([...snapshot.primary.links, ...snapshot.contradictionSearch.links].every((link) => link.relationship === 'UNKNOWN' && link.epistemicStatus === 'NOT_EVIDENCE'));

  const duplicateStarted = performance.now();
  const duplicate = await call('POST', `${base}/research-runs/${runId}/literature`, {
    claim: CLAIM,
    query: QUERY,
    limit: LIMIT,
  }, owner.token);
  const duplicateMs = Math.round(performance.now() - duplicateStarted);
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.deduped, true);
  assert.deepEqual(duplicate.body.snapshot, snapshot);

  const snapshotHash = sha256Hex(canonicalJson(snapshot));
  db.close();
  db = openDatabase(databasePath);
  const recovered = await handleApi(db, { method: 'GET', pathname: `${base}/research-runs/${runId}`, body: null, token: owner.token, query: {} });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.researchRun.researchState.chain.ok, true);
  assert.equal(recovered.body.researchRun.literatureSnapshots.length, 1);
  assert.equal(sha256Hex(canonicalJson(recovered.body.researchRun.literatureSnapshots[0])), snapshotHash);

  const networkFailure = await queryEuropePmc({ text: QUERY, limit: 1 }, {
    fetchImpl: async () => { throw new Error('proof-network-block'); },
    now: () => new Date('2026-10-02T00:00:00.000Z'),
  });
  const rateLimited = await queryEuropePmc({ text: QUERY, limit: 1 }, {
    fetchImpl: async () => response(429, {}),
    now: () => new Date('2026-10-02T00:00:00.000Z'),
  });
  assert.deepEqual([networkFailure.status, networkFailure.failureCode, networkFailure.sources.length], ['BLOCKED_BY_NETWORK', 'EUROPE_PMC_NETWORK_ERROR', 0]);
  assert.deepEqual([rateLimited.status, rateLimited.failureCode, rateLimited.sources.length], ['BLOCKED_BY_NETWORK', 'EUROPE_PMC_RATE_LIMITED', 0]);

  report.researchRun = {
    researchRunId: runId,
    sourceCount: snapshot.sourceCount,
    eventTypes: recovered.body.researchRun.researchState.events.map((event) => event.type),
    chainVerifiedAfterRestart: recovered.body.researchRun.researchState.chain.ok,
    snapshotHash,
    snapshotIdenticalAfterRestart: true,
    duplicateRequestAvoidedProviderFetch: duplicate.body.deduped,
  };
  report.liveRetrieval = {
    elapsedMs: retrievalMs,
    returnedRows: allSources.length,
    observedRowsPerSecond: Number((allSources.length / (retrievalMs / 1_000)).toFixed(2)),
    primary: {
      status: snapshot.primary.status,
      sourceCount: snapshot.primary.sources.length,
      responseHashes: [...new Set(snapshot.primary.sources.map((source) => source.provenance.responseHash))],
    },
    contradictionCandidates: {
      status: snapshot.contradictionSearch.status,
      query: snapshot.contradictionSearch.query,
      sourceCount: snapshot.contradictionSearch.sources.length,
      reviewedContradictions: snapshot.contradictionSearch.contradictions.length,
      responseHashes: [...new Set(snapshot.contradictionSearch.sources.map((source) => source.provenance.responseHash))],
    },
    canonicalUniqueSources: snapshot.sourceCount,
    duplicateLookupMs: duplicateMs,
    licenceStatuses: countBy(allSources, (source) => source.licenceStatus),
    fullTextAvailability: countBy(allSources, (source) => source.fullTextAvailability),
    sourceProviders: countBy(allSources, (source) => source.sourceProvider),
  };
  report.sourceManifest = allSources.map((source) => ({
    sourceId: source.sourceId,
    doi: source.doi,
    pmid: source.pmid,
    pmcid: source.pmcid,
    metadataHash: source.metadataHash,
    licence: source.licence,
    licenceStatus: source.licenceStatus,
    responseHash: source.provenance.responseHash,
    responseBytes: source.provenance.responseBytes,
  }));
  report.failureProof = {
    network: { status: networkFailure.status, failureCode: networkFailure.failureCode, substituteSourceCount: networkFailure.sources.length },
    rateLimit: { status: rateLimited.status, failureCode: rateLimited.failureCode, substituteSourceCount: rateLimited.sources.length },
  };
  report.groundingBoundary = {
    metadataLinks: snapshot.primary.links.length + snapshot.contradictionSearch.links.length,
    relationships: countBy([...snapshot.primary.links, ...snapshot.contradictionSearch.links], (link) => link.relationship),
    reviewedSupport: 0,
    reviewedContradictions: 0,
    status: 'BLOCKED_EXTERNAL_FULL_TEXT_REVIEW',
    reason: 'Metadata search matches remain candidate context. A reviewed source passage is required before canonical Evidence admission.',
  };
  report.status = 'PASS';
} catch (error) {
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  db?.close();
  rmSync(temp, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const reportPath = path.join(OUTPUT_DIR, 'report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(OUTPUT_DIR, 'report.sha256'), `${sha256Hex(readFileSync(reportPath))}  report.json\n`);
}

console.log(JSON.stringify({ status: report.status, testedCommit, output: OUTPUT_DIR, failures: report.failures }, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
