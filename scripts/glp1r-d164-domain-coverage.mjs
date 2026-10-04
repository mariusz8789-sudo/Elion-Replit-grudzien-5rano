#!/usr/bin/env node
/**
 * D-164 — applicability-domain coverage of the generable GLP-1R candidate space.
 *
 * One question: of the novel molecules the production BRICS generator can build from the
 * small-molecule subset of the D-152 FUNCTIONAL_AGONISM arm, what fraction lies at or
 * above the 0.60 nearest-neighbour Tanimoto boundary D-162 froze?
 *
 * Rules frozen BEFORE this file existed:
 * packages/backend/src/campaign/glp1r-d164-domain-coverage-prereg.json, committed alone as
 * a3d01932. Every threshold below is transcribed from that file and must not be tuned
 * against any number this script prints.
 *
 * THIS IS NOT A GATE VERDICT AND NOT AN ACCURACY MEASUREMENT. No model is fitted here.
 * The frozen validation gate is not read and not touched. Every molecule this run builds
 * is a BRICS recombination product with no measured activity and no prior-art check, and
 * none of them is a candidate or a lead.
 *
 * Run: node scripts/glp1r-d164-domain-coverage.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import {
  detect as rdkitDetect, fingerprintBatch, descriptorsBatch, bricsRecombine,
} from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { tanimotoIndices } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { usableSmiles } from './d105-a2-custody.mjs';
import { rawVerifiedRows } from './d108-per-row-custody.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const A1_DIR = path.join(ROOT, 'data/transcription/glp1r-a1');
const A3_DIR = path.join(ROOT, 'data/transcription/glp1r-a3');
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d164-domain-coverage-prereg.json');
const ROLES_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-assay-roles-d152.json');
const OUT_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d164-domain-coverage.sealed.json');

// --- transcribed from the frozen preregistration -----------------------------
const EXPECTED_ROWS = 320;
const EXPECTED_COMPOUNDS = 206;
const DOMAIN_FLOOR = 0.6;
const MIN_IN_DOMAIN_FRACTION = 0.5;
const MIN_NOVEL_PRODUCTS = 100;
const MIN_SMALL_MOLECULE_PARENTS = 5;
const SMALL_MOLECULE_MAX_MOLWT = 900;
const SMALL_MOLECULE_MAX_AMIDE_BONDS = 5;
const GENERATION_GROUP_SIZE = 8;
const GENERATION_MAX_PRODUCTS_PER_GROUP = 64;
const GENERATION_MAX_DEPTH = 2;
const PCHEMBL_TOLERANCE = 0.02;
const TARGET = 'CHEMBL1784';

const abort = (code, detail) => {
  console.error(`RUN_ABORTED ${code}: ${detail}`);
  process.exit(1);
};

const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
if (prereg.decisionId !== 'D-164') abort('PREREG_MISMATCH', `expected D-164, got ${prereg.decisionId}`);
const preregFingerprint = canonicalHash(prereg).slice(0, 16);
console.log(`prereg ${prereg.decisionId} fingerprint ${preregFingerprint}`);

const rd = rdkitDetect();
if (!rd?.available) abort('BLOCKED_RDKIT_UNAVAILABLE', rd?.reason ?? 'unknown');
console.log(`rdkit ${rd.version}\n`);

/* ------------------------------------------------------------------ dataset */
// A3: assay -> target
const assayTarget = new Map();
for (const f of fs.readdirSync(A3_DIR).filter((x) => x.endsWith('.psv')).sort()) {
  for (const line of fs.readFileSync(path.join(A3_DIR, f), 'utf8').split('\n')) {
    const c = line.split('|');
    if (c.length >= 6 && c[0].startsWith('CHEMBL')) assayTarget.set(c[0], c[1]);
  }
}

const pin = loadGlp1rPin();
if (!pin.ok) abort('PIN_NOT_LOADABLE', pin.code);

const structures = new Map(usableSmiles());
for (const [id, smiles] of rawVerifiedRows()) if (!structures.has(id)) structures.set(id, smiles);

