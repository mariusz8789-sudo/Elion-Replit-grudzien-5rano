/**
 * E2E scientific corpus pipeline (Corpus Mandate Phase 23), on the TEST_FIXTURE bundle:
 * RAW payload → SHA-256 verify → provenance → parser → normalized entity → evidence record →
 * Claim Registry (Evidence Intelligence) → Target funnel gate (Truth Engine). Proves provenance
 * survives, categories never collapse, and record-existence is not claim-support.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestBundle } from './corpus/corpusIngest.mjs';
import * as ei from './cognitive/evidenceIntelligence.mjs';
import * as target from './cognitive/targetIntelligence.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../test-fixtures/genesis-scientific-evidence-bundle-v1');

describe('corpus E2E (fixture bundle)', () => {
  test('bundle ingests with provenance; TEST_FIXTURE origin is preserved (never PUBLISHER_REPORTED)', () => {
    const res = ingestBundle(FIXTURE, { campaignId: 'c1', projectId: 'p1' });
    assert.equal(res.ingestionMode, 'TEST_FIXTURE');
    assert.equal(res.summary.byOrigin.TEST_FIXTURE, res.summary.entities); // ALL entities TEST_FIXTURE
    assert.ok(!('PUBLISHER_REPORTED' in res.summary.byOrigin));
    // Article + bioactivity became evidence records; compound/structure/protein did NOT.
    assert.equal(res.evidenceRecords.length, 2);
    assert.ok(res.evidenceRecords.every((e) => e.origin === 'TEST_FIXTURE' && e.contentHash));
  });

  test('record-existence is NOT claim-support until a claim explicitly cites the evidenceId', () => {
    const res = ingestBundle(FIXTURE);
    // A claim that cites a real bundle evidenceId is SUPPORTED (by a TEST_FIXTURE source — honest).
    const evId = res.evidenceRecords[0].evidenceId;
    const { registry } = ei.buildClaimRegistry([{ text: 'compound X shows activity in the fixture assay', supportingEvidenceIds: [evId] }], res.evidenceRecords);
    assert.equal(registry[0].status, 'SUPPORTED');
    // A claim citing a NON-existent evidence id is rejected (invented-source guard) — no silent support.
    const { registry: reg2, rejected } = ei.buildClaimRegistry([{ text: 'unsupported', supportingEvidenceIds: ['ev_ghost'] }], res.evidenceRecords);
    assert.equal(reg2.length, 0);
    assert.equal(rejected.length, 1);
  });

  test('target funnel gates on the corpus-derived claim (evidence basis is explicit)', () => {
    const res = ingestBundle(FIXTURE);
    const evId = res.evidenceRecords[0].evidenceId;
    const { registry } = ei.buildClaimRegistry([{ text: 'target has fixture-assay activity', supportingEvidenceIds: [evId], claimType: 'BIOACTIVITY' }], res.evidenceRecords);
    const t = { targetName: '[TEST FIXTURE] synthetic target', claimIds: [registry[0].claimId], structureAvailable: true, mechanismRationale: 'fixture', cheapestFalsification: 'x', knownChemicalMatter: true };
    const funnel = target.targetFunnel([t], registry);
    assert.equal(funnel.primaryGate.gate, 'PROCEED'); // evidence-backed (by a fixture source)
    assert.ok(funnel.primaryTarget.evidenceFor.length >= 1);
    // A target with NO cited claim is BLOCKed regardless of how many records exist in the corpus.
    const empty = target.targetFunnel([{ targetName: 'unsupported', claimIds: [] }], registry);
    assert.equal(empty.primaryGate.gate, 'BLOCK');
  });

  test('bioactivity distinguishing fields survive ingestion (Ki ≠ IC50)', () => {
    const res = ingestBundle(FIXTURE);
    const bio = res.entities.find((e) => e.entity.entityType === 'BioactivityRecord').entity;
    assert.equal(bio.standardType, 'IC50');
    assert.equal(bio.standardUnits, 'nM');
    assert.equal(bio.standardRelation, '=');
  });
});
