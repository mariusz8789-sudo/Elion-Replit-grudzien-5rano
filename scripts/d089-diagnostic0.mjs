#!/usr/bin/env node
/**
 * D-089 DIAGNOSTIC-0 — measure the bottleneck BEFORE choosing a strategy.
 *
 * Seven measurements on the frozen GLP-1R pin. NO model is selected, NO
 * representation is chosen, NO test row is read, and NO attempt from the D-088
 * budget is consumed. The point is to let the DATA say which bottleneck is
 * real, instead of picking the strategy that sounds most promising.
 *
 * ======================== THE TEST SPLIT IS NOT TOUCHED ==================
 *
 * The learning curve is computed on the CALIBRATION split, never on test.
 * A learning curve read off the test set would be four more test reads, which
 * is precisely the repeated-peeking the preregistration forbids — and it would
 * quietly invalidate the single, already-spent test read of D-088.
 *
 * Every metric carries its source, method and whether it was measured. A
 * quantity this runtime cannot compute is reported NOT_MEASURED, never
 * estimated.
 */

import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { loadGlp1rPin } from '../packages/backend/src/campaign/glp1rDataset.mjs';
import { loadGlp1rValidationGate, GLP1R_GATE_PATH, scaffoldSplit } from '../packages/backend/src/campaign/glp1rQsar.mjs';
import { detect as rdkitDetect, fingerprintBatch, descriptorsBatch, peptideParseBatch } from '../packages/backend/src/compute/rdkitAdapter.mjs';
import { tanimoto } from '../packages/backend/src/campaign/clusterSplit.mjs';
import { descriptorVector, fitStandardization, applyStandardization, denseRidge, densePredict, representationVector } from '../packages/backend/src/campaign/glp1rQsarV2.mjs';

const M = [];
const measured = (id, value, { unit = null, method, source }) => { M.push({ id, status: 'MEASURED', value, unit, method, source }); return value; };
const notMeasured = (id, reason, { source }) => { M.push({ id, status: 'NOT_MEASURED', value: null, reason, source }); return null; };
const q = (sorted, p) => sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];

console.log('=== D-089 DIAGNOSTIC-0 (measurement only; no model, no test read) ===\n');

const rd = rdkitDetect();
const pin = loadGlp1rPin();
if (!pin.ok) { console.log(`ABORT: pin not verified (${pin.code})`); process.exit(1); }
const gate = loadGlp1rValidationGate(GLP1R_GATE_PATH);
const SRC = `glp1rActivity.json@${pin.contentSha256.slice(0, 16)}`;
console.log(`dataset pin        : ${pin.rows.length} rows, sha256 ${pin.contentSha256.slice(0, 16)}...`);
console.log(`frozen gate        : ${gate.ok ? gate.ruleFingerprint : gate.code}  (MIN_R2=${gate.ok ? gate.gate.MIN_R2 : '?'} — canonical 0.25, NOT 25)`);
console.log(`RDKit              : ${rd.available ? `LIVE ${rd.version}` : 'UNAVAILABLE'}\n`);

const smiles = pin.rows.map((r) => r.canonicalSmiles);
const fps = fingerprintBatch(smiles);
const descs = descriptorsBatch(smiles);
const pep = peptideParseBatch(smiles);
const okIdx = smiles.map((_, i) => i).filter((i) => fps.results?.[i]?.ok);

/* ------------------------------------------------- 1-2. SCAFFOLD DIVERSITY */
const scaffolds = okIdx.map((i) => fps.results[i].scaffold);
const counts = new Map();
for (const s of scaffolds) counts.set(s, (counts.get(s) ?? 0) + 1);
const sortedCounts = [...counts.values()].sort((a, b) => b - a);
const uniqueScaffolds = measured('unique_murcko_scaffolds', counts.size, { method: 'RDKit Murcko scaffold via fingerprintBatch', source: SRC });
const top10 = sortedCounts.slice(0, 10).reduce((a, b) => a + b, 0);
const top10Frac = measured('top10_scaffold_concentration', +(top10 / scaffolds.length).toFixed(4), { unit: 'fraction of rows', method: 'sum of 10 largest scaffold classes / usable rows', source: SRC });
measured('largest_single_scaffold_fraction', +((sortedCounts[0] ?? 0) / scaffolds.length).toFixed(4), { unit: 'fraction', method: 'largest scaffold class / usable rows', source: SRC });

