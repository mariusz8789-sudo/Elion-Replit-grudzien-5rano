/**
 * Builds the TEST_FIXTURE evidence bundle (Corpus Mandate). This is NOT real acquired science:
 * every payload is SYNTHETIC and the manifest is stamped ingestionMode=TEST_FIXTURE so the
 * adapter classifies its evidence origin as TEST_FIXTURE — it can never masquerade as a
 * publisher/database record. Real bundles are produced by the live builder outside this
 * network-restricted environment (see docs/GENESIS_CORPUS_FACTORY.md).
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../test-fixtures/genesis-scientific-evidence-bundle-v1');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const PAYLOADS = {
  'payloads/articles/EPMC_TESTFIX1.json': { pmid: 'TESTFIX1', doi: '10.0000/genesis-test-fixture-1', title: '[TEST FIXTURE] Synthetic article on a synthetic target', authorString: 'Fixture A, Fixture B', journalTitle: 'Journal of Test Fixtures', firstPublicationDate: '2024-01-01', pubType: 'research-article', isOpenAccess: 'Y', abstractText: 'SYNTHETIC abstract for pipeline testing only.' },
  'payloads/structures/PDB_TESTFIX.json': { rcsb_id: 'TESTFIX', exptl: [{ method: 'X-RAY DIFFRACTION' }], rcsb_entry_info: { resolution_combined: [2.1], polymer_entity_count: 1 }, nonpolymer_entities: [{ id: 'LIG' }] },
  'payloads/compounds/CID_TESTFIX.json': { PropertyTable: { Properties: [{ CID: 999999999, InChIKey: 'TESTFIXKEYAAAAA-AAAAAAAAAA-N', CanonicalSMILES: 'CC(=O)Oc1ccccc1C(=O)O', MolecularFormula: 'C9H8O4', MolecularWeight: 180.16 }] } },
  'payloads/proteins/UNIPROT_TESTFIX.json': { primaryAccession: 'TESTFX', proteinDescription: { recommendedName: { fullName: { value: '[TEST FIXTURE] synthetic protein' } } }, organism: { scientificName: 'Synthetica testfixtura' }, sequence: { length: 321 }, entryType: 'UniProtKB reviewed (Swiss-Prot)', comments: [{ commentType: 'FUNCTION', texts: [{ value: 'Synthetic function annotation for testing.' }] }] },
  'payloads/bioactivity/CHEMBL_TESTFIX.json': { activity_id: 'ACT_TESTFIX', assay_chembl_id: 'CHEMBL_TESTASSAY', molecule_chembl_id: 'CHEMBL_TESTMOL', target_chembl_id: 'CHEMBL_TESTTGT', standard_type: 'IC50', standard_relation: '=', standard_value: 42.0, standard_units: 'nM', assay_description: 'SYNTHETIC binding assay (fixture)', assay_type: 'B', target_organism: 'Synthetica testfixtura', target_pref_name: '[TEST FIXTURE] synthetic target', confidence_score: 9, data_validity_comment: null },
};

const ENTRIES = [
  { entryId: 'e-article', sourceService: 'EUROPE_PMC', sourceType: 'article', sourceId: 'TESTFIX1', payloadRef: 'payloads/articles/EPMC_TESTFIX1.json', sourceUrl: 'https://europepmc.org/abstract/MED/TESTFIX1', license: 'CC-BY', parserVersion: 'v1' },
  { entryId: 'e-structure', sourceService: 'RCSB_PDB', sourceType: 'structure', sourceId: 'TESTFIX', payloadRef: 'payloads/structures/PDB_TESTFIX.json', sourceUrl: 'https://www.rcsb.org/structure/TESTFIX', license: 'CC0', parserVersion: 'v1' },
  { entryId: 'e-compound', sourceService: 'PUBCHEM', sourceType: 'compound', sourceId: '999999999', payloadRef: 'payloads/compounds/CID_TESTFIX.json', sourceUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/999999999', license: 'PUBLIC_DOMAIN', parserVersion: 'v1' },
  { entryId: 'e-protein', sourceService: 'UNIPROT', sourceType: 'protein', sourceId: 'TESTFX', payloadRef: 'payloads/proteins/UNIPROT_TESTFIX.json', sourceUrl: 'https://www.uniprot.org/uniprotkb/TESTFX', license: 'CC-BY', parserVersion: 'v1' },
  { entryId: 'e-bioactivity', sourceService: 'CHEMBL', sourceType: 'bioactivity', sourceId: 'ACT_TESTFIX', payloadRef: 'payloads/bioactivity/CHEMBL_TESTFIX.json', sourceUrl: 'https://www.ebi.ac.uk/chembl/', license: 'CC-BY-SA', parserVersion: 'v1' },
];

for (const dir of ['payloads/articles', 'payloads/structures', 'payloads/compounds', 'payloads/proteins', 'payloads/bioactivity', 'provenance']) mkdirSync(path.join(ROOT, dir), { recursive: true });

const entries = [];
for (const e of ENTRIES) {
  const payloadObj = PAYLOADS[e.payloadRef];
  const buf = Buffer.from(JSON.stringify(payloadObj, null, 2));
  writeFileSync(path.join(ROOT, e.payloadRef), buf);
  const contentHash = sha256(buf);
  const provenanceRef = `provenance/${e.entryId}.json`;
  const provenance = { provenanceId: `prov_${e.entryId}`, sourceService: e.sourceService, sourceId: e.sourceId, sourceUrl: e.sourceUrl, retrievedAt: null, sourceVersion: 'TEST_FIXTURE', note: 'SYNTHETIC TEST FIXTURE — not acquired from any live source; retrievedAt is null because there was no retrieval.' };
  writeFileSync(path.join(ROOT, provenanceRef), Buffer.from(JSON.stringify(provenance, null, 2)));
  entries.push({ ...e, contentHash, hashAlgorithm: 'sha256', provenanceRef, retrievedAt: null });
}

const manifest = {
  manifestVersion: 'genesis-scientific-evidence-bundle-v1', bundleId: 'genesis-testfix-bundle-1', ingestionMode: 'TEST_FIXTURE',
  note: 'SYNTHETIC TEST FIXTURE bundle. All payloads are fabricated for pipeline testing and are classified TEST_FIXTURE. NOT real scientific evidence.',
  builtBy: 'build-fixture-bundle.mjs', entries,
};
writeFileSync(path.join(ROOT, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
console.log(`Fixture bundle written to ${ROOT} with ${entries.length} entries (SHA-256).`);
// Self-check: re-hash and confirm.
for (const e of entries) {
  const actual = sha256(readFileSync(path.join(ROOT, e.payloadRef)));
  if (actual !== e.contentHash) { console.error('HASH MISMATCH', e.entryId); process.exit(1); }
}
console.log('Self-check OK — all payload hashes match the manifest.');
