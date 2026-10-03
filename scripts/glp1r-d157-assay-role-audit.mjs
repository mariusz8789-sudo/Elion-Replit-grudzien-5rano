#!/usr/bin/env node
/**
 * D-157 — classifies the 16 assays D-152 could not, now that ChEMBL 37 descriptions exist,
 * with the UNCHANGED D-152 rule, as a new audit layer beside D-151/D-152.
 *
 * Nothing sealed is edited. D-153 is not re-run. The counterfactual enlarged functional arm is
 * reported and not adopted. See glp1r-d157-assay-role-audit-prereg.json (frozen alone, a229ad65).
 *
 * Usage: node scripts/glp1r-d157-assay-role-audit.mjs [--source-dir <dir>] [--source-ref <ref>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { classifyAssayRoleScoped } from '../packages/backend/src/campaign/glp1rEndpointScope.mjs';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPAIGN = path.join(ROOT, 'packages/backend/src/campaign');
const OUT_PATH = path.join(CAMPAIGN, 'glp1r-d157-assay-role-audit.sealed.json');
const argOf = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SRC = argOf('--source-dir', path.join(ROOT, 'docs/evidence/source-data/glp1r-2026-10-03'));
const SRC_REF = argOf('--source-ref', null);

const fail = (code, reason) => { console.error(`${code}: ${reason}`); process.exit(1); };

const prereg = JSON.parse(fs.readFileSync(path.join(CAMPAIGN, 'glp1r-d157-assay-role-audit-prereg.json'), 'utf8'));
const d152Sealed = JSON.parse(fs.readFileSync(path.join(CAMPAIGN, 'glp1r-d152-endpoint-scope.sealed.json'), 'utf8'));
const d152Roles = JSON.parse(fs.readFileSync(path.join(CAMPAIGN, 'glp1r-assay-roles-d152.json'), 'utf8'));

const expected = [...prereg.sourceData.expectedSet].sort();
const blocked = [...d152Sealed.assays.blockedByDataAccess].sort();
if (JSON.stringify(expected) !== JSON.stringify(blocked)) fail('ASSAY_SET_MISMATCH', 'the preregistered set is not D-152\'s blocked list');

const sources = JSON.parse(fs.readFileSync(path.join(SRC, 'SOURCES.json'), 'utf8'));
const declared = new Map((sources.files ?? []).map((f) => [f.path, f]));
const verified = [];
function readVerified(rel) {
  const bytes = fs.readFileSync(path.join(SRC, rel));
  const computed = createHash('sha256').update(bytes).digest('hex');
  const rec = declared.get(rel);
  if (!rec) fail('SOURCE_NOT_IN_MANIFEST', rel);
  if (rec.sha256 !== computed) fail('SOURCE_HASH_MISMATCH', rel);
  verified.push({ path: rel, sourceUrl: rec.sourceUrl, retrievedAt: rec.retrievedAt, sha256: computed });
  return JSON.parse(bytes.toString('utf8'));
}
const chemblStatus = readVerified('chembl/status.json');

// Action types exactly as the D-152 runner derived them: from the A1 transcription rows.
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const actionByAssay = new Map();
for (const f of fs.readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 13 && c[10]) actionByAssay.set(c[2], c[10]);
  }
}

const pin = loadGlp1rPin();
if (!pin.ok) fail('PIN_NOT_LOADABLE', pin.code);

const perAssay = expected.map((id) => {
  const r = readVerified(`chembl/assay/${id}.json`);
  if (!r.description || !String(r.description).trim()) fail('BLOCKED_BY_SOURCE_DATA', `${id} has no description in ChEMBL either`);
  const record = { assayType: r.assay_type ?? '', description: r.description, bao: r.bao_format ?? '', format: r.bao_label ?? '' };
  const cls = classifyAssayRoleScoped({ record, actionType: actionByAssay.get(id) || '' });
  const before = d152Roles.assays[id];
  return {
    assayId: id,
    d152Role: before?.role ?? null,
    d152Reason: before?.reason ?? null,
    newRole: cls.role,
    newReason: cls.reason,
    endpointTextRead: cls.evidence,
    speciesStated: cls.speciesStated,
    heterologousSystem: cls.heterologousSystem,
    chembl: {
      assayType: r.assay_type ?? null, assayOrganism: r.assay_organism ?? null, cellType: r.assay_cell_type ?? null,
      confidenceScore: r.confidence_score ?? null, documentChemblId: r.document_chembl_id ?? null,
      descriptionVerbatim: r.description,
    },
    rowsInCombinedSet: before?.rowsInCombinedSet ?? null,
    standardTypes: before?.standardTypes ?? null,
    interpretationChanged: cls.role !== (before?.role ?? null),
  };
});

const tally = {};
for (const a of perAssay) tally[a.newRole] = (tally[a.newRole] ?? 0) + 1;

// Counterfactual: what the functional arm WOULD hold if these were added. Reported, not adopted.
const newlyFunctional = new Set(perAssay.filter((a) => a.newRole === 'FUNCTIONAL_AGONISM').map((a) => a.assayId));
const addedPinRows = pin.rows.filter((r) => newlyFunctional.has(r.assayId));
const d152Functional = d152Roles.assays;
const functionalIds = new Set(Object.values(d152Functional).filter((x) => x.role === 'FUNCTIONAL_AGONISM').map((x) => x.assayId));
const baseFunctionalPinSmiles = new Set(pin.rows.filter((r) => functionalIds.has(r.assayId)).map((r) => r.canonicalSmiles));
const addedCompounds = new Set(addedPinRows.map((r) => r.canonicalSmiles));
const genuinelyNewCompounds = [...addedCompounds].filter((s) => !baseFunctionalPinSmiles.has(s));

const outcome = newlyFunctional.size > 0 ? 'INTERPRETATION_CHANGED' : 'NO_INTERPRETATION_CHANGE';

const sealed = {
  decisionId: 'D-157',
  preregFingerprint: canonicalHash(prereg).slice(0, 16),
  preregFrozenAtCommit: 'a229ad65',
  computedAt: new Date().toISOString(),
  rule: 'glp1rEndpointScope.mjs::classifyAssayRoleScoped, the D-152 rule, imported unchanged',
  d152ReferencedNotEdited: { sealed: 'glp1r-d152-endpoint-scope.sealed.json', roles: 'glp1r-assay-roles-d152.json' },
  sourceData: { dir: path.relative(ROOT, SRC) || SRC, gitRef: SRC_REF, chemblRelease: `${chemblStatus.chembl_db_version} (${chemblStatus.chembl_release_date})`, filesVerified: verified.length, allHashesMatched: true, files: verified },
  assays: perAssay,
  tally,
  outcome,
  counterfactualFunctionalArm: {
    status: 'REPORTED_NOT_ADOPTED',
    d152Arm: { rows: d152Sealed.summary?.FUNCTIONAL_AGONISM?.rows ?? 320, compounds: d152Sealed.summary?.FUNCTIONAL_AGONISM?.distinctCompounds ?? 206 },
    newlyFunctionalAssays: [...newlyFunctional].sort(),
    rowsThatWouldBeAdded: addedPinRows.length,
    compoundsThatWouldBeAddedThatAreNotAlreadyInTheArm: genuinelyNewCompounds.length,
    d153Status: 'D-153 stands exactly as sealed on the 320-row arm. Re-validating on an enlarged arm needs its own preregistered decision written before that run.',
  },
  boundary: prereg.boundary,
};
sealed.artifactHash = canonicalHash(sealed).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);

for (const a of perAssay) console.log(`${a.assayId.padEnd(14)} ${String(a.rowsInCombinedSet).padStart(3)} rows  ${a.d152Role}/${a.d152Reason}  ->  ${a.newRole}/${a.newReason}`);
console.log(`\ntally: ${JSON.stringify(tally)}`);
console.log(`OUTCOME: ${outcome}; counterfactual adds ${addedPinRows.length} rows, ${genuinelyNewCompounds.length} new compounds (not adopted)`);
console.log(`sealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash}), ${verified.length} files hash-verified`);