/* -------------------------------------------------------- 3. PEPTIDE-LIKE */
let peptideLike;
if (pep?.ok) {
  const RESIDUE_MIN = 6; // a hexapeptide or longer is unambiguously peptidic
  const n = okIdx.filter((i) => (pep.results?.[i]?.data?.residueEstimate ?? 0) >= RESIDUE_MIN).length;
  peptideLike = measured('peptide_like_fraction', +(n / okIdx.length).toFixed(4), { unit: 'fraction', method: `RDKit batch_peptide_parse, residueEstimate >= ${RESIDUE_MIN}`, source: SRC });
} else {
  peptideLike = notMeasured('peptide_like_fraction', 'RDKit peptide parse unavailable', { source: SRC });
}

/* ------------------------------------------- 4. NEAREST-NEIGHBOUR SIMILARITY */
const bitsOf = okIdx.map((i) => fps.results[i].bits);
const nn = [];
for (let a = 0; a < bitsOf.length; a += 1) {
  let best = 0;
  for (let b = 0; b < bitsOf.length; b += 1) {
    if (a === b) continue;
    const t = tanimoto(bitsOf[a], bitsOf[b]);
    if (t > best) best = t;
  }
  nn.push(best);
}
const nnSorted = [...nn].sort((x, y) => x - y);
measured('nn_similarity_median', +(q(nnSorted, 0.5) ?? 0).toFixed(4), { method: 'max Tanimoto to any other molecule (ECFP4 bits)', source: SRC });
const nnP95 = measured('nn_similarity_p95', +(q(nnSorted, 0.95) ?? 0).toFixed(4), { method: 'p95 of per-molecule max Tanimoto', source: SRC });
measured('fraction_with_nn_above_0.7', +(nn.filter((x) => x >= 0.7).length / nn.length).toFixed(4), { unit: 'fraction', method: 'share of molecules with a >=0.7 Tanimoto neighbour', source: SRC });

/* -------------------------------------- 5. NOISE FLOOR vs ENDPOINT DISAGREEMENT

   A FIRST VERSION OF THIS BLOCK WAS WRONG AND THE ERROR MATTERED. It grouped
   replicates by canonicalSmiles ALONE and reported a median SD of 1.1212
   pActivity across 67 "replicated" molecules, which reads as a label-noise
   floor above the frozen MAX_MAE of 1.0 — i.e. "the gate is below the noise,
   no model can pass". That conclusion would have been wrong.

   Grouping by molecule alone puts a molecule's EC50 (functional potency) and
   its IC50 (binding affinity) in the same bucket and calls their difference
   noise. They are different physical quantities. Splitting the two apart:

     same molecule + SAME standardType, >=2 distinct assays  -> TRUE replicates
     same molecule + DIFFERENT standardType                  -> endpoint disagreement

   Both are reported below, separately, and the replicate count is reported
   with its power caveat rather than a median quoted off a handful of groups.
*/
const sameEndpoint = new Map();
const byMolAllTypes = new Map();
for (const r of pin.rows) {
  const k = `${r.canonicalSmiles}|${r.standardType}`;
  if (!sameEndpoint.has(k)) sameEndpoint.set(k, []);
  sameEndpoint.get(k).push(r);
  if (!byMolAllTypes.has(r.canonicalSmiles)) byMolAllTypes.set(r.canonicalSmiles, []);
  byMolAllTypes.get(r.canonicalSmiles).push(r);
}

const sdOf = (vals) => {
  const mu = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.sqrt(vals.reduce((a, b) => a + (b - mu) ** 2, 0) / (vals.length - 1));
};

