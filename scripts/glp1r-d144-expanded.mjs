#!/usr/bin/env node
/**
 * D-144 — the GLP-1R activity set the QSAR never used.
 *
 * Runs the preregistration sealed in
 * `packages/backend/src/campaign/glp1r-d144-expanded-prereg.json`: join the
 * custody-verified A1 activity rows to custody-verified A2/pin structures,
 * combine with the frozen D-077 pin, and put four arms through the repo's own
 * `trainAndValidate()` against the UNCHANGED frozen gate.
 *
 * CUSTODY IS THE POINT. A structure enters only through
 * `d105-a2-custody.mjs::usableSmiles()` (chunk-level verified A2 + the frozen
 * pin) or `d108-per-row-custody.mjs::rawVerifiedRows()` (a row whose own
 * received bytes hash to the supplier's declared value for that row). No failed
 * chunk is partially rescued, no quarantined channel-corrected row is admitted,
 * and no SMILES is repaired, preferred for length, or adopted for parsing —
 * that directory's README documents exactly why each of those would be wrong.
 *
 * Nothing here relaxes a threshold, rewrites the pin, or emits a prediction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { loadGlp1rValidationGate, trainAndValidate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d144-expanded-prereg.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d144-expanded.sealed.json');
const AMIDE_SMARTS = '[NX3][CX3](=[OX1])';
const AMIDE_CUTOFF = 10;
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';

const rd = rdkitDetect();
if (!rd.available) { console.error(`BLOCKED_BY_RUNTIME — no real RDKit: ${rd.reason}`); process.exit(1); }
console.log(`RDKit ${rd.version} (real engine)\n`);

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.id} fingerprint ${preregFingerprint}`);

const pin = loadGlp1rPin();
if (!pin.ok) { console.error(`pin not loadable: ${pin.code}`); process.exit(1); }
if (pin.contentSha256 !== prereg.sources.pin.sha256) { console.error('pin sha256 differs from the preregistered value — refusing to run'); process.exit(1); }
const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) { console.error(`gate not loadable: ${gateResult.code}`); process.exit(1); }
const { gate, ruleFingerprint } = gateResult;
console.log(`pin ${pin.rows.length} rows, gate ${ruleFingerprint} (MAX_MAE=${gate.MAX_MAE}, MIN_TRAIN=${gate.MIN_TRAIN}, MIN_TEST=${gate.MIN_TEST}, MIN_R2=${gate.MIN_R2})\n`);

// --- A3: the target, read from the data rather than assumed ------------------
const assayTarget = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length > 2 && c[0]) assayTarget.set(c[0], c[1]);
  }
}

// --- custody-verified structures --------------------------------------------
const structures = new Map(usableSmiles());
let viaPerRow = 0;
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) { structures.set(id, smiles); viaPerRow += 1; }
console.log(`custody-verified structures: ${structures.size} (${viaPerRow} admitted only via per-row hashes)`);

// --- A1 rows, filtered by the preregistered rules ----------------------------
const drop = { targetNotGlp1r: 0, assayNotInA3: 0, noVerifiedStructure: 0, pchemblMismatch: 0, alreadyInPin: 0, shape: 0 };
const pinKeys = new Set(pin.rows.map((r) => `${r.moleculeId}|${r.assayId}|${r.standardType}`));
const newRows = [];
let a1Total = 0;
for (const f of fs.readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('|');
    a1Total += 1;
    const [, moleculeId, assayId, standardType, relation, value, units, pchembl] = c;
    if (c.length < 13 || relation !== '=' || units !== 'nM' || !Number.isFinite(Number(value)) || Number(value) <= 0) { drop.shape += 1; continue; }
    if (!assayTarget.has(assayId)) { drop.assayNotInA3 += 1; continue; }
    if (assayTarget.get(assayId) !== TARGET) { drop.targetNotGlp1r += 1; continue; }
    const smiles = structures.get(moleculeId);
    if (!smiles) { drop.noVerifiedStructure += 1; continue; }
    const pActivity = 9 - Math.log10(Number(value));
    if (!(Math.abs(pActivity - Number(pchembl)) <= PCHEMBL_TOLERANCE)) { drop.pchemblMismatch += 1; continue; }
    if (pinKeys.has(`${moleculeId}|${assayId}|${standardType}`)) { drop.alreadyInPin += 1; continue; }
    newRows.push({ moleculeId, assayId, standardType, canonicalSmiles: smiles, pActivity, source: 'A1xA2' });
  }
}
console.log(`A1: ${a1Total} rows read, ${newRows.length} admitted; dropped ${JSON.stringify(drop)}\n`);

// --- features ---------------------------------------------------------------
const allRows = [
  ...pin.rows.map((r) => ({ moleculeId: r.moleculeId, canonicalSmiles: r.canonicalSmiles, pActivity: r.pActivity, source: 'PIN' })),
  ...newRows,
];
const uniqueSmiles = [...new Set(allRows.map((r) => r.canonicalSmiles))];

/** Amide count per unique structure, one RDKit process. A molecule RDKit cannot parse comes back null and is reported, never bucketed by guess. */
const py = `
import sys, json
from rdkit import Chem
patt = Chem.MolFromSmarts(${JSON.stringify(AMIDE_SMARTS)})
out = {}
for s in json.load(sys.stdin):
    m = Chem.MolFromSmiles(s)
    out[s] = None if m is None else len(m.GetSubstructMatches(patt))
print(json.dumps(out))
`;
const amideBySmiles = JSON.parse(execFileSync('python3', ['-c', py], { input: JSON.stringify(uniqueSmiles), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
const unparseable = uniqueSmiles.filter((s) => amideBySmiles[s] === null);
if (unparseable.length > 0) { console.error(`${unparseable.length} structure(s) unparseable by RDKit — refusing to bucket rows by a count that does not exist`); process.exit(1); }

const batch = fingerprintBatch(allRows.map((r) => r.canonicalSmiles));
if (!batch?.ok || batch.results.length !== allRows.length) { console.error('fingerprintBatch did not come back aligned — failing closed'); process.exit(1); }
const withFeatures = [];
let unfingerprintable = 0;
allRows.forEach((row, i) => {
  const fp = batch.results[i];
  if (!fp?.ok || !Array.isArray(fp.bits)) { unfingerprintable += 1; return; }
  withFeatures.push({
    canonicalSmiles: row.canonicalSmiles, scaffold: fp.scaffold, bits: fp.bits, y: row.pActivity,
    amides: amideBySmiles[row.canonicalSmiles], moleculeId: row.moleculeId, source: row.source,
  });
});
console.log(`features: ${withFeatures.length} rows (${withFeatures.filter((r) => r.source === 'PIN').length} pin + ${withFeatures.filter((r) => r.source !== 'PIN').length} new), ${unfingerprintable} unfingerprintable\n`);

// --- the four arms ----------------------------------------------------------
const pinOnly = withFeatures.filter((r) => r.source === 'PIN');
const small = withFeatures.filter((r) => r.amides < AMIDE_CUTOFF);
const peptide = withFeatures.filter((r) => r.amides >= AMIDE_CUTOFF);
const armResults = {};
for (const [id, rows] of [['G-CONTROL-PIN', pinOnly], ['H-COMBINED-ALL', withFeatures], ['I-COMBINED-SMALL', small], ['J-COMBINED-PEPTIDE', peptide]]) {
  const v = trainAndValidate(rows, gate, ruleFingerprint, pin.contentSha256, rd.version);
  const shortBy = Math.max(0, gate.MIN_TRAIN - v.split.nTrain);
  armResults[id] = {
    nRows: rows.length,
    nMolecules: new Set(rows.map((r) => r.moleculeId)).size,
    split: v.split,
    trainingRowsShortOfMinTrain: shortBy,
    trainScaffoldCount: v.trainScaffoldCount ?? null,
    metrics: v.metrics ? { mae: Number(v.metrics.mae.toFixed(4)), rmse: Number(v.metrics.rmse.toFixed(4)), r2: Number(v.metrics.r2.toFixed(4)), n: v.metrics.n } : null,
    gateMet: v.ok,
    reasons: [...v.reasons],
  };
  const m = armResults[id].metrics;
  console.log(`${id}: ${rows.length} rows  split ${v.split.nTrain}/${v.split.nCalib}/${v.split.nTest}  ${m ? `MAE=${m.mae} RMSE=${m.rmse} R2=${m.r2}` : 'no metrics'}  ${v.ok ? 'GATE MET' : `BLOCKED: ${v.reasons.join('; ')}`}${shortBy ? `  [${shortBy} training rows short of MIN_TRAIN]` : ''}`);
}

const g = armResults['G-CONTROL-PIN'];
const controlMatches = g.metrics?.mae === 1.1726 && g.metrics?.r2 === 0.482 && g.split.nTrain === 178 && g.split.nCalib === 64 && g.split.nTest === 45;
console.log(`\ncontrol arm reproduces D-077a to the digit: ${controlMatches ? 'YES' : 'NO — the other arms are NOT interpretable'}`);

const sealed = {
  id: 'D-144-EXPANDED-CUSTODY-VERIFIED-SET',
  kind: 'SEALED_MEASUREMENT',
  prereg: { id: prereg.id, fingerprint: preregFingerprint },
  gate: { ruleFingerprint, thresholds: { MIN_TRAIN: gate.MIN_TRAIN, MIN_TEST: gate.MIN_TEST, MAX_MAE: gate.MAX_MAE, MIN_R2: gate.MIN_R2 }, relaxed: false },
  sources: {
    pinSha256: pin.contentSha256,
    pinRows: pin.rows.length,
    a1RowsRead: a1Total,
    a1RowsAdmitted: newRows.length,
    a1Drops: drop,
    custodyVerifiedStructures: structures.size,
    structuresViaPerRowHashOnly: viaPerRow,
    a3AssaysAllGlp1r: true,
  },
  engine: { rdkit: rd.version },
  partition: { smarts: AMIDE_SMARTS, cutoff: AMIDE_CUTOFF, smallMoleculeRows: small.length, peptideRows: peptide.length },
  arms: armResults,
  controlReproducesD077a: controlMatches,
  pinUnchanged: true,
  computedAt: new Date().toISOString(),
};
sealed.artifactHash = canonicalHash({ ...sealed, artifactHash: undefined });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`\nsealed -> ${path.relative(ROOT, OUT_PATH)}`);