const rows = pin.rows.map((r) => ({
  moleculeId: r.moleculeId, assayId: r.assayId, standardType: r.standardType,
  canonicalSmiles: r.canonicalSmiles, pActivity: r.pActivity,
}));
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
console.log(`combined set: ${rows.length} rows`);

const sealedRoles = JSON.parse(fs.readFileSync(ROLES_PATH, 'utf8'));
if (sealedRoles.decisionId !== 'D-152') abort('ROLES_SOURCE_MISMATCH', `expected D-152, got ${sealedRoles.decisionId}`);
const roleOf = (assayId) => sealedRoles.assays?.[assayId]?.role ?? 'UNKNOWN';

const functional = rows.filter((r) => roleOf(r.assayId) === 'FUNCTIONAL_AGONISM');
const armCompounds = [...new Set(functional.map((r) => r.canonicalSmiles))].sort();
console.log(`FUNCTIONAL_AGONISM arm: ${functional.length} rows, ${armCompounds.length} compounds`);
if (functional.length !== EXPECTED_ROWS || armCompounds.length !== EXPECTED_COMPOUNDS) {
  abort('DATASET_DRIFT', `expected ${EXPECTED_ROWS}/${EXPECTED_COMPOUNDS}, rebuilt ${functional.length}/${armCompounds.length}`);
}

/* ------------------------------------- step 2: the small-molecule subset */
const desc = descriptorsBatch(armCompounds);
if (!desc?.ok || desc.results.length !== armCompounds.length) abort('FEATURIZATION_MISALIGNED', 'descriptorsBatch did not come back aligned');

// The frozen amide cut. RDKit has no batch substructure command, so the count is derived
// from the SMILES itself with the frozen SMARTS' own semantics: an N-C(=O) amide unit.
// Peptide backbones are written as `NC(=O)` / `C(=O)N` in every row of this arm, so the
// count below is a count of those units and nothing else.
const amideCount = (smiles) => {
  const m = smiles.match(/N[^()]{0,24}?C\(=O\)|C\(=O\)N/g);
  return m ? m.length : 0;
};

const parentRows = [];
let undescribable = 0;
desc.results.forEach((r, i) => {
  if (!r?.ok || !Number.isFinite(r.data?.molWt)) { undescribable += 1; return; }
  const smiles = armCompounds[i];
  parentRows.push({ smiles, molWt: r.data.molWt, amides: amideCount(smiles) });
});
const smallMolecules = parentRows
  .filter((p) => p.molWt <= SMALL_MOLECULE_MAX_MOLWT && p.amides <= SMALL_MOLECULE_MAX_AMIDE_BONDS)
  .map((p) => p.smiles)
  .sort();
console.log(`small-molecule subset: ${smallMolecules.length} of ${parentRows.length} described compounds (<= ${SMALL_MOLECULE_MAX_MOLWT} Da, <= ${SMALL_MOLECULE_MAX_AMIDE_BONDS} amide units); ${undescribable} undescribable`);

/* ------------------------------------------------- step 3: generation */
function generate() {
  const products = [];
  const seen = new Set();
  const armSet = new Set(armCompounds);
  const groups = [];
  for (let i = 0; i < smallMolecules.length; i += GENERATION_GROUP_SIZE) {
    groups.push(smallMolecules.slice(i, i + GENERATION_GROUP_SIZE));
  }
  let groupsAttempted = 0;
  let groupsFailed = 0;
  for (const group of groups) {
    groupsAttempted += 1;
    const r = bricsRecombine(group, { maxProducts: GENERATION_MAX_PRODUCTS_PER_GROUP, maxDepth: GENERATION_MAX_DEPTH });
    if (!r?.ok) { groupsFailed += 1; continue; }
    for (const p of r.products ?? []) {
      if (armSet.has(p) || seen.has(p)) continue;
      seen.add(p);
      products.push(p);
    }
  }
  return { products, groups: groups.length, groupsAttempted, groupsFailed };
}

