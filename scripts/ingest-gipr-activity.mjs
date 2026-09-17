#!/usr/bin/env node
/**
 * D-081 — ingest a HUMAN-SUPPLIED human GIPR activity artifact and pin it.
 *
 * Usage:
 *   node scripts/ingest-gipr-activity.mjs --raw ./glp1r_human_activities.json [--target-id CHEMBLxxxxx] [--dry-run]
 *
 * ========================= EGRESS IS OFF, DELIBERATELY =====================
 *
 * This script NEVER fetches. ChEMBL is unreachable from this runtime (verified
 * live: HTTP 403 CONNECT tunnel failure at the agent proxy), and a `--fetch`
 * flag that cannot work would be dead code pretending to be a capability. The
 * download is a HUMAN or CI step, performed on a network-enabled machine; this
 * script's job begins with the bytes already on disk and consists of
 * normalizing them, rejecting everything that cannot be normalized
 * unambiguously, and computing a pin over the real bytes.
 *
 * ============================ HUMAN TARGET =================================
 *
 * `CHEMBL5862` is the RAT (Rattus norvegicus) GIPR and MUST NOT be used as a
 * human target id. No human target id is hardcoded anywhere in this pipeline.
 * Human specificity is decided per row from `target_organism === 'Homo
 * sapiens'`. `--target-id`, when given, additionally narrows to one resolved
 * target id — resolve it against the live API on the machine that does the
 * download, e.g.:
 *
 *   GET /chembl/api/data/target.json?pref_name__icontains=glucagon-like peptide 1 receptor
 *       -> pick the entry whose organism is "Homo sapiens", read its target_chembl_id
 *   GET /chembl/api/data/activity.json?target_chembl_id=<RESOLVED>&limit=1000
 *       -> join SMILES via /molecule.json if the activity rows lack them
 *
 * Expected input: a JSON array of activity rows, or `{ activities: [...] }`.
 * Each row needs at minimum: canonical_smiles, standard_type, standard_value,
 * standard_units, target_organism, assay_chembl_id, and a sourceUrl.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeGiprRows, writeGiprPin, GIPR_PIN_PATH, GIPR_PIN_META_PATH } from '../packages/backend/src/campaign/giprQsar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? next : true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.raw || args.raw === true) {
  console.error('usage: node scripts/ingest-gipr-activity.mjs --raw <path-to-activities.json> [--target-id CHEMBLxxxxx] [--dry-run]');
  console.error('this script does NOT fetch — supply a locally downloaded artifact.');
  process.exit(64);
}

const rawPath = path.resolve(HERE, '..', String(args.raw));
let parsed;
try {
  parsed = JSON.parse(readFileSync(rawPath, 'utf8'));
} catch (err) {
  console.error(`FAILED to read/parse ${rawPath}: ${String(err?.message ?? err)}`);
  process.exit(65);
}

const rowsIn = Array.isArray(parsed) ? parsed : (parsed.activities ?? []);

/**
 * The target id is resolved FROM THE ARTIFACT, never from a conversation.
 * `--target-id` overrides only if the operator states one explicitly. Either
 * way `normalizeGlp1rRows` still enforces `target_organism === 'Homo sapiens'`
 * per row, so a wrong id cannot smuggle a non-human row through.
 */
const artifactTarget = typeof parsed?.target_resolution?.resolved_target_chembl_id === 'string'
  ? parsed.target_resolution.resolved_target_chembl_id
  : null;
const expectedTargetId = typeof args['target-id'] === 'string' ? args['target-id'] : artifactTarget;

const datasetProvenance = {
  sourceUrl: typeof parsed?.source === 'string' ? parsed.source : null,
  fetchedAt: typeof parsed?.fetchedAt === 'string' ? parsed.fetchedAt : null,
};

const { rows, dropped, resolvedTargetIds, kept, seen } = normalizeGiprRows(rowsIn, { expectedTargetId, datasetProvenance });

console.log('=== GIPR ACTIVITY INGESTION (D-081) ===');
console.log(`source artifact : ${rawPath}`);
console.log(`dataset source  : ${datasetProvenance.sourceUrl ?? '(none stated)'}`);
console.log(`fetchedAt       : ${datasetProvenance.fetchedAt ?? '(none stated)'}`);
if (parsed?.target_resolution) {
  console.log(`target resolved : ${artifactTarget} (${parsed.target_resolution.organism ?? '?'}) — FROM THE ARTIFACT`);
  console.log(`target rejected : ${(parsed.target_resolution.rejected ?? []).join(', ') || '(none listed)'}`);
}
console.log(`rows in         : ${seen}`);
console.log(`rows kept       : ${kept}`);
console.log(`rejected        : ${JSON.stringify(dropped)}`);
console.log(`target ids seen : ${resolvedTargetIds.join(', ') || '(none)'}`);
if (expectedTargetId) console.log(`target filter   : ${expectedTargetId} (supplied at ingestion, not hardcoded)`);

if (kept === 0) {
  console.log('');
  console.log('OUTCOME: BLOCKED — zero human GIPR rows survived normalization. Nothing was pinned and no model may be trained.');
  console.log('Check that the artifact carries target_organism === "Homo sapiens" rows with parseable SMILES and convertible units.');
  process.exit(2);
}

if (args['dry-run']) {
  console.log('');
  console.log('DRY RUN — nothing written. Re-run without --dry-run to pin.');
  process.exit(0);
}

const pin = writeGiprPin(rows, { resolvedTargetIds });
console.log('');
console.log(`pinned          : ${GIPR_PIN_PATH}`);
console.log(`meta            : ${GIPR_PIN_META_PATH}`);
console.log(`sha256          : ${pin.contentSha256}`);
console.log(`n rows          : ${pin.n}`);
console.log('');
console.log('OUTCOME: PINNED. Any later edit to the pinned bytes changes this sha256 and the loader will refuse to read it (fail-closed).');
console.log('Next: node scripts/genesis-mounjaro-e2e.mjs — trains, validates against the frozen D-081 gate, and reports VALIDATED or BLOCKED.');
