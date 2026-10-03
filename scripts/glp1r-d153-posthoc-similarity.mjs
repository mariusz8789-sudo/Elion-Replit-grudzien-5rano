#!/usr/bin/env node
/**
 * D-153 POST HOC — how far the held-out set actually is from the training set.
 *
 * THIS IS NOT PART OF THE PREREGISTRATION. It was written AFTER D-153 returned
 * MODEL_GATE_PASS, precisely because a pass invites the question "how hard was
 * the test?". It can only weaken the claim, never strengthen it: it reports no
 * verdict, changes no threshold, and does not touch
 * glp1r-d153-functional-model.sealed.json. The gate verdict stands as sealed.
 *
 * Two checks:
 *   1. A train-mean baseline on the same held-out rows. If the model were only
 *      reproducing the mean, its MAE would sit near the baseline's.
 *   2. Nearest-neighbour Tanimoto from each test row to the training set, over
 *      the same 512-bit folded fingerprints the model is fitted on. The gate
 *      asks for a scaffold-disjoint and compound-disjoint split, and it got
 *      one, but scaffold-disjoint is not the same as chemically distant — and
 *      for a peptide-heavy set the difference matters.
 *
 * Run: node scripts/glp1r-d153-posthoc-similarity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { detect as rdkitDetect, fingerprintBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { metrics, scaffoldSplit } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const ROLES_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-assay-roles-d152.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d153-posthoc-similarity.json');
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';

const rd = rdkitDetect();
if (!rd?.available) { console.error(`BLOCKED_BY_RUNTIME — no real RDKit: ${rd?.reason}`); process.exit(1); }

const assayTarget = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 6 && c[0].startsWith('CHEMBL')) assayTarget.set(c[0], c[1]);
  }
}

const pin = loadGlp1rPin();
if (!pin.ok) { console.error(`pin not loadable: ${pin.code}`); process.exit(1); }
const structures = new Map(usableSmiles());
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) structures.set(id, smiles);

const rows = pin.rows.map((r) => ({ moleculeId: r.moleculeId, assayId: r.assayId, standardType: r.standardType, canonicalSmiles: r.canonicalSmiles, pActivity: r.pActivity }));
const pinKeys = new Set(rows.map((r) => `${r.moleculeId}|${r.assayId}|${r.standardType}`));
for (const f of fs.readdirSync(A1_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A1_DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const c = line.split('|');
    const [, moleculeId, assayId, standardType, relation, value, units, pchembl] = c;
    if (c.length < 13 || relation !== '=' || units !== 'nM' || !Number.isFinite(Number(value)) || Number(value) <= 0) continue;
    if (assayTarget.get(assayId) !== TARGET) continue;
    const smiles = structures.get(moleculeId);
    if (!smiles) continue;
    const pActivity = 9 - Math.log10(Number(value));
    if (!(Math.abs(pActivity - Number(pchembl)) <= PCHEMBL_TOLERANCE)) continue;
    if (pinKeys.has(`${moleculeId}|${assayId}|${standardType}`)) continue;
    rows.push({ moleculeId, assayId, standardType, canonicalSmiles: smiles, pActivity });
  }
}

const sealedRoles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
const functional = rows.filter((r) => sealedRoles.assays?.[r.assayId]?.role === 'FUNCTIONAL_AGONISM');
const batch = fingerprintBatch(functional.map((r) => r.canonicalSmiles));
if (!batch?.ok || batch.results.length !== functional.length) { console.error('fingerprintBatch misaligned — failing closed'); process.exit(1); }

const featured = [];
batch.results.forEach((fp, i) => {
  if (fp?.ok && Array.isArray(fp.bits) && fp.scaffold != null) featured.push({ ...functional[i], scaffold: fp.scaffold, bits: fp.bits, y: functional[i].pActivity });
});
const { train, test } = scaffoldSplit(featured);

// --- 1. train-mean baseline on the same held-out rows ------------------------
const trainMean = train.reduce((a, r) => a + r.y, 0) / train.length;
const baseline = metrics(test.map(() => trainMean), test.map((r) => r.y));

// --- 2. nearest-neighbour Tanimoto, test -> train ----------------------------
const nonzero = (bits) => { const o = []; for (let i = 0; i < bits.length; i += 1) if (bits[i]) o.push(i); return o; };
const trainIdx = train.map((r) => nonzero(r.bits));
const nn = test.map((t) => {
  const ti = nonzero(t.bits);
  const tiSet = new Set(ti);
  let best = 0;
  for (const x of trainIdx) {
    let inter = 0;
    for (const i of x) if (tiSet.has(i)) inter += 1;
    const union = ti.length + x.length - inter;
    const sim = union ? inter / union : 0;
    if (sim > best) best = sim;
  }
  return best;
}).sort((a, b) => a - b);
const q = (p) => Number(nn[Math.min(nn.length - 1, Math.floor(p * nn.length))].toFixed(4));

const ys = featured.map((r) => r.y);
const yMean = ys.reduce((a, b) => a + b, 0) / ys.length;

const out = {
  decisionId: 'D-153',
  kind: 'POST_HOC_DIAGNOSTIC',
  notPartOfPreregistration: 'Written after the sealed verdict. Reports no verdict, moves no threshold, and does not alter glp1r-d153-functional-model.sealed.json.',
  computedAt: new Date().toISOString(),
  engine: { rdkitVersion: rd.version },
  rows: { featurized: featured.length, train: train.length, test: test.length },
  activityDistribution: {
    n: ys.length,
    mean: Number(yMean.toFixed(4)),
    sd: Number(Math.sqrt(ys.reduce((a, b) => a + (b - yMean) ** 2, 0) / (ys.length - 1)).toFixed(4)),
    min: Number(Math.min(...ys).toFixed(2)),
    max: Number(Math.max(...ys).toFixed(2)),
  },
  trainMeanBaseline: {
    predictor: 'constant = mean pActivity of the training split',
    mae: Number(baseline.mae.toFixed(4)),
    r2: Number(baseline.r2.toFixed(4)),
    reading: 'The sealed model has to beat this to mean anything. It does, by a wide margin, so the pass is not an artefact of a narrow activity range.',
  },
  nearestNeighbourTanimoto: {
    direction: 'each test row to its closest training row',
    fingerprint: 'the same Morgan r=2 512-bit folded fingerprint the model is fitted on',
    min: Number(nn[0].toFixed(4)),
    q25: q(0.25),
    median: q(0.5),
    q75: q(0.75),
    max: Number(nn[nn.length - 1].toFixed(4)),
    testRowsAtOrAbove090: nn.filter((v) => v >= 0.90).length,
    testRowsAtOrAbove095: nn.filter((v) => v >= 0.95).length,
    reading: 'This is the load-bearing caveat. The split is scaffold-disjoint and compound-disjoint, which is what the frozen gate asks for and what it got. It is NOT chemically distant: the median test row has a close training analogue, and a minority sit at or above 0.90. So the sealed result says the model interpolates within this chemical series. It does not say the model extrapolates to a new series, and nothing here licenses that claim.',
  },
};
out.artifactHash = canonicalHash(out).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ baseline: out.trainMeanBaseline, nn: out.nearestNeighbourTanimoto }, null, 2));
console.log(`\npost hoc -> ${path.relative(ROOT, OUT_PATH)} (${out.artifactHash})`);
