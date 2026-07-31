/**
 * Campaign #001 OFFLINE bundle builder — "externally supplied official payloads" path.
 *
 * When the runner has NO egress (this sandbox, an air-gapped host), the operator downloads the
 * OFFICIAL payloads on a network-enabled machine (per REAL_CAMPAIGN_INPUT_REQUIREMENTS.json),
 * drops the raw files into a directory alongside a filled SUPPLIED_INPUTS.json, and this builder
 * assembles a `genesis-scientific-evidence-bundle-v1` from them with ZERO network:
 *
 *   - reads each supplied raw payload EXACTLY as downloaded (bytes preserved)
 *   - computes the real SHA-256 of those bytes (never hand-authored)
 *   - validates the payload actually PARSES to a usable entity of its claimed type
 *     (a UniProt file must yield an accession, a ChEMBL file an activity + standard_type,
 *      a PubChem file a CID/InChIKey + SMILES) — a stub or wrong-type file FAILS CLOSED
 *   - writes provenance, assembles manifest.json, and FAILS CLOSED if any mandatory source
 *     (CHEMBL, PUBCHEM, UNIPROT) is missing
 *
 * It NEVER fabricates a record and NEVER invents content — every field comes from the supplied
 * bytes. ingestionMode is taken from SUPPLIED_INPUTS.json: use VERIFIED_BUNDLE for genuine
 * official payloads, TEST_FIXTURE for synthetic pipeline self-checks (so nothing is mislabelled).
 *
 * CLI:  node scripts/build-bundle-from-supplied.mjs --supplied <dir> --out <bundleDir>
 */
/* global Buffer */
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseFor } from '../packages/backend/src/corpus/parsers.mjs';
import { SOURCE_SERVICE, INGESTION_MODE } from '../packages/backend/src/corpus/sourcePort.mjs';

const MANDATORY = [SOURCE_SERVICE.CHEMBL, SOURCE_SERVICE.PUBCHEM, SOURCE_SERVICE.UNIPROT];
const DEFAULT_TYPE = {
  UNIPROT: 'protein', CHEMBL: 'bioactivity', PUBCHEM: 'compound', EUROPE_PMC: 'article', RCSB_PDB: 'structure',
};
const TYPE_DIR = { protein: 'proteins', bioactivity: 'bioactivity', compound: 'compounds', article: 'articles', structure: 'structures' };

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sanitize = (s) => String(s).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);

/** Refuse a path that escapes the supplied directory (traversal / absolute). */
function safeSuppliedPath(root, rel) {
  if (typeof rel !== 'string' || rel.length === 0) throw new Error('supplied input "file" is empty');
  if (path.isAbsolute(rel)) throw new Error(`supplied "file" must be relative to the supplied dir: ${rel}`);
  if (rel.split(/[\\/]/).includes('..')) throw new Error(`path traversal rejected in supplied "file": ${rel}`);
  const resolved = path.resolve(root, rel);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) throw new Error(`supplied "file" escapes the supplied dir: ${rel}`);
  return resolved;
}

/**
 * Prove the parsed entity carries the identity + campaign-usable fields for its type. This is what
 * distinguishes a genuine official payload from an empty {} that merely "parses". Fail closed here
 * so a bundle can never carry a placeholder masquerading as evidence.
 */
export function assertUsableIdentity(sourceService, entity) {
  const id = entity.identifiers ?? {};
  switch (sourceService) {
    case SOURCE_SERVICE.UNIPROT:
      if (!id.accession) throw new Error('UNIPROT payload has no primaryAccession — not a usable protein record');
      break;
    case SOURCE_SERVICE.CHEMBL:
      if (!id.activityId) throw new Error('CHEMBL payload has no activity_id — not a usable bioactivity record');
      if (!entity.standardType) throw new Error('CHEMBL payload has no standard_type — Ki/IC50/Kd/EC50 must be preserved');
      break;
    case SOURCE_SERVICE.PUBCHEM:
      if (!id.cid && !id.inchiKey) throw new Error('PUBCHEM payload has neither CID nor InChIKey — no compound identity');
      if (!entity.canonicalSmiles) throw new Error('PUBCHEM payload has no CanonicalSMILES — RDKit/ADMET cannot run on it');
      break;
    case SOURCE_SERVICE.EUROPE_PMC:
      if (!id.pmid && !id.pmcid && !id.doi) throw new Error('EUROPE_PMC payload has no pmid/pmcid/doi — no article identity');
      break;
    case SOURCE_SERVICE.RCSB_PDB:
      if (!id.pdbId) throw new Error('RCSB_PDB payload has no rcsb_id — not a usable structure record');
      break;
    default:
      throw new Error(`unsupported source service ${sourceService}`);
  }
}

/**
 * Assemble a verified bundle from operator-supplied official payloads. Pure filesystem, no network.
 * Returns a summary; THROWS (fail closed) on any malformed / unusable / missing-mandatory input.
 */