const replicateSDs = [];
for (const [, rows] of sameEndpoint) {
  if (rows.length < 2 || new Set(rows.map((r) => r.assayId)).size < 2) continue;
  replicateSDs.push(sdOf(rows.map((r) => r.pActivity)));
}
const MIN_GROUPS_FOR_NOISE_FLOOR = 20;
measured('true_replicate_groups', replicateSDs.length, { method: 'same canonicalSmiles AND same standardType, measured under >=2 distinct assayId', source: SRC });
let noiseFloor;
if (replicateSDs.length >= MIN_GROUPS_FOR_NOISE_FLOOR) {
  const s = [...replicateSDs].sort((a, b) => a - b);
  noiseFloor = measured('true_replicate_sd_median', +(q(s, 0.5) ?? 0).toFixed(4), { unit: 'pActivity', method: 'median per-molecule SD across distinct assays, WITHIN one endpoint type', source: SRC });
} else {
  noiseFloor = notMeasured('true_replicate_sd_median', `only ${replicateSDs.length} same-endpoint replicate group(s) exist (floor for a usable estimate: ${MIN_GROUPS_FOR_NOISE_FLOOR}); a median quoted off this many groups would not be a noise floor, it would be an anecdote`, { source: SRC });
}

const crossEndpointDiffs = [];
for (const [, rows] of byMolAllTypes) {
  const types = new Set(rows.map((r) => r.standardType));
  if (types.size < 2) continue;
  const perType = [...types].map((t) => {
    const v = rows.filter((r) => r.standardType === t).map((r) => r.pActivity);
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  crossEndpointDiffs.push(Math.max(...perType) - Math.min(...perType));
}
measured('molecules_with_multiple_endpoint_types', crossEndpointDiffs.length, { method: 'same canonicalSmiles carrying >=2 distinct standardType', source: SRC });
let endpointGap;
if (crossEndpointDiffs.length >= 10) {
  const d = [...crossEndpointDiffs].sort((a, b) => a - b);
  endpointGap = measured('cross_endpoint_gap_median', +(q(d, 0.5) ?? 0).toFixed(4), { unit: 'pActivity', method: 'median |mean(EC50) - mean(IC50/Ki)| for molecules measured on both — DISAGREEMENT BETWEEN QUANTITIES, not noise', source: SRC });
} else {
  endpointGap = notMeasured('cross_endpoint_gap_median', `only ${crossEndpointDiffs.length} molecule(s) carry two endpoint types`, { source: SRC });
}
notMeasured('publication_overlap_pmid', 'the frozen pin carries no PMID/publication field (fields: canonicalSmiles, moleculeId, targetId, targetOrganism, assayId, standardType, standardValue, standardUnits, pActivity, pchemblValue, sourceId, sourceUrl, sourceKind, fetchedAt) — PMID-level duplicate detection against an extension is NOT possible from this pin alone', { source: SRC });

/* ---------------------------------------- 6. ENDPOINT-FAMILY HETEROGENEITY */
const byType = new Map();
for (const r of pin.rows) byType.set(r.standardType, (byType.get(r.standardType) ?? 0) + 1);
measured('endpoint_type_count', byType.size, { method: 'distinct standardType values in the pin', source: SRC });
const typeBreakdown = [...byType.entries()].sort((a, b) => b[1] - a[1]);
measured('endpoint_dominant_fraction', +((typeBreakdown[0]?.[1] ?? 0) / pin.rows.length).toFixed(4), { unit: 'fraction', method: 'largest standardType class / rows', source: SRC });

/* --------------------------- 7. LEARNING CURVE — ON CALIBRATION, NEVER TEST */
const rows = [];
for (const i of okIdx) {
  const de = descs.results?.[i];
  if (!de?.ok) continue;
  const dv = descriptorVector(smiles[i], de.data);
  if (!dv.ok) continue;
  rows.push({ canonicalSmiles: smiles[i], scaffold: fps.results[i].scaffold, bits: fps.results[i].bits, raw: dv.vector, y: pin.rows[i].pActivity });
}
const { train, calib } = scaffoldSplit(rows);
const std = fitStandardization(train.map((r) => r.raw));
const stdOf = new Map(rows.map((r) => [r.canonicalSmiles, applyStandardization(r.raw, std)]));
const vec = (r) => representationVector('C', r.bits, stdOf.get(r.canonicalSmiles));
const lambda = gate.ok ? (gate.gate.lambda ?? 1.0) : 1.0;
const curve = [];
for (const frac of [0.25, 0.5, 0.75, 1.0]) {
  const n = Math.max(2, Math.round(train.length * frac));
  const w = denseRidge(train.slice(0, n).map((r) => ({ x: vec(r), y: r.y })), lambda);
  const mae = calib.reduce((a, r) => a + Math.abs(r.y - densePredict(w, vec(r))), 0) / Math.max(1, calib.length);
  curve.push({ nTrain: n, calibMAE: +mae.toFixed(4) });
}
measured('learning_curve_calibration', curve, { unit: 'calibMAE by nTrain', method: 'representation C (the D-088 selection), ridge lambda from the frozen gate, evaluated on CALIBRATION — the test split is never read', source: SRC });
const lastDelta = +(curve[curve.length - 2].calibMAE - curve[curve.length - 1].calibMAE).toFixed(4);
measured('learning_curve_final_slope', lastDelta, { unit: 'calibMAE improvement over the last 25% of training data', method: 'curve[-2].calibMAE - curve[-1].calibMAE; >0 means still improving', source: SRC });

/* ------------------------------------------------------------- REPORT */
console.log('MEASUREMENTS');
for (const m of M) {
  const v = m.status === 'MEASURED' ? (Array.isArray(m.value) ? JSON.stringify(m.value) : String(m.value)) : `NOT_MEASURED (${m.reason})`;
  console.log(`  ${m.id.padEnd(34)} ${v}${m.unit ? ` ${m.unit}` : ''}`);
}

const record = {
  diagnosticId: 'D-089-DIAGNOSTIC-0',
  datasetPin: pin.contentSha256,
  datasetRows: pin.rows.length,
  usableRows: okIdx.length,
  gateRuleFingerprint: gate.ok ? gate.ruleFingerprint : null,
  rdkitVersion: rd.version ?? null,
  testSplitRead: false,
  attemptBudgetConsumed: 0,
  measurements: M,
};
record.diagnosticFingerprint = canonicalHash(record).slice(0, 16);

console.log('\n--- INTERPRETATION (stated as implications, not conclusions) ---');
console.log(`  scaffold diversity : ${uniqueScaffolds} unique scaffolds over ${okIdx.length} usable rows; top-10 classes hold ${(top10Frac * 100).toFixed(1)}% of rows`);
console.log(`  peptide fraction   : ${peptideLike === null ? 'NOT_MEASURED' : `${(peptideLike * 100).toFixed(1)}% are >=6-residue peptides`}`);
console.log(`  neighbourhood      : p95 nearest-neighbour Tanimoto ${nnP95}`);
console.log(`  true noise floor   : ${noiseFloor === null || noiseFloor === undefined ? 'NOT_MEASURED — too few same-endpoint replicates' : `${noiseFloor} pActivity`}`);
console.log(`  endpoint gap       : ${endpointGap === null ? 'NOT_MEASURED' : `${endpointGap} pActivity between EC50 and IC50/Ki for the SAME molecule`}`);
console.log(`  learning curve     : ${curve.map((c) => `${c.nTrain}:${c.calibMAE}`).join('  ')}`);
console.log(`  final slope        : ${lastDelta > 0 ? `${lastDelta} still improving` : `${lastDelta} flat/worsening`}`);
console.log(`\ndiagnosticFingerprint: ${record.diagnosticFingerprint}`);
console.log(`testSplitRead        : ${record.testSplitRead}   attemptBudgetConsumed: ${record.attemptBudgetConsumed}`);