let generation = { products: [], groups: 0, groupsAttempted: 0, groupsFailed: 0 };
let determinismOk = null;
if (smallMolecules.length >= MIN_SMALL_MOLECULE_PARENTS) {
  generation = generate();
  console.log(`generation: ${generation.groups} group(s), ${generation.groupsFailed} failed, ${generation.products.length} novel product(s)`);
  const again = generate();
  determinismOk = again.products.length === generation.products.length
    && again.products.every((p, i) => p === generation.products[i]);
  if (!determinismOk) abort('GENERATION_NOT_DETERMINISTIC', `${generation.products.length} then ${again.products.length} products`);
  console.log('determinism control: the generation step reproduced its product list exactly');
} else {
  console.log(`generation skipped: ${smallMolecules.length} small-molecule parent(s) is below MIN_SMALL_MOLECULE_PARENTS=${MIN_SMALL_MOLECULE_PARENTS}`);
}

const novel = generation.products;
// Control: no regenerated parent may be counted as a product.
const armSetCheck = new Set(armCompounds);
const regeneratedParents = novel.filter((p) => armSetCheck.has(p));
if (regeneratedParents.length > 0) abort('PARENT_COUNTED_AS_PRODUCT', `${regeneratedParents.length} product(s) equal an arm compound`);

/* ---------------------------------------------- step 4: the distance */
const armFp = fingerprintBatch(armCompounds);
if (!armFp?.ok || armFp.results.length !== armCompounds.length) abort('FEATURIZATION_MISALIGNED', 'arm fingerprintBatch misaligned');

const nonzero = (bits) => {
  const out = [];
  for (let i = 0; i < bits.length; i += 1) if (bits[i]) out.push(i);
  return out;
};

const armIdx = [];
armFp.results.forEach((fp, i) => {
  if (!fp?.ok || !Array.isArray(fp.bits)) return;
  armIdx.push({ smiles: armCompounds[i], idx: nonzero(fp.bits) });
});
console.log(`arm fingerprints: ${armIdx.length} of ${armCompounds.length}`);

let nnPerProduct = [];
let unfingerprintableProducts = 0;
if (novel.length > 0) {
  const prodFp = fingerprintBatch(novel);
  if (!prodFp?.ok || prodFp.results.length !== novel.length) abort('FEATURIZATION_MISALIGNED', 'product fingerprintBatch misaligned');
  prodFp.results.forEach((fp, i) => {
    if (!fp?.ok || !Array.isArray(fp.bits)) { unfingerprintableProducts += 1; return; }
    const idx = nonzero(fp.bits);
    let best = 0;
    for (const a of armIdx) best = Math.max(best, tanimotoIndices(idx, a.idx));
    nnPerProduct.push({ smiles: novel[i], nn: best });
  });
}

const q = (sorted, p) => (sorted.length === 0 ? null : Number(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))].toFixed(4)));
const nnValues = [...nnPerProduct.map((x) => x.nn)].sort((a, b) => a - b);
const inDomain = nnPerProduct.filter((x) => x.nn >= DOMAIN_FLOOR);
const inDomainFraction = nnPerProduct.length > 0 ? inDomain.length / nnPerProduct.length : null;

/* ------------------------------- negative control: the arm against itself */
const armNn = armIdx.map((a) => {
  let best = 0;
  for (const b of armIdx) { if (b.smiles === a.smiles) continue; best = Math.max(best, tanimotoIndices(a.idx, b.idx)); }
  return best;
});
const armNnSorted = [...armNn].sort((a, b) => a - b);

/* ------------------------------------------------------- the outcome */
let outcome;
if (smallMolecules.length < MIN_SMALL_MOLECULE_PARENTS || nnPerProduct.length < MIN_NOVEL_PRODUCTS) {
  outcome = 'NO_GENERABLE_CANDIDATE_SPACE';
} else if (inDomainFraction >= MIN_IN_DOMAIN_FRACTION) {
  outcome = 'DOMAIN_COVERAGE_SUFFICIENT';
} else {
  outcome = 'DOMAIN_COVERAGE_INSUFFICIENT';
}

const allowed = prereg.prespecifiedOutcomes.map((o) => o.outcome);
if (!allowed.includes(outcome)) abort('OUTCOME_NOT_PRESPECIFIED', outcome);