export function buildBundleFromSupplied({ suppliedDir, outDir, log = () => {} }) {
  const suppliedRoot = path.resolve(suppliedDir);
  const out = path.resolve(outDir);
  const specPath = path.join(suppliedRoot, 'SUPPLIED_INPUTS.json');
  let spec;
  try { spec = JSON.parse(readFileSync(specPath, 'utf8')); }
  catch (e) { throw new Error(`cannot read SUPPLIED_INPUTS.json in ${suppliedRoot}: ${e.message}`, { cause: e }); }
  if (spec.schema !== 'genesis-supplied-inputs/1') throw new Error(`unsupported supplied-inputs schema: ${spec.schema}`);
  if (!Array.isArray(spec.inputs) || spec.inputs.length === 0) throw new Error('SUPPLIED_INPUTS.json has no inputs');
  const ingestionMode = spec.ingestionMode === INGESTION_MODE.TEST_FIXTURE ? INGESTION_MODE.TEST_FIXTURE : INGESTION_MODE.VERIFIED_BUNDLE;

  for (const d of Object.values(TYPE_DIR)) mkdirSync(path.join(out, 'payloads', d), { recursive: true });
  mkdirSync(path.join(out, 'provenance'), { recursive: true });

  const entries = [];
  const seen = new Set();
  const services = new Set();
  for (let i = 0; i < spec.inputs.length; i++) {
    const inp = spec.inputs[i];
    const svc = inp.sourceService;
    if (!Object.values(SOURCE_SERVICE).includes(svc)) throw new Error(`input #${i}: unsupported sourceService ${svc}`);
    const srcPath = safeSuppliedPath(suppliedRoot, inp.file);
    if (!statSync(srcPath).isFile()) throw new Error(`input #${i}: supplied file is not a file: ${inp.file}`);
    const buf = readFileSync(srcPath);
    let raw;
    try { raw = JSON.parse(buf.toString('utf8')); }
    catch (e) { throw new Error(`input #${i} (${svc}): supplied payload is not valid JSON: ${e.message}`, { cause: e }); }
    const entity = parseFor(svc, raw);            // fail closed on wrong shape
    assertUsableIdentity(svc, entity);            // fail closed on stub / wrong type
    const sourceId = String(inp.sourceId ?? entity.identifiers.accession ?? entity.identifiers.activityId ?? entity.identifiers.cid ?? entity.identifiers.inchiKey ?? entity.identifiers.pdbId ?? entity.identifiers.pmid);
    const key = `${svc}:${sourceId}`;
    if (seen.has(key)) throw new Error(`duplicate source identity ${key} (input #${i})`);
    seen.add(key);
    const sourceType = inp.sourceType ?? DEFAULT_TYPE[svc];
    const dir = TYPE_DIR[sourceType] ?? 'metadata';
    const entryId = `e-${svc.toLowerCase()}-${sanitize(sourceId)}`;
    const payloadRef = `payloads/${dir}/${sanitize(entryId)}.json`;
    writeFileSync(path.join(out, payloadRef), buf);            // exact bytes → hash is stable + real
    const contentHash = sha256(buf);
    const provenanceRef = `provenance/${sanitize(entryId)}.json`;
    writeFileSync(path.join(out, provenanceRef), Buffer.from(JSON.stringify({
      provenanceId: `prov_${entryId}`, sourceService: svc, sourceId,
      sourceUrl: inp.sourceUrl ?? null, retrievedAt: inp.retrievedAt ?? null,
      sourceVersion: inp.sourceVersion ?? null,
      note: ingestionMode === INGESTION_MODE.TEST_FIXTURE ? 'SYNTHETIC pipeline self-check payload (TEST_FIXTURE)' : 'operator-supplied OFFICIAL payload (downloaded externally)',
    }, null, 2)));
    entries.push({
      entryId, sourceService: svc, sourceType, sourceId, payloadRef,
      sourceUrl: inp.sourceUrl ?? null, contentHash, hashAlgorithm: 'sha256',
      provenanceRef, license: inp.license ?? 'UNKNOWN', parserVersion: 'v1', retrievedAt: inp.retrievedAt ?? null,
    });
    services.add(svc);
    log(`  + ${svc.padEnd(11)} ${sourceId}  sha256=${contentHash.slice(0, 12)}…  (${sourceType})`);
  }

  const missing = MANDATORY.filter((m) => !services.has(m));
  if (missing.length && ingestionMode === INGESTION_MODE.VERIFIED_BUNDLE) {
    throw new Error(`FAIL CLOSED — supplied inputs missing mandatory source(s): ${missing.join(', ')}. No usable real bundle assembled.`);
  }

  const manifest = {
    manifestVersion: 'genesis-scientific-evidence-bundle-v1',
    bundleId: spec.bundleId ?? 'real-scientific-campaign-001-bundle',
    campaignId: spec.campaignId ?? 'real-scientific-campaign-001',
    ingestionMode,
    builtBy: 'build-bundle-from-supplied.mjs',
    note: ingestionMode === INGESTION_MODE.TEST_FIXTURE
      ? 'SYNTHETIC pipeline self-check assembled from TEST_FIXTURE inputs. NOT real scientific evidence.'
      : 'Assembled offline from operator-supplied OFFICIAL payloads. SHA-256 computed from the supplied bytes.',
    entries,
  };
  writeFileSync(path.join(out, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
  return { outDir: out, ingestionMode, entryCount: entries.length, services: [...services], missingMandatory: missing };
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const suppliedDir = path.resolve(opt('--supplied', path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/supplied')));
  const outDir = path.resolve(opt('--out', path.resolve(__dirname, '../campaigns/real-scientific-campaign-001/bundle')));
  console.log(`[offline-builder] assembling bundle from supplied payloads in ${suppliedDir}`);
  try {
    const s = buildBundleFromSupplied({ suppliedDir, outDir, log: (m) => console.log(m) });
    console.log(`[offline-builder] OK — ${s.entryCount} entries, mode ${s.ingestionMode}, services [${s.services.join(', ')}] → ${s.outDir}`);
    console.log('[offline-builder] verify next with: node scripts/run-campaign-001.mjs --supplied ' + suppliedDir);
  } catch (e) {
    console.error(`[offline-builder] ${e.message}`);
    process.exit(2);
  }
}
