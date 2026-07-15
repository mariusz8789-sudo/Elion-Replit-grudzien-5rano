/* global setTimeout, clearTimeout, AbortController, Buffer */
/**
 * Campaign #001 REAL evidence acquisition pipeline (external, network-enabled).
 *
 * Self-resolving: from the BRAF/V600E research question it resolves and acquires genuine records
 * from UniProt → ChEMBL → PubChem → Europe PMC → RCSB PDB, preserves raw payloads, computes
 * SHA-256, writes provenance, and builds a genesis-scientific-evidence-bundle-v1 manifest
 * (ingestionMode: VERIFIED_BUNDLE). It FAILS CLOSED if any mandatory source (ChEMBL, PubChem,
 * UniProt) is unavailable and NEVER fabricates a record.
 *
 * Run OUTSIDE the policy-restricted sandbox (needs real egress). Usage:
 *   node scripts/build-real-campaign-001-bundle.mjs --out campaigns/real-scientific-campaign-001/bundle
 *     [--max-activities 40] [--max-molecules 15] [--with-structure]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/bundle')));
const MAX_ACT = Number(opt('--max-activities', '40'));
const MAX_MOL = Number(opt('--max-molecules', '15'));
const WITH_STRUCTURE = argv.includes('--with-structure');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const nowIso = () => new Date().toISOString();
const diag = [];
function record(sourceService, entry) { diag.push({ sourceService, ...entry }); }

async function politeFetch(url, { attempts = 4, baseDelayMs = 600, timeoutMs = 30000, accept = 'application/json' } = {}) {
  for (let a = 0; a < attempts; a++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal, headers: { accept, 'user-agent': 'genesis-corpus-builder/1 (research)' } });
      clearTimeout(to);
      if (res.status === 429 || res.status >= 500) { await sleep(baseDelayMs * 2 ** a); continue; }
      if (!res.ok) return { ok: false, status: res.status };
      const text = await res.text();
      return { ok: true, status: res.status, text };
    } catch (e) {
      if (a === attempts - 1) return { ok: false, error: String(e?.message ?? e) };
      await sleep(baseDelayMs * 2 ** a);
    }
  }
  return { ok: false, error: 'exhausted retries' };
}

const entries = [];
const acquired = new Set();
function writeEntry({ entryId, sourceService, sourceType, sourceId, sourceUrl, license, buf }) {
  const dir = { protein: 'proteins', bioactivity: 'bioactivity', compound: 'compounds', article: 'articles', structure: 'structures' }[sourceType] ?? 'metadata';
  const payloadRef = `payloads/${dir}/${entryId}.json`;
  writeFileSync(path.join(OUT, payloadRef), buf);
  const contentHash = sha256(buf);
  const provenanceRef = `provenance/${entryId}.json`;
  writeFileSync(path.join(OUT, provenanceRef), Buffer.from(JSON.stringify({ provenanceId: `prov_${entryId}`, sourceService, sourceId, sourceUrl, retrievedAt: nowIso(), sourceVersion: null, note: 'REAL acquired payload' }, null, 2)));
  entries.push({ entryId, sourceService, sourceType, sourceId: String(sourceId), payloadRef, sourceUrl, contentHash, hashAlgorithm: 'sha256', provenanceRef, license, parserVersion: 'v1', retrievedAt: nowIso() });
  acquired.add(sourceService);
}

async function acquireUniProt() {
  const url = 'https://rest.uniprot.org/uniprotkb/search?query=gene:BRAF+AND+organism_id:9606+AND+reviewed:true&format=json&size=1';
  const r = await politeFetch(url); await sleep(300);
  if (!r.ok) { record('UNIPROT', { ok: false, status: r.status ?? r.error }); return null; }
  const j = JSON.parse(r.text); const acc = j.results?.[0]?.primaryAccession;
  if (!acc) { record('UNIPROT', { ok: false, reason: 'no BRAF accession resolved' }); return null; }
  const er = await politeFetch(`https://rest.uniprot.org/uniprotkb/${acc}.json`); await sleep(300);
  if (!er.ok) { record('UNIPROT', { ok: false, status: er.status }); return null; }
  writeEntry({ entryId: `e-uniprot-${acc}`, sourceService: 'UNIPROT', sourceType: 'protein', sourceId: acc, sourceUrl: `https://www.uniprot.org/uniprotkb/${acc}`, license: 'CC-BY', buf: Buffer.from(er.text) });
  record('UNIPROT', { ok: true, accession: acc });
  return acc;
}

async function acquireChembl() {
  const ts = await politeFetch('https://www.ebi.ac.uk/chembl/api/data/target/search.json?q=BRAF'); await sleep(400);
  if (!ts.ok) { record('CHEMBL', { ok: false, status: ts.status ?? ts.error, stage: 'target-search' }); return []; }
  const tj = JSON.parse(ts.text);
  const target = (tj.targets ?? []).find((t) => /9606|Homo sapiens/.test(JSON.stringify(t.organism ?? ''))) ?? tj.targets?.[0];
  const targetId = target?.target_chembl_id;
  if (!targetId) { record('CHEMBL', { ok: false, reason: 'no BRAF target_chembl_id' }); return []; }
  const ar = await politeFetch(`https://www.ebi.ac.uk/chembl/api/data/activity.json?target_chembl_id=${targetId}&standard_type__in=IC50,Ki,Kd,EC50&limit=${MAX_ACT}`); await sleep(400);
  if (!ar.ok) { record('CHEMBL', { ok: false, status: ar.status, stage: 'activities' }); return []; }
  const acts = JSON.parse(ar.text).activities ?? [];
  const molecules = [];
  for (const a of acts) {
    writeEntry({ entryId: `e-chembl-${a.activity_id}`, sourceService: 'CHEMBL', sourceType: 'bioactivity', sourceId: a.activity_id, sourceUrl: `https://www.ebi.ac.uk/chembl/`, license: 'CC-BY-SA', buf: Buffer.from(JSON.stringify(a)) });
    if (a.molecule_chembl_id && !molecules.includes(a.molecule_chembl_id)) molecules.push(a.molecule_chembl_id);
  }
  record('CHEMBL', { ok: true, targetId, activities: acts.length, molecules: molecules.length });
  return molecules.slice(0, MAX_MOL);
}

async function acquirePubchem(chemblMoleculeIds) {
  let count = 0;
  for (const mid of chemblMoleculeIds) {
    const mr = await politeFetch(`https://www.ebi.ac.uk/chembl/api/data/molecule/${mid}.json`); await sleep(300);
    if (!mr.ok) continue;
    const inchiKey = JSON.parse(mr.text).molecule_structures?.standard_inchi_key;
    if (!inchiKey) continue;
    const cr = await politeFetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/inchikey/${inchiKey}/property/CanonicalSMILES,InChIKey,MolecularFormula,MolecularWeight/JSON`); await sleep(300); // <=5 req/s
    if (!cr.ok) continue;
    const cid = JSON.parse(cr.text).PropertyTable?.Properties?.[0]?.CID;
    writeEntry({ entryId: `e-pubchem-${cid ?? inchiKey}`, sourceService: 'PUBCHEM', sourceType: 'compound', sourceId: cid ?? inchiKey, sourceUrl: cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}` : null, license: 'PUBLIC_DOMAIN', buf: Buffer.from(cr.text) });
    count++;
  }
  record('PUBCHEM', { ok: count > 0, compounds: count });
}

async function acquireEuropePmc() {
  const r = await politeFetch('https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=BRAF%20V600E%20inhibitor%20melanoma&format=json&pageSize=15'); await sleep(300);
  if (!r.ok) { record('EUROPE_PMC', { ok: false, status: r.status ?? r.error }); return; }
  const results = JSON.parse(r.text).resultList?.result ?? [];
  for (const a of results) writeEntry({ entryId: `e-epmc-${a.id ?? a.pmid}`, sourceService: 'EUROPE_PMC', sourceType: 'article', sourceId: a.pmid ?? a.id, sourceUrl: a.doi ? `https://doi.org/${a.doi}` : `https://europepmc.org/abstract/MED/${a.pmid}`, license: 'UNKNOWN', buf: Buffer.from(JSON.stringify(a)) });
  record('EUROPE_PMC', { ok: results.length > 0, articles: results.length });
}

async function acquireRcsb(accession) {
  if (!WITH_STRUCTURE || !accession) { record('RCSB_PDB', { ok: false, skipped: true, reason: '--with-structure not set or no accession' }); return; }
  // Resolve PDB entries mapped to the UniProt accession via RCSB search, then fetch entry JSON (+ mmCIF for docking prep).
  const q = encodeURIComponent(JSON.stringify({ query: { type: 'terminal', service: 'text', parameters: { attribute: 'rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession', operator: 'exact_match', value: accession } }, return_type: 'entry', request_options: { paginate: { rows: 1 } } }));
  const sr = await politeFetch(`https://search.rcsb.org/rcsbsearch/v2/query?json=${q}`); await sleep(400);
  if (!sr.ok) { record('RCSB_PDB', { ok: false, status: sr.status }); return; }
  const pdbId = JSON.parse(sr.text).result_set?.[0]?.identifier;
  if (!pdbId) { record('RCSB_PDB', { ok: false, reason: 'no PDB entry for accession' }); return; }
  const er = await politeFetch(`https://data.rcsb.org/rest/v1/core/entry/${pdbId}`); await sleep(300);
  if (!er.ok) { record('RCSB_PDB', { ok: false, status: er.status }); return; }
  writeEntry({ entryId: `e-rcsb-${pdbId}`, sourceService: 'RCSB_PDB', sourceType: 'structure', sourceId: pdbId, sourceUrl: `https://www.rcsb.org/structure/${pdbId}`, license: 'CC0', buf: Buffer.from(er.text) });
  const cif = await politeFetch(`https://files.rcsb.org/download/${pdbId}.cif`, { accept: 'chemical/x-mmcif' }); await sleep(300);
  if (cif.ok) { mkdirSync(path.join(OUT, 'structures-raw'), { recursive: true }); writeFileSync(path.join(OUT, `structures-raw/${pdbId}.cif`), Buffer.from(cif.text)); }
  record('RCSB_PDB', { ok: true, pdbId, mmcifDownloaded: cif.ok, dockingNote: 'mmCIF is NOT docking-ready — receptor preparation (protonation, site definition, PDBQT via Meeko) required before Vina' });
}

async function main() {
  for (const d of ['payloads/articles', 'payloads/structures', 'payloads/compounds', 'payloads/proteins', 'payloads/bioactivity', 'provenance']) mkdirSync(path.join(OUT, d), { recursive: true });
  console.log(`[builder] acquiring REAL BRAF/V600E evidence into ${OUT}`);
  const accession = await acquireUniProt();
  const molecules = await acquireChembl();
  await acquirePubchem(molecules);
  await acquireEuropePmc();
  await acquireRcsb(accession);

  writeFileSync(path.join(OUT, 'acquisition-diagnostics.json'), Buffer.from(JSON.stringify({ attemptedAt: nowIso(), perSource: diag }, null, 2)));
  const MANDATORY = ['CHEMBL', 'PUBCHEM', 'UNIPROT'];
  const missing = MANDATORY.filter((m) => !acquired.has(m));
  if (missing.length) {
    console.error(`[builder] FAIL CLOSED — missing mandatory source(s): ${missing.join(', ')}. No usable bundle written. See acquisition-diagnostics.json.`);
    process.exit(2);
  }
  const manifest = { manifestVersion: 'genesis-scientific-evidence-bundle-v1', bundleId: 'real-scientific-campaign-001-bundle', campaignId: 'real-scientific-campaign-001', ingestionMode: 'VERIFIED_BUNDLE', builtAt: nowIso(), builtBy: 'build-real-campaign-001-bundle.mjs', entries };
  writeFileSync(path.join(OUT, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
  console.log(`[builder] OK — wrote ${entries.length} REAL entries. Verify: node -e "import('./packages/backend/src/corpus/bundleAdapter.mjs').then(m=>console.log(m.openBundle('${OUT}').verifyAll()))"`);
}

main().catch((e) => { console.error('[builder] fatal:', e); process.exit(1); });