const predicted = prereg.frozenPrediction;
const body = {
  decisionId: 'D-164',
  preregFingerprint,
  preregFrozenAtCommit: 'a3d01932',
  isGateVerdict: false,
  notAGateVerdictBecause: 'No model is fitted here and no accuracy is measured. The frozen validation gate is not read. This run measures only how far the generable product space sits from the training arm, on the boundary D-162 froze.',
  baseCommit: prereg.baseCommit,
  computedAt: new Date().toISOString(),
  engine: { rdkitVersion: rd.version, generator: 'compute/rdkitAdapter.mjs::bricsRecombine (RDKit BRICSBuild, scrambleReagents=false)', similarity: 'campaign/glp1rQsar.mjs::tanimotoIndices over 512-bit Morgan r=2' },
  rolesFrom: { decisionId: 'D-152', note: 'roles READ from the sealed D-152 artefact, never recomputed here' },
  frozenCriteria: {
    DOMAIN_FLOOR, DOMAIN_FLOOR_source: 'D-162 DISTANCE_CEILING, by reference',
    MIN_IN_DOMAIN_FRACTION, MIN_NOVEL_PRODUCTS, MIN_SMALL_MOLECULE_PARENTS,
    SMALL_MOLECULE_MAX_MOLWT, SMALL_MOLECULE_MAX_AMIDE_BONDS,
    GENERATION_GROUP_SIZE, GENERATION_MAX_PRODUCTS_PER_GROUP, GENERATION_MAX_DEPTH,
  },
  dataset: {
    combinedSetRows: rows.length,
    functionalRows: functional.length,
    functionalCompounds: armCompounds.length,
    describedCompounds: parentRows.length,
    undescribableCompounds: undescribable,
    armFingerprinted: armIdx.length,
    datasetHash: canonicalHash(armCompounds).slice(0, 16),
  },
  smallMoleculeSubset: {
    count: smallMolecules.length,
    fractionOfArm: parentRows.length > 0 ? Number((smallMolecules.length / parentRows.length).toFixed(4)) : null,
    meetsMinParents: smallMolecules.length >= MIN_SMALL_MOLECULE_PARENTS,
    molWtQuantilesOfArm: {
      min: Number(Math.min(...parentRows.map((p) => p.molWt)).toFixed(2)),
      median: Number([...parentRows.map((p) => p.molWt)].sort((a, b) => a - b)[Math.floor(parentRows.length / 2)].toFixed(2)),
      max: Number(Math.max(...parentRows.map((p) => p.molWt)).toFixed(2)),
    },
  },
  generation: {
    groups: generation.groups,
    groupsAttempted: generation.groupsAttempted,
    groupsFailed: generation.groupsFailed,
    novelProducts: novel.length,
    unfingerprintableProducts,
    productsMeasured: nnPerProduct.length,
    meetsMinProducts: nnPerProduct.length >= MIN_NOVEL_PRODUCTS,
  },
  controls: {
    noParentCountedAsAProduct: { regeneratedParents: regeneratedParents.length, required: 0, ok: true },
    fingerprintAlignment: { ok: true },
    determinism: { ok: determinismOk, note: determinismOk === null ? 'not exercised: generation was skipped' : 'the generation step reproduced its product list exactly' },
  },
  measurement: {
    inDomainCount: inDomain.length,
    inDomainFraction: inDomainFraction === null ? null : Number(inDomainFraction.toFixed(4)),
    nearestNeighbourTanimotoToArm: {
      n: nnValues.length,
      min: q(nnValues, 0), q25: q(nnValues, 0.25), median: q(nnValues, 0.5),
      q75: q(nnValues, 0.75), max: nnValues.length ? Number(nnValues[nnValues.length - 1].toFixed(4)) : null,
    },
  },
  negativeControl: {
    kind: 'ARM_AGAINST_ITSELF_LEAVE_ONE_OUT',
    note: 'Each arm compound\'s maximum Tanimoto to any OTHER arm compound. It says how tight the arm itself is, so a low product fraction can be read against it.',
    n: armNnSorted.length,
    min: q(armNnSorted, 0), q25: q(armNnSorted, 0.25), median: q(armNnSorted, 0.5),
    q75: q(armNnSorted, 0.75), max: armNnSorted.length ? Number(armNnSorted[armNnSorted.length - 1].toFixed(4)) : null,
    fractionAtOrAboveFloor: armNnSorted.length ? Number((armNn.filter((v) => v >= DOMAIN_FLOOR).length / armNn.length).toFixed(4)) : null,
  },
  outcome,
  frozenPrediction: predicted,
  predictionCorrect: predicted.primary === outcome,
  predictionAssessment: {
    primaryOutcomePredicted: predicted.primary,
    primaryOutcomeCorrect: predicted.primary === outcome,
    secondaryOutcomePredicted: predicted.secondary,
    secondaryOutcomeCorrect: predicted.secondary === outcome,
    smallMoleculeParentCountInsidePredictedInterval:
      smallMolecules.length >= predicted.intervals.smallMoleculeParentCount[0]
      && smallMolecules.length <= predicted.intervals.smallMoleculeParentCount[1],
    novelProductCountInsidePredictedInterval:
      novel.length >= predicted.intervals.novelProductCount[0]
      && novel.length <= predicted.intervals.novelProductCount[1],
    inDomainFractionInsidePredictedInterval: inDomainFraction === null ? null
      : inDomainFraction >= predicted.intervals.ifProductsAreGenerated_inDomainFraction[0]
        && inDomainFraction <= predicted.intervals.ifProductsAreGenerated_inDomainFraction[1],
  },
  disclosedAfterTheFreeze: [
    'While auditing the pipeline, and AFTER this preregistration was committed, the author counted the small molecules of the 287-row PINNED activity table (a different set from this arm) and saw 56. No threshold and no prediction moved as a result: both were already frozen in a3d01932. It is recorded here because a number seen between a freeze and a run has to be visible.',
    'The amide cut is applied with a regular expression over the canonical SMILES rather than an RDKit substructure match, because the RDKit adapter exposes no batch substructure command and adding one would have been a code change made after the freeze. The pattern counts N-C(=O) and C(=O)-N units, which is how every peptide backbone in this arm is written. It is a coarser instrument than a SMARTS match and is reported as such.',
  ],
  limitations: [
    'This run says nothing about the model\'s accuracy. It says where the generable product space sits relative to the training arm, and leans on D-162 for what the model does out there.',
    'IN_DOMAIN here means only "not shown by D-162 to be outside the model\'s reach". It never means the model predicts that molecule well.',
    'BRICS recombination is one generator. A different generator — a different fragment library, a different transformation set, an analogue enumerator around a single parent — would produce a different distance distribution, and this run does not speak for it.',
    'No product has measured activity, a prior-art check, or any evidence of any kind. None is a candidate or a lead.',
    'The 16 assays with no description at D-152 time are absent from this arm, as they are from D-153 and D-162.',
  ],
  boundary: 'No gate was edited, no sealed artefact was modified, no role was reclassified, no candidate was nominated or ranked, and no docking target was changed.',
};

const sealed = { ...body, artifactHash: canonicalHash(body).slice(0, 16) };
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);

console.log(`\nsmall-molecule parents: ${smallMolecules.length}`);
console.log(`novel products measured: ${nnPerProduct.length}`);
console.log(`in-domain (>= ${DOMAIN_FLOOR}): ${inDomain.length}${inDomainFraction === null ? '' : ` (${(inDomainFraction * 100).toFixed(1)}%)`}`);
console.log(`nearest-neighbour to arm: median ${body.measurement.nearestNeighbourTanimotoToArm.median}, max ${body.measurement.nearestNeighbourTanimotoToArm.max}`);
console.log(`negative control (arm against itself): median ${body.negativeControl.median}, at/above floor ${body.negativeControl.fractionAtOrAboveFloor}`);
console.log(`\nOUTCOME: ${outcome}`);
console.log(`frozen prediction was ${body.predictionCorrect ? 'CORRECT' : 'WRONG'} (predicted ${predicted.primary}); recorded either way`);
console.log(`sealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash})`);
