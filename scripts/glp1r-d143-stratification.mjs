#!/usr/bin/env node
/**
 * D-143 — GLP-1R stratification + irreducible error floor.
 *
 * Runs the preregistration sealed in
 * `packages/backend/src/campaign/glp1r-d143-stratification-prereg.json`:
 * three arms (full control / small-molecule-only / peptide-only) through the
 * repo's OWN `trainAndValidate()` against the UNCHANGED frozen D-077 gate,
 * plus a separate replicate-spread measurement on the same pinned rows.
 *
 * Nothing here relaxes a threshold, drops a row or re-draws a split. Every
 * arm's numbers are printed, including the arms that fail — which, per the
 * preregistration's own decision rules, is a result and not a problem.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { loadGlp1rValidationGate, trainAndValidate } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREREG_PATH = path.join(HERE, '..', 'packages', 'backend', 'src', 'campaign', 'glp1r-d143-stratification-prereg.json');
const OUT_PATH = path.join(HERE, '..', 'packages', 'backend', 'src', 'campaign', 'glp1r-d143-stratification.sealed.json');
const AMIDE_SMARTS = '[NX3][CX3](=[OX1])';
const AMIDE_CUTOFF = 10;

const rd = rdkitDetect();
if (!rd.available) {
  console.error(`BLOCKED_BY_RUNTIME — no real RDKit in this runtime: ${rd.reason}`);
  process.exit(1);
}
console.log(`RDKit ${rd.version} (real engine)\n`);

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.id} fingerprint ${preregFingerprint}`);

const pin = loadGlp1rPin();
if (!pin.ok) { console.error(`pin not loadable: ${pin.code} ${pin.reason}`); process.exit(1); }
if (pin.contentSha256 !== prereg.dataset.sha256) {
  console.error(`pin sha256 ${pin.contentSha256} != preregistered ${prereg.dataset.sha256} — refusing to run against different data than was preregistered`);
  process.exit(1);
}
console.log(`pin verified: ${pin.rows.length} rows, sha256 ${pin.contentSha256}\n`);

const gateResult = loadGlp1rValidationGate();
if (!gateResult.ok) { console.error(`gate not loadable: ${gateResult.code}`); process.exit(1); }
const { gate, ruleFingerprint } = gateResult;
console.log(`gate ${ruleFingerprint} MIN_TRAIN=${gate.MIN_TRAIN} MIN_TEST=${gate.MIN_TEST} MAX_MAE=${gate.MAX_MAE} MIN_R2=${gate.MIN_R2}\n`);

// --- amide-bond counts, one RDKit process for all molecules -----------------
/** Counts the preregistered amide SMARTS per molecule. One python process, unique SMILES only; a molecule RDKit cannot parse comes back as null and is reported, never bucketed by guess. */
function amideCounts(smilesList) {
  const py = `
import sys, json
from rdkit import Chem
patt = Chem.MolFromSmarts(${JSON.stringify(AMIDE_SMARTS)})
out = []
for line in json.load(sys.stdin):
    m = Chem.MolFromSmiles(line)
    out.append(None if m is None else len(m.GetSubstructMatches(patt)))
print(json.dumps(out))
`;
  const stdout = execFileSync('python3', ['-c', py], { input: JSON.stringify(smilesList), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const uniqueSmiles = [...new Set(pin.rows.map((r) => r.canonicalSmiles))];
const countsBySmiles = new Map();
{
  const counts = amideCounts(uniqueSmiles);
  uniqueSmiles.forEach((s, i) => countsBySmiles.set(s, counts[i]));
}
const unparseable = [...countsBySmiles.values()].filter((c) => c === null).length;
if (unparseable > 0) { console.error(`${unparseable} molecule(s) unparseable by RDKit — refusing to bucket rows by a count that does not exist`); process.exit(1); }

// --- features, once, from the real batched RDKit path ------------------------
const batch = fingerprintBatch(pin.rows.map((r) => r.canonicalSmiles));
if (!batch?.ok || batch.results.length !== pin.rows.length) { console.error('fingerprintBatch did not come back aligned — failing closed'); process.exit(1); }
const withFeatures = [];
let unfingerprintable = 0;
pin.rows.forEach((row, i) => {
  const fp = batch.results[i];
  if (!fp?.ok || !Array.isArray(fp.bits)) { unfingerprintable += 1; return; }
  withFeatures.push({
    canonicalSmiles: row.canonicalSmiles,
    scaffold: fp.scaffold,
    bits: fp.bits,
    y: row.pActivity,
    amides: countsBySmiles.get(row.canonicalSmiles),
    standardType: row.standardType,
  });
});
console.log(`features: ${withFeatures.length} rows, ${unfingerprintable} unfingerprintable\n`);

const small = withFeatures.filter((r) => r.amides < AMIDE_CUTOFF);
const peptide = withFeatures.filter((r) => r.amides >= AMIDE_CUTOFF);
console.log(`partition at ${AMIDE_SMARTS} count >= ${AMIDE_CUTOFF}: SMALL_MOLECULE ${small.length} rows / ${new Set(small.map((r) => r.canonicalSmiles)).size} molecules, PEPTIDE_LIKE ${peptide.length} rows / ${new Set(peptide.map((r) => r.canonicalSmiles)).size} molecules\n`);

// --- the three arms ---------------------------------------------------------
const arms = [
  ['C-CONTROL-FULL', withFeatures],
  ['A-SMALL-MOLECULE-ONLY', small],
  ['B-PEPTIDE-ONLY', peptide],
];
const armResults = {};
for (const [id, rows] of arms) {
  const v = trainAndValidate(rows, gate, ruleFingerprint, pin.contentSha256, rd.version);
  armResults[id] = {
    nRows: rows.length,
    split: v.split,
    trainScaffoldCount: v.trainScaffoldCount ?? null,
    metrics: v.metrics ? { mae: Number(v.metrics.mae.toFixed(4)), rmse: Number(v.metrics.rmse.toFixed(4)), r2: Number(v.metrics.r2.toFixed(4)), n: v.metrics.n } : null,
    gateMet: v.ok,
    reasons: [...v.reasons],
  };
  const m = armResults[id].metrics;
  console.log(`${id}: ${rows.length} rows  split ${v.split.nTrain}/${v.split.nCalib}/${v.split.nTest}  ${m ? `MAE=${m.mae} RMSE=${m.rmse} R2=${m.r2}` : 'no metrics (could not attempt a fit)'}  ${v.ok ? 'GATE MET' : `BLOCKED: ${v.reasons.join('; ')}`}`);
}

// --- control check ----------------------------------------------------------
const c = armResults['C-CONTROL-FULL'];
const controlMatches = c.metrics?.mae === 1.1726 && c.metrics?.r2 === 0.482
  && c.split.nTrain === 178 && c.split.nCalib === 64 && c.split.nTest === 45;
console.log(`\ncontrol arm reproduces D-077a to the digit: ${controlMatches ? 'YES' : 'NO — the other arms are NOT interpretable'}`);

// --- irreducible error floor ------------------------------------------------
const groups = new Map();
for (const r of withFeatures) {
  const key = `${r.canonicalSmiles}|${r.standardType}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r.y);
}
const replicated = [...groups.values()].filter((ys) => ys.length >= 2);
const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const sd = (ys) => {
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return Math.sqrt(ys.reduce((a, y) => a + (y - mean) ** 2, 0) / (ys.length - 1));
};
const spreads = replicated.map((ys) => Math.max(...ys) - Math.min(...ys));
const sds = replicated.map(sd);
const floor = {
  groupingKey: 'canonicalSmiles + standardType',
  groupsTotal: groups.size,
  groupsWithReplicates: replicated.length,
  rowsCovered: replicated.reduce((a, ys) => a + ys.length, 0),
  medianSpread: median(spreads) === null ? null : Number(median(spreads).toFixed(4)),
  medianSd: median(sds) === null ? null : Number(median(sds).toFixed(4)),
  maxSpread: spreads.length ? Number(Math.max(...spreads).toFixed(4)) : null,
};
console.log(`\nirreducible error floor: ${floor.groupsWithReplicates}/${floor.groupsTotal} groups have replicates (${floor.rowsCovered} rows); median spread ${floor.medianSpread}, median SD ${floor.medianSd}, max spread ${floor.maxSpread} pActivity units`);
const floorVerdict = floor.medianSd === null
  ? 'NOT_MEASURABLE — no replicate groups'
  : (floor.medianSd >= gate.MAX_MAE
      ? `AT_OR_ABOVE_GATE — repeat measurements of the same molecule disagree by a median SD of ${floor.medianSd} pActivity units, >= MAX_MAE=${gate.MAX_MAE}: MAX_MAE cannot be met by any model on this data`
      : `BELOW_GATE — median replicate SD ${floor.medianSd} < MAX_MAE=${gate.MAX_MAE}, so the gate is not ruled out by label noise alone`);
console.log(`verdict: ${floorVerdict}`);

// --- seal -------------------------------------------------------------------
const sealed = {
  id: 'D-143-STRATIFICATION-AND-ERROR-FLOOR',
  kind: 'SEALED_MEASUREMENT',
  prereg: { id: prereg.id, fingerprint: preregFingerprint },
  gate: { ruleFingerprint, thresholds: { MIN_TRAIN: gate.MIN_TRAIN, MIN_TEST: gate.MIN_TEST, MAX_MAE: gate.MAX_MAE, MIN_R2: gate.MIN_R2 }, relaxed: false },
  dataset: { pinSha256: pin.contentSha256, rows: pin.rows.length, unfingerprintable },
  engine: { rdkit: rd.version },
  partition: { smarts: AMIDE_SMARTS, cutoff: AMIDE_CUTOFF, smallMoleculeRows: small.length, peptideRows: peptide.length, smallMoleculeMolecules: new Set(small.map((r) => r.canonicalSmiles)).size, peptideMolecules: new Set(peptide.map((r) => r.canonicalSmiles)).size },
  arms: armResults,
  controlReproducesD077a: controlMatches,
  irreducibleErrorFloor: { ...floor, verdict: floorVerdict },
  computedAt: new Date().toISOString(),
};
sealed.artifactHash = canonicalHash({ ...sealed, artifactHash: undefined });
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);
console.log(`\nsealed -> ${path.relative(path.join(HERE, '..'), OUT_PATH)}`);
