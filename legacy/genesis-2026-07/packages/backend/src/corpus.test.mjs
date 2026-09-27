/**
 * Scientific Corpus Factory — parsers, entity resolution, query planner, and HOSTILE bundle
 * validation (Corpus Mandate Phases 6–11, 28). The bundle adapter must FAIL CLOSED on every
 * corruption; a tampered bundle can never become scientific evidence.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as parsers from './corpus/parsers.mjs';
import * as er from './corpus/entityResolution.mjs';
import { planQueries } from './corpus/queryPlanner.mjs';
import { openBundle } from './corpus/bundleAdapter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../test-fixtures/genesis-scientific-evidence-bundle-v1');

function tmpBundle() {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-bundle-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}
const readManifest = (dir) => JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const writeManifest = (dir, m) => writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));

describe('source parsers', () => {
  test('Europe PMC → ScientificArticle (never implies reusable full text blindly)', () => {
    const a = parsers.parseEuropePmc({ pmid: '1', doi: '10.1/x', title: 't', isOpenAccess: 'N' });
    assert.equal(a.entityType, 'ScientificArticle');
    assert.equal(a.identifiers.doi, '10.1/x');
    assert.equal(a.hasReusableFullText, false);
  });
  test('ChEMBL bioactivity PRESERVES standard_type/relation/value/units (no flattening)', () => {
    const b = parsers.parseChembl({ activity_id: 'A1', standard_type: 'Ki', standard_relation: '>', standard_value: '50', standard_units: 'nM', target_chembl_id: 'T1' });
    assert.equal(b.standardType, 'Ki');
    assert.equal(b.standardRelation, '>');
    assert.equal(b.standardValue, 50);
    assert.equal(b.standardUnits, 'nM');
    assert.match(b.interpretationNote, /NOT proof of therapeutic efficacy/);
  });
  test('RCSB structure is never auto docking-ready', () => {
    const s = parsers.parseRcsbPdb({ rcsb_id: 'X', exptl: [{ method: 'X-RAY DIFFRACTION' }] });
    assert.equal(s.dockingReady, false);
    assert.equal(s.isExperimental, true);
  });
  test('malformed payload throws (fail-closed, never a silent empty entity)', () => {
    assert.throws(() => parsers.parseFor('EUROPE_PMC', null), /not an object/);
    assert.throws(() => parsers.parseFor('UNKNOWN_SERVICE', {}), /no parser/);
  });
});

describe('entity resolution', () => {
  test('same strong id merges; different names do NOT', () => {
    const a = { entityType: 'ProteinRecord', identifiers: { accession: 'P0DTC2' }, proteinName: 'Spike' };
    const b = { entityType: 'ProteinRecord', identifiers: { accession: 'P0DTC2' }, proteinName: 'S protein' };
    const c = { entityType: 'ProteinRecord', identifiers: { accession: 'Q99999' }, proteinName: 'Spike' };
    assert.equal(er.sameEntity(a, b).same, true);
    const nameOnly = er.sameEntity(a, c);
    assert.equal(nameOnly.same, false); // identical NAME must not merge
    assert.equal(nameOnly.resolution, 'AMBIGUOUS');
  });
  test('entity with no strong id is UNRESOLVED, never force-merged', () => {
    const { unresolved } = er.resolveEntities([{ entityType: 'ChemicalCompound', identifiers: {} }]);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].resolution, 'UNRESOLVED');
  });
});

describe('query planner', () => {
  test('deterministic plan hash; model expansions kept separate and labelled', () => {
    const p1 = planQueries({ campaignId: 'c', concepts: { target: ['BRAF'], protein: ['P15056'] }, terms: ['melanoma'], modelExpansions: ['MAPK'] });
    const p2 = planQueries({ campaignId: 'c', concepts: { protein: ['P15056'], target: ['BRAF'] }, terms: ['melanoma'], modelExpansions: [] });
    assert.equal(p1.planHash, p2.planHash); // model expansions + key order do not change the deterministic hash
    assert.equal(p1.modelProposedExpansions[0].origin, 'MODEL_GENERATED_PLANNING (not evidence)');
    assert.ok(p1.sourceQueries.some((q) => q.sourceService === 'EUROPE_PMC'));
  });
});

describe('local bundle adapter (happy path)', () => {
  test('the TEST_FIXTURE bundle verifies (SHA-256) and yields TEST_FIXTURE-origin entities', () => {
    const b = openBundle(FIXTURE);
    assert.equal(b.ingestionMode, 'TEST_FIXTURE');
    assert.equal(b.verifyAll().ok, true);
    const art = b.getById('EUROPE_PMC', 'TESTFIX1');
    assert.equal(art.status, 'OK');
    assert.equal(art.entity.entityType, 'ScientificArticle');
    assert.equal(art.provenance.evidenceOrigin, 'TEST_FIXTURE'); // never PUBLISHER_REPORTED
    assert.equal(art.provenance.hashAlgorithm, 'sha256');
    assert.match(art.provenance.contentHash, /^[0-9a-f]{64}$/);
  });
});

describe('HOSTILE bundle validation — fail closed', () => {
  test('tampered payload → INTEGRITY FAILURE (hash mismatch)', () => {
    const dir = tmpBundle();
    writeFileSync(path.join(dir, 'payloads/articles/EPMC_TESTFIX1.json'), JSON.stringify({ pmid: 'TAMPERED', title: 'evil' }));
    const b = openBundle(dir);
    assert.throws(() => b.getById('EUROPE_PMC', 'TESTFIX1'), /INTEGRITY FAILURE/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('unsupported manifest version → fail closed at open', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.manifestVersion = 'bogus/9'; writeManifest(dir, m);
    assert.throws(() => openBundle(dir), /unsupported manifest version/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('MD5 (non-sha256) hash algorithm → rejected', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries[0].hashAlgorithm = 'md5'; writeManifest(dir, m);
    assert.throws(() => openBundle(dir), /unsupported hash algorithm/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('path traversal in payloadRef → rejected', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries[0].payloadRef = '../../../../etc/passwd'; writeManifest(dir, m);
    const b = openBundle(dir);
    assert.throws(() => b.getById('EUROPE_PMC', 'TESTFIX1'), /traversal|escape/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('absolute-path payloadRef → rejected', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries[0].payloadRef = '/etc/passwd'; writeManifest(dir, m);
    const b = openBundle(dir);
    assert.throws(() => b.getById('EUROPE_PMC', 'TESTFIX1'), /absolute path/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('missing referenced payload → fail closed', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries[0].payloadRef = 'payloads/articles/DOES_NOT_EXIST.json'; writeManifest(dir, m);
    const b = openBundle(dir);
    assert.throws(() => b.getById('EUROPE_PMC', 'TESTFIX1'));
    rmSync(dir, { recursive: true, force: true });
  });
  test('duplicate source identity → rejected at open', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries.push({ ...m.entries[0], entryId: 'dup' }); writeManifest(dir, m);
    assert.throws(() => openBundle(dir), /duplicate source identity/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('unsupported source service → rejected at open', () => {
    const dir = tmpBundle(); const m = readManifest(dir); m.entries[0].sourceService = 'EVIL_SOURCE'; writeManifest(dir, m);
    assert.throws(() => openBundle(dir), /unsupported source service/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('manifest entry missing a required field → rejected at open', () => {
    const dir = tmpBundle(); const m = readManifest(dir); delete m.entries[0].provenanceRef; writeManifest(dir, m);
    assert.throws(() => openBundle(dir), /missing 'provenanceRef'/);
    rmSync(dir, { recursive: true, force: true });
  });
  test('malformed manifest JSON → rejected', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-bad-')); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'manifest.json'), '{ not json');
    assert.throws(() => openBundle(dir), /malformed manifest/);
    rmSync(dir, { recursive: true, force: true });
  });
});
