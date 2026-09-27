/**
 * Campaign #001 OFFLINE "externally supplied official payloads" builder + verification pipeline.
 *
 * The operator downloads OFFICIAL payloads on a network-enabled machine and drops them next to a
 * SUPPLIED_INPUTS.json; build-bundle-from-supplied.mjs assembles a genesis-scientific-evidence
 * bundle offline (real SHA-256 from the supplied bytes), and the bundle adapter must then verify
 * it. Every corruption / stub / mislabel / missing-mandatory case must FAIL CLOSED — a placeholder
 * can never masquerade as scientific evidence, and no content is ever fabricated.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildBundleFromSupplied, assertUsableIdentity } from '../../../scripts/build-bundle-from-supplied.mjs';
import { openBundle } from './corpus/bundleAdapter.mjs';
import { parseUniprot, parsePubchem, parseChembl } from './corpus/parsers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../test-fixtures/genesis-scientific-evidence-bundle-v1');

/** Build a supplied-inputs directory seeded from the (synthetic) fixture raw payloads. */
function suppliedDir({ omit = [], mode = 'TEST_FIXTURE', mutate = null } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-supplied-'));
  const copies = {
    UNIPROT: ['payloads/proteins/UNIPROT_TESTFIX.json', 'uniprot.json'],
    CHEMBL: ['payloads/bioactivity/CHEMBL_TESTFIX.json', 'chembl.json'],
    PUBCHEM: ['payloads/compounds/CID_TESTFIX.json', 'pubchem.json'],
    EUROPE_PMC: ['payloads/articles/EPMC_TESTFIX1.json', 'epmc.json'],
    RCSB_PDB: ['payloads/structures/PDB_TESTFIX.json', 'pdb.json'],
  };
  const inputs = [];
  for (const [svc, [src, dst]] of Object.entries(copies)) {
    if (omit.includes(svc)) continue;
    cpSync(path.join(FIXTURE, src), path.join(dir, dst));
    inputs.push({ sourceService: svc, file: dst, sourceUrl: `https://example.org/${svc}`, license: 'UNKNOWN' });
  }
  const spec = { schema: 'genesis-supplied-inputs/1', bundleId: 'b', campaignId: 'real-scientific-campaign-001', ingestionMode: mode, inputs };
  writeFileSync(path.join(dir, 'SUPPLIED_INPUTS.json'), JSON.stringify(mutate ? mutate(spec) : spec, null, 2));
  return dir;
}
const outDir = () => mkdtempSync(path.join(tmpdir(), 'genesis-supplied-out-'));

describe('offline supplied-payload builder — happy path + verification', () => {
  test('assembles a bundle whose SHA-256 / provenance / identity all verify', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      const s = buildBundleFromSupplied({ suppliedDir: sup, outDir: out });
      assert.equal(s.entryCount, 5);
      assert.equal(s.ingestionMode, 'TEST_FIXTURE');
      const v = openBundle(out).verifyAll();
      assert.equal(v.ok, true, JSON.stringify(v.results.filter((r) => !r.ok)));
      assert.equal(v.results.length, 5);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('contentHash in the manifest is the real SHA-256 of the supplied bytes (never hand-authored)', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      buildBundleFromSupplied({ suppliedDir: sup, outDir: out });
      const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
      for (const e of manifest.entries) {
        const bytes = readFileSync(path.join(out, e.payloadRef));
        const real = createHash('sha256').update(bytes).digest('hex');
        assert.equal(e.contentHash, real, `entry ${e.entryId} hash must match its payload bytes`);
      }
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('every provenance file exists and records the supplied source URL', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      buildBundleFromSupplied({ suppliedDir: sup, outDir: out });
      const manifest = JSON.parse(readFileSync(path.join(out, 'manifest.json'), 'utf8'));
      for (const e of manifest.entries) {
        const prov = JSON.parse(readFileSync(path.join(out, e.provenanceRef), 'utf8'));
        assert.equal(prov.sourceService, e.sourceService);
        assert.ok(prov.sourceUrl, `entry ${e.entryId} provenance must keep a sourceUrl`);
      }
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });
});

describe('offline supplied-payload builder — FAIL CLOSED', () => {
  test('a VERIFIED_BUNDLE missing a mandatory source (CHEMBL) is refused', () => {
    const sup = suppliedDir({ omit: ['CHEMBL'], mode: 'VERIFIED_BUNDLE' });
    const out = outDir();
    try {
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /missing mandatory source.*CHEMBL/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('a stub payload that "parses" but lacks identity is rejected (not usable evidence)', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      writeFileSync(path.join(sup, 'uniprot.json'), JSON.stringify({})); // empty object parses, has no accession
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /UNIPROT payload has no primaryAccession/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('a non-JSON supplied payload fails closed', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      writeFileSync(path.join(sup, 'pubchem.json'), 'not json at all');
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /not valid JSON/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('a "file" that escapes the supplied dir (path traversal) is refused', () => {
    const sup = suppliedDir({ mutate: (spec) => { spec.inputs[0].file = '../../../etc/passwd'; return spec; } });
    const out = outDir();
    try {
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /traversal|escapes/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('an unsupported supplied-inputs schema is refused', () => {
    const sup = suppliedDir({ mutate: (spec) => ({ ...spec, schema: 'something-else/9' }) });
    const out = outDir();
    try {
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /unsupported supplied-inputs schema/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });

  test('duplicate source identity is refused', () => {
    const sup = suppliedDir();
    const out = outDir();
    try {
      // Add a second UNIPROT input pointing at the same payload → same service:accession identity.
      const spec = JSON.parse(readFileSync(path.join(sup, 'SUPPLIED_INPUTS.json'), 'utf8'));
      cpSync(path.join(sup, 'uniprot.json'), path.join(sup, 'uniprot2.json'));
      spec.inputs.push({ sourceService: 'UNIPROT', file: 'uniprot2.json', license: 'CC-BY' });
      writeFileSync(path.join(sup, 'SUPPLIED_INPUTS.json'), JSON.stringify(spec));
      assert.throws(() => buildBundleFromSupplied({ suppliedDir: sup, outDir: out }), /duplicate source identity/);
    } finally { rmSync(sup, { recursive: true, force: true }); rmSync(out, { recursive: true, force: true }); }
  });
});

describe('offline supplied-payload builder — assertUsableIdentity guards', () => {
  test('a genuine-shaped UniProt entity passes; an empty one throws', () => {
    assert.doesNotThrow(() => assertUsableIdentity('UNIPROT', parseUniprot({ primaryAccession: 'P15056' })));
    assert.throws(() => assertUsableIdentity('UNIPROT', parseUniprot({})), /no primaryAccession/);
  });

  test('PubChem without SMILES is rejected (RDKit/ADMET cannot run on it)', () => {
    assert.throws(
      () => assertUsableIdentity('PUBCHEM', parsePubchem({ PropertyTable: { Properties: [{ CID: 1 }] } })),
      /no CanonicalSMILES/,
    );
  });

  test('ChEMBL without standard_type is rejected (Ki/IC50 must be preserved)', () => {
    assert.throws(
      () => assertUsableIdentity('CHEMBL', parseChembl({ activity_id: 1 })),
      /no standard_type/,
    );
  });
});
