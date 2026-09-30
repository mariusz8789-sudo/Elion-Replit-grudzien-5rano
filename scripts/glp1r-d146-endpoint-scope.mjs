#!/usr/bin/env node
/**
 * D-146 — GLP-1R endpoint role diagnostic, signal terms scoped to the sentences
 * that say what was measured. Same data, same gate, same sufficiency criterion
 * as D-145; the ONLY difference is the scoping rule frozen in
 * campaign/glp1r-d146-endpoint-scope-prereg.json before this file existed.
 *
 * Answers one question: after honestly separating functional agonism from
 * binding affinity, does Genesis hold enough scientifically appropriate rows
 * to train a GLP-1R activity model under the EXISTING frozen gate?
 *
 * It classifies ASSAYS (never individual rows) from the transcribed ChEMBL
 * assay descriptions in data/transcription/glp1r-a3, counts what each role
 * holds, and seals the verdict. It trains nothing, changes no gate, and drops
 * no row for any reason not written in the preregistration.
 *
 * Rules: packages/backend/src/campaign/glp1r-d146-endpoint-scope-prereg.json
 * Run:   node scripts/glp1r-d145-endpoint-role.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { loadGlp1rValidationGate, scaffoldSplit } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';
import { classifyAssayRoleScoped } from '../packages/backend/src/campaign/glp1rEndpointScope.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d146-endpoint-scope-prereg.json');
const ROLES_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-assay-roles-d146.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d146-endpoint-scope.sealed.json');
const SCAFFOLD_PATH = path.join(ROOT, 'artifacts/glp1r-d146-scaffolds.json');
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
// The sufficiency criterion is deliberately NOT restated in D-146: it is read
// from D-145's frozen file so it cannot drift between the two passes.
const d145 = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/backend/src/campaign/glp1r-d145-endpoint-role-prereg.json'), 'utf8'));
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.decisionId} fingerprint ${preregFingerprint}`);

const pin = loadGlp1rPin();
if (!pin.ok) { console.error(`pin not loadable: ${pin.code}`); process.exit(1); }
const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) { console.error(`gate not loadable: ${gateResult.code}`); process.exit(1); }
const { gate, ruleFingerprint } = gateResult;
console.log(`pin ${pin.rows.length} rows, gate ${ruleFingerprint} (MIN_TRAIN=${gate.MIN_TRAIN}, MIN_TEST=${gate.MIN_TEST})\n`);

// --- A3: assay target, type and description, read from the transcription -----
const assay = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 6 && c[0].startsWith('CHEMBL')) {
      assay.set(c[0], { targetId: c[1], assayType: c[2], bao: c[3], format: c[4], description: c[5] });
    }
  }
}
console.log(`A3: ${assay.size} assay records with descriptions`);

// --- the D-144 combined set, rebuilt by the same admission rules -------------
const structures = new Map(usableSmiles());
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) structures.set(id, smiles);

const rows = pin.rows.map((r) => ({
  moleculeId: r.moleculeId,
  assayId: r.assayId,
  standardType: r.standardType,
  canonicalSmiles: r.canonicalSmiles,
  actionType: '',
  source: 'PIN',
}));
const pinKeys = new Set(rows.map((r) => `${r.moleculeId}|${r.assayId}|${r.standardType}`));

for (const f of fs.readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('|');
    const [, moleculeId, assayId, standardType, relation, value, units, pchembl, , , actionType] = c;
    if (c.length < 13 || relation !== '=' || units !== 'nM' || !Number.isFinite(Number(value)) || Number(value) <= 0) continue;
    if (!assay.has(assayId) || assay.get(assayId).targetId !== TARGET) continue;
    const smiles = structures.get(moleculeId);
    if (!smiles) continue;
    const pActivity = 9 - Math.log10(Number(value));
    if (!(Math.abs(pActivity - Number(pchembl)) <= PCHEMBL_TOLERANCE)) continue;
    if (pinKeys.has(`${moleculeId}|${assayId}|${standardType}`)) continue;
    rows.push({ moleculeId, assayId, standardType, canonicalSmiles: smiles, actionType: actionType || '', source: 'A1xA2' });
  }
}
console.log(`combined set: ${rows.length} rows (${rows.filter((r) => r.source === 'PIN').length} pin + ${rows.filter((r) => r.source === 'A1xA2').length} A1xA2)\n`);

// --- classify each distinct assay -------------------------------------------
const actionByAssay = new Map();
for (const r of rows) if (r.actionType) actionByAssay.set(r.assayId, r.actionType);

const assayIds = [...new Set(rows.map((r) => r.assayId))].sort();
const roles = {};
for (const id of assayIds) {
  const rec = assay.get(id) || null;
  roles[id] = {
    assayId: id,
    ...classifyAssayRoleScoped({ record: rec, actionType: actionByAssay.get(id) || '' }),
    rowsInCombinedSet: rows.filter((r) => r.assayId === id).length,
    standardTypes: [...new Set(rows.filter((r) => r.assayId === id).map((r) => r.standardType))].sort(),
  };
}

const byRole = (role) => rows.filter((r) => roles[r.assayId].role === role);
const summary = {};
for (const role of ['FUNCTIONAL_AGONISM', 'OTHER_FUNCTIONAL', 'BINDING_AFFINITY', 'UNKNOWN']) {
  const rs = byRole(role);
  summary[role] = {
    rows: rs.length,
    assays: assayIds.filter((a) => roles[a].role === role).length,
    distinctCompounds: new Set(rs.map((r) => r.canonicalSmiles)).size,
  };
  console.log(`${role.padEnd(20)} rows ${String(rs.length).padStart(4)}  assays ${String(summary[role].assays).padStart(3)}  compounds ${String(summary[role].distinctCompounds).padStart(4)}`);
}
const blocked = assayIds.filter((a) => roles[a].reason === 'BLOCKED_BY_DATA_ACCESS');
console.log(`\nassays with no description (BLOCKED_BY_DATA_ACCESS): ${blocked.length} of ${assayIds.length}`);

// --- scaffolds for the functional arm ---------------------------------------
// Computed by an external RDKit pass (scripts/glp1r-d145-scaffolds.py (with GLP1R_D146 paths)) so this
// runner stays free of a Python dependency. Missing file => NOT_COMPUTED.
const SMILES_PATH = path.join(ROOT, 'artifacts/glp1r-d146-functional-smiles.json');
fs.mkdirSync(path.dirname(SMILES_PATH), { recursive: true });
fs.writeFileSync(SMILES_PATH, `${JSON.stringify({ decisionId: 'D-146', functionalAgonismSmiles: [...new Set(byRole('FUNCTIONAL_AGONISM').map((r) => r.canonicalSmiles))].sort() }, null, 2)}\n`);

let scaffolds = { status: 'NOT_COMPUTED', note: `run scripts/glp1r-d145-scaffolds.py (with GLP1R_D146 paths) first (expected at ${path.relative(ROOT, SCAFFOLD_PATH)})` };
if (fs.existsSync(SCAFFOLD_PATH)) scaffolds = JSON.parse(fs.readFileSync(SCAFFOLD_PATH, 'utf8'));

// --- can the PRODUCTION scaffold split actually fill train and test? ---------
// The criterion asks whether a scaffold-disjoint split places >= MIN_TRAIN in
// train and >= MIN_TEST in test. That is answered with the real adapter and the
// real scaffoldSplit, not with an estimate.
let splitFeasibility;
const rd = rdkitDetect();
if (!rd.available) {
  splitFeasibility = { status: 'BLOCKED_BY_RUNTIME', reason: rd.reason };
} else {
  const functional = byRole('FUNCTIONAL_AGONISM');
  const fp = fingerprintBatch(functional.map((r) => r.canonicalSmiles));
  if (!fp.ok) { console.error(`fingerprintBatch failed: ${fp.error}`); process.exit(1); }
  const withScaffold = [];
  let failed = 0;
  fp.results.forEach((r, i) => { if (r && r.ok !== false && r.scaffold != null) withScaffold.push({ ...functional[i], scaffold: r.scaffold }); else failed += 1; });
  const split = scaffoldSplit(withScaffold);
  splitFeasibility = {
    status: 'OK',
    rdkitVersion: rd.version,
    method: 'production scaffoldSplit() over production rdkitAdapter scaffolds — buckets 0-1 test, 2-3 calibration, 4-9 train',
    rowsFingerprinted: withScaffold.length,
    fingerprintFailures: failed,
    train: split.train.length,
    calibration: split.calib.length,
    test: split.test.length,
    trainMeetsMin: split.train.length >= gate.MIN_TRAIN,
    testMeetsMin: split.test.length >= gate.MIN_TEST,
    distinctScaffolds: new Set(withScaffold.map((r) => r.scaffold)).size,
  };
  console.log(`\nproduction scaffold split of the functional arm: train ${split.train.length} (min ${gate.MIN_TRAIN}), calib ${split.calib.length}, test ${split.test.length} (min ${gate.MIN_TEST})`);
}

// --- verdict ----------------------------------------------------------------
const fa = summary.FUNCTIONAL_AGONISM;
const minRows = gate.MIN_TRAIN + gate.MIN_TEST;
const enoughRows = fa.rows >= minRows;
const enoughScaffolds = scaffolds.status === 'OK' ? scaffolds.distinctScaffolds >= d145.sufficiencyCriterion.requires.minimumScaffoldsForDisjointSplit : null;
const splitOk = splitFeasibility.status === 'OK' ? (splitFeasibility.trainMeetsMin && splitFeasibility.testMeetsMin) : null;
const verdict = enoughRows && enoughScaffolds === true && splitOk === true ? 'SUFFICIENT' : 'INSUFFICIENT_FUNCTIONAL_DATA';
const shortfall = Math.max(0, minRows - fa.rows);

console.log(`\nverdict: ${verdict}`);
console.log(`functional-agonism rows ${fa.rows} vs required ${minRows} (MIN_TRAIN ${gate.MIN_TRAIN} + MIN_TEST ${gate.MIN_TEST}) — shortfall ${shortfall}`);

const sealed = {
  decisionId: 'D-146',
  preregFingerprint,
  gateRuleFingerprint: ruleFingerprint,
  gateUnchanged: true,
  baseCommit: prereg.baseCommit,
  ruleFrozenAtCommit: 'c4d6a96',
  sufficiencyCriterionFrom: 'D-145 (unchanged)',
  computedAt: new Date().toISOString(),
  combinedSet: { rows: rows.length, pin: rows.filter((r) => r.source === 'PIN').length, a1xa2: rows.filter((r) => r.source === 'A1xA2').length },
  assays: { total: assayIds.length, withDescription: assayIds.length - blocked.length, blockedByDataAccess: blocked },
  summary,
  scaffolds,
  splitFeasibility,
  sufficiency: { requiredRows: minRows, functionalRows: fa.rows, shortfall, enoughRows, enoughScaffolds, splitOk, verdict },
  supersedesNothing: 'D-145 stands unedited; this is a second pass reported alongside it.',
  boundary: 'Row counts only. No model was trained, no gate was read for pass/fail, no candidate was ranked. Every assay in this set is a recombinant heterologous expression system and is not evidence of native human tissue pharmacology.',
};
sealed.artifactHash = canonicalHash(sealed);

fs.writeFileSync(ROLES_PATH, `${JSON.stringify({ decisionId: 'D-146', preregFingerprint, source: 'data/transcription/glp1r-a3', assays: roles }, null, 2)}\n`);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`\nsealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash.slice(0, 16)})`);
console.log(`roles  -> ${path.relative(ROOT, ROLES_PATH)}`);
