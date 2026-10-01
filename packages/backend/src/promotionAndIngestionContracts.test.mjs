import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createArtifactStoragePort } from './compute/workerInfrastructureContract.mjs';
import { createDevelopmentRecord, decidePromotion, freezePromotionProtocol, recordUnseenEvaluation } from './compute/benchmarkPromotionGate.mjs';
import { ingestExternalArtifact } from './compute/externalArtifactIngestion.mjs';

describe('benchmark promotion gate', () => {
  const development = createDevelopmentRecord({ modelIdentity: { id: 'model-1', version: '1' }, developmentDataset: { id: 'dev-1', sha256: 'a'.repeat(64) } }).record;
  const frozen = freezePromotionProtocol(development, { preregHash: 'b'.repeat(64), metrics: ['mae'], passCriteria: { mae: { max: 1 } } }).record;

  it('cannot approve from development or frozen data alone', () => {
    assert.equal(development.productApproved, false);
    assert.equal(frozen.productApproved, false);
    assert.equal(decidePromotion(frozen, { decision: 'APPROVE' }).ok, false);
    assert.equal(recordUnseenEvaluation(frozen, { unseenDataset: development.developmentDataset, metricResults: { mae: 0.5 } }).ok, false);
  });

  it('approves only after a distinct unseen evaluation passes frozen criteria', () => {
    const evaluation = recordUnseenEvaluation(frozen, { unseenDataset: { id: 'unseen-1', sha256: 'c'.repeat(64) }, metricResults: { mae: 0.5 } }).record;
    assert.equal(evaluation.criteriaPass, true);
    const decision = decidePromotion(evaluation, { decision: 'APPROVE', reviewer: 'reviewer-1' });
    assert.equal(decision.ok, true);
    assert.equal(decision.record.productApproved, true);
  });

  it('refuses approval when frozen criteria fail', () => {
    const evaluation = recordUnseenEvaluation(frozen, { unseenDataset: { id: 'unseen-2', sha256: 'd'.repeat(64) }, metricResults: { mae: 2 } }).record;
    assert.equal(decidePromotion(evaluation, { decision: 'APPROVE' }).error, 'PASS_CRITERIA_NOT_MET');
  });
});

describe('external artifact ingestion', () => {
  const stored = [];
  const artifactStorage = createArtifactStoragePort({ storageProvider: 'test-store', putObject: async (object) => { stored.push(object); return { key: object.key }; }, now: () => new Date('2026-10-01T00:00:00.000Z') });
  const base = {
    sourceIdentity: { sourceId: 'source-1', canonicalUrl: 'https://example.org/data/1' },
    licence: { status: 'APPROVED', licenceId: 'CC0-1.0' },
    bytes: new TextEncoder().encode('{"id":1}'),
    schemaValidator: async () => ({ ok: true, schemaIdentity: 'schema-1' }),
    storageKey: 'research-run-1/raw/source-1.json',
    mimeType: 'application/json',
    producer: 'external-ingest',
    researchRunId: 'research-run-1',
    experimentId: 'experiment-1',
  };

  it('hashes the actual bytes through ArtifactStorage and returns a custody record', async () => {
    const result = await ingestExternalArtifact(base, { artifactStorage });
    assert.equal(result.ok, true);
    assert.equal(result.artifact.sha256, stored.at(-1).sha256);
    assert.equal(result.custody.sourceIdentity.sourceId, 'source-1');
  });

  it('blocks unknown licences and invalid schemas without storing bytes', async () => {
    const before = stored.length;
    assert.equal((await ingestExternalArtifact({ ...base, licence: { status: 'UNKNOWN' } }, { artifactStorage })).failureCode, 'LICENCE_NOT_ADMITTED');
    assert.equal((await ingestExternalArtifact({ ...base, schemaValidator: async () => ({ ok: false, errors: ['bad'] }) }, { artifactStorage })).failureCode, 'SCHEMA_VALIDATION_FAILED');
    assert.equal(stored.length, before);
  });
});
